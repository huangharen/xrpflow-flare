// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

contract MockFtsoV2 {
    uint256 public priceWad = 2e18;
    uint64 public timestamp;

    constructor() {
        timestamp = uint64(block.timestamp);
    }

    function setQuote(uint256 priceWad_, uint64 timestamp_) external {
        priceWad = priceWad_;
        timestamp = timestamp_;
    }

    function getFeedByIdInWei(bytes21)
        external
        payable
        returns (uint256 value, uint64 observedAt)
    {
        return (priceWad, timestamp);
    }
}
