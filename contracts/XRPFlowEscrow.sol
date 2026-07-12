// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Minimal FTSOv2 interface used by XRPFlow.
/// @dev getFeedByIdInWei is payable and intentionally not marked view by Flare.
interface IFtsoV2 {
    function getFeedByIdInWei(bytes21 feedId)
        external
        payable
        returns (uint256 value, uint64 timestamp);
}

/// @title XRPFlowEscrow
/// @notice Schedules USD-denominated payments that settle in FTestXRP/FXRP
///         using the Flare FTSOv2 XRP/USD price at execution time.
/// @dev The contract has no owner and no administrative withdrawal path.
contract XRPFlowEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes21 public constant XRP_USD_FEED_ID =
        0x015852502f55534400000000000000000000000000;
    uint256 public constant MAX_PRICE_AGE = 5 minutes;
    uint8 public constant PAYMENT_TOKEN_DECIMALS = 6;

    enum Status {
        None,
        Scheduled,
        Paid,
        Cancelled,
        Refunded
    }

    struct Payment {
        address payer;
        address recipient;
        uint128 usdAmount6;
        uint128 escrowedFxrp6;
        uint64 dueAt;
        uint64 expiresAt;
        Status status;
        bytes32 referenceHash;
    }

    error ZeroAddress();
    error ZeroAmount();
    error UnsupportedTokenDecimals(uint8 actual);
    error InvalidSchedule();
    error AmountTooLarge();
    error PaymentNotFound(uint256 paymentId);
    error InvalidStatus(uint256 paymentId, Status actual);
    error NotPayer(address caller);
    error PaymentNotDue(uint64 dueAt);
    error PaymentAlreadyDue(uint64 dueAt);
    error PaymentExpired(uint64 expiresAt);
    error PaymentNotExpired(uint64 expiresAt);
    error OracleInvalidPrice();
    error OracleFutureTimestamp(uint64 timestamp);
    error OracleStale(uint64 timestamp);
    error InsufficientEscrow(uint256 required, uint256 available);

    event PaymentCreated(
        uint256 indexed paymentId,
        address indexed payer,
        address indexed recipient,
        uint256 usdAmount6,
        uint256 escrowedFxrp6,
        uint64 dueAt,
        uint64 expiresAt,
        bytes32 referenceHash
    );
    event PaymentToppedUp(uint256 indexed paymentId, uint256 amount, uint256 newEscrowedFxrp6);
    event PaymentPaid(
        uint256 indexed paymentId,
        uint256 paidFxrp6,
        uint256 refundedFxrp6,
        uint256 xrpUsdPriceWad,
        uint64 oracleTimestamp
    );
    event PaymentCancelled(uint256 indexed paymentId, uint256 refundedFxrp6);
    event PaymentRefunded(uint256 indexed paymentId, uint256 refundedFxrp6);

    IERC20 public immutable paymentToken;
    IFtsoV2 public immutable ftsoV2;

    uint256 public nextPaymentId = 1;
    uint256 public totalEscrowedFxrp6;

    mapping(uint256 paymentId => Payment payment) private _payments;

    constructor(address paymentToken_, address ftsoV2_) {
        if (paymentToken_ == address(0) || ftsoV2_ == address(0)) revert ZeroAddress();
        uint8 decimals = IERC20Metadata(paymentToken_).decimals();
        if (decimals != PAYMENT_TOKEN_DECIMALS) revert UnsupportedTokenDecimals(decimals);

        paymentToken = IERC20(paymentToken_);
        ftsoV2 = IFtsoV2(ftsoV2_);
    }

    function createPayment(
        address recipient,
        uint256 usdAmount6,
        uint256 maxFxrpAmount6,
        uint64 dueAt,
        uint64 expiresAt,
        bytes32 referenceHash
    ) external nonReentrant returns (uint256 paymentId) {
        if (recipient == address(0)) revert ZeroAddress();
        if (usdAmount6 == 0 || maxFxrpAmount6 == 0) revert ZeroAmount();
        if (dueAt < block.timestamp || expiresAt <= dueAt) revert InvalidSchedule();
        if (usdAmount6 > type(uint128).max || maxFxrpAmount6 > type(uint128).max) {
            revert AmountTooLarge();
        }

        paymentId = nextPaymentId++;
        _payments[paymentId] = Payment({
            payer: msg.sender,
            recipient: recipient,
            usdAmount6: uint128(usdAmount6),
            escrowedFxrp6: uint128(maxFxrpAmount6),
            dueAt: dueAt,
            expiresAt: expiresAt,
            status: Status.Scheduled,
            referenceHash: referenceHash
        });
        totalEscrowedFxrp6 += maxFxrpAmount6;

        paymentToken.safeTransferFrom(msg.sender, address(this), maxFxrpAmount6);

        emit PaymentCreated(
            paymentId,
            msg.sender,
            recipient,
            usdAmount6,
            maxFxrpAmount6,
            dueAt,
            expiresAt,
            referenceHash
        );
    }

    function topUp(uint256 paymentId, uint256 additionalFxrp6) external nonReentrant {
        if (additionalFxrp6 == 0) revert ZeroAmount();
        Payment storage payment = _scheduledPayment(paymentId);
        if (msg.sender != payment.payer) revert NotPayer(msg.sender);
        if (block.timestamp > payment.expiresAt) revert PaymentExpired(payment.expiresAt);

        uint256 newEscrow = uint256(payment.escrowedFxrp6) + additionalFxrp6;
        if (newEscrow > type(uint128).max) revert AmountTooLarge();

        payment.escrowedFxrp6 = uint128(newEscrow);
        totalEscrowedFxrp6 += additionalFxrp6;
        paymentToken.safeTransferFrom(msg.sender, address(this), additionalFxrp6);

        emit PaymentToppedUp(paymentId, additionalFxrp6, newEscrow);
    }

    /// @notice Executes a due payment. Anyone can call this function.
    /// @dev Any msg.value is forwarded to FTSOv2 for feeds that carry a fee.
    function executePayment(uint256 paymentId) external payable nonReentrant {
        Payment storage payment = _scheduledPayment(paymentId);
        if (block.timestamp < payment.dueAt) revert PaymentNotDue(payment.dueAt);
        if (block.timestamp > payment.expiresAt) revert PaymentExpired(payment.expiresAt);

        (uint256 priceWad, uint64 oracleTimestamp) = _freshXrpUsdPrice(msg.value);
        uint256 requiredFxrp6 = _fxrpForUsd(payment.usdAmount6, priceWad);
        uint256 escrowedFxrp6 = payment.escrowedFxrp6;
        if (requiredFxrp6 > escrowedFxrp6) {
            revert InsufficientEscrow(requiredFxrp6, escrowedFxrp6);
        }

        uint256 refund = escrowedFxrp6 - requiredFxrp6;
        payment.status = Status.Paid;
        payment.escrowedFxrp6 = 0;
        totalEscrowedFxrp6 -= escrowedFxrp6;

        paymentToken.safeTransfer(payment.recipient, requiredFxrp6);
        if (refund != 0) paymentToken.safeTransfer(payment.payer, refund);

        emit PaymentPaid(paymentId, requiredFxrp6, refund, priceWad, oracleTimestamp);
    }

    function cancelPayment(uint256 paymentId) external nonReentrant {
        Payment storage payment = _scheduledPayment(paymentId);
        if (msg.sender != payment.payer) revert NotPayer(msg.sender);
        if (block.timestamp >= payment.dueAt) revert PaymentAlreadyDue(payment.dueAt);

        uint256 refund = payment.escrowedFxrp6;
        payment.status = Status.Cancelled;
        payment.escrowedFxrp6 = 0;
        totalEscrowedFxrp6 -= refund;
        paymentToken.safeTransfer(payment.payer, refund);

        emit PaymentCancelled(paymentId, refund);
    }

    /// @notice Returns an expired payment's escrow to its payer. Anyone may trigger it.
    function refundExpired(uint256 paymentId) external nonReentrant {
        Payment storage payment = _scheduledPayment(paymentId);
        if (block.timestamp <= payment.expiresAt) revert PaymentNotExpired(payment.expiresAt);

        uint256 refund = payment.escrowedFxrp6;
        payment.status = Status.Refunded;
        payment.escrowedFxrp6 = 0;
        totalEscrowedFxrp6 -= refund;
        paymentToken.safeTransfer(payment.payer, refund);

        emit PaymentRefunded(paymentId, refund);
    }

    function quoteFxrp(uint256 usdAmount6)
        external
        payable
        returns (uint256 requiredFxrp6, uint256 priceWad, uint64 oracleTimestamp)
    {
        if (usdAmount6 == 0) revert ZeroAmount();
        (priceWad, oracleTimestamp) = _freshXrpUsdPrice(msg.value);
        requiredFxrp6 = _fxrpForUsd(usdAmount6, priceWad);
    }

    function getPayment(uint256 paymentId) external view returns (Payment memory) {
        Payment memory payment = _payments[paymentId];
        if (payment.status == Status.None) revert PaymentNotFound(paymentId);
        return payment;
    }

    function isFullyBacked() external view returns (bool) {
        return paymentToken.balanceOf(address(this)) >= totalEscrowedFxrp6;
    }

    function _scheduledPayment(uint256 paymentId) private view returns (Payment storage payment) {
        payment = _payments[paymentId];
        if (payment.status == Status.None) revert PaymentNotFound(paymentId);
        if (payment.status != Status.Scheduled) revert InvalidStatus(paymentId, payment.status);
    }

    function _freshXrpUsdPrice(uint256 fee) private returns (uint256 priceWad, uint64 timestamp) {
        (priceWad, timestamp) = ftsoV2.getFeedByIdInWei{value: fee}(XRP_USD_FEED_ID);
        if (priceWad == 0 || timestamp == 0) revert OracleInvalidPrice();
        if (timestamp > block.timestamp) revert OracleFutureTimestamp(timestamp);
        if (block.timestamp - timestamp > MAX_PRICE_AGE) revert OracleStale(timestamp);
    }

    function _fxrpForUsd(uint256 usdAmount6, uint256 priceWad) private pure returns (uint256) {
        return Math.mulDiv(usdAmount6, 1e18, priceWad, Math.Rounding.Ceil);
    }
}
