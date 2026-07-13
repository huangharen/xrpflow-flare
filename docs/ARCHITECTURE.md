# XRPFlow architecture

## Scope

XRPFlow deliberately handles one narrow financial operation: a payer escrows a maximum amount of FTestXRP/FXRP for a one-time USD-denominated payment. At or after the due time, the escrow contract obtains a fresh XRP/USD price and settles the exact token amount. The payer receives unused reserve in the same transaction.

Minting FAssets, redeeming them back to their underlying asset, payroll batching, identity controls, and keeper automation are outside the first release.

## Components

### Web application

The application provides:

- EIP-1193 wallet discovery and connection;
- Coston2 network switching;
- live FTSOv2 XRP/USD reads through FlareContractRegistry;
- reserve estimation;
- FTestXRP approval and payment creation;
- explicit demo fallback when no compatible wallet is connected;
- responsive treasury, payment, activity, and settings views.

No private key is handled by the web application. Transactions are signed by the user's wallet.

### XRPFlowEscrow

The contract stores one record per payment:

| Field | Meaning |
| --- | --- |
| `payer` | Account funding the payment |
| `recipient` | Account receiving FTestXRP after settlement |
| `usdAmount6` | USD amount with six decimals |
| `escrowedFxrp6` | Maximum FTestXRP held for the payment |
| `dueAt` | Earliest execution time |
| `expiresAt` | Time after which anyone may trigger a refund to the payer |
| `status` | Scheduled, Paid, Cancelled, or Refunded |
| `referenceHash` | Hash of the offchain payment reference |

There is no shared internal treasury balance. That choice makes each liability directly traceable to escrowed assets and reduces accounting ambiguity.

### Flare data and assets

- **FTestXRP** is the Coston2 representation used for testing.
- **FlareContractRegistry** resolves the current FTSOv2 address.
- **FTSOv2 XRP/USD** supplies the value and observation timestamp used for settlement.

The contract rejects a quote when:

- the value is zero;
- the timestamp is zero;
- the timestamp is in the future;
- the quote is more than five minutes old.

## Conversion

Both USD and FTestXRP use six decimals in XRPFlow. FTSOv2 returns the XRP/USD value with 18 decimals.

```text
requiredFxrp6 = ceil(usdAmount6 × 1e18 ÷ xrpUsdPriceWad)
```

For a 100 USD payment at 2 USD/XRP:

```text
100,000,000 × 1e18 ÷ 2e18 = 50,000,000 = 50 FTestXRP
```

Upward rounding prevents the recipient from receiving less than the USD instruction because of integer truncation.

## State transitions

```text
Scheduled ── execute after due, before expiry ──> Paid
    │
    ├── payer cancels before due ──────────────> Cancelled
    │
    └── anyone triggers payer refund after expiry ─> Refunded
```

All transfers happen after the stored status and total escrow accounting are updated. A reentrancy guard protects every state-changing token flow.

## Reserve behavior

The payer chooses a maximum FTestXRP reserve. The interface proposes 105% of the current estimate, but the contract treats that amount as an explicit cap rather than a guarantee.

If XRP falls enough that the due payment needs more than the reserve, execution reverts. The payer can top up the existing payment and retry. The contract never silently pays a smaller amount.

## Trust and operational boundaries

- The deployer has no special authority after deployment.
- The application cannot move assets without wallet approval.
- Anyone may execute a due payment, so a future keeper does not require privileged access.
- The payer alone may cancel before the due time. After expiry, anyone may trigger the refund, which is always paid to the payer.
- A malicious or unsupported ERC-20 token is outside the model; deployment verifies a six-decimal payment token.
- Mainnet use requires deployment-specific review, monitoring, and independent audit.
