# Security policy

## Reporting

Please do not disclose a suspected vulnerability in a public issue. Share a minimal reproduction privately with the project maintainers, including the affected commit, network, contract address, transaction hash, and expected impact.

Do not test against accounts or assets you do not control.

## Prototype status

XRPFlow is hackathon software. It has not received an independent security audit and must not be used with assets of real value.

The Coston2 deployment uses FTestXRP, which has no monetary value.

## Security properties

- No owner or administrative withdrawal function.
- Isolated escrow accounting for every payment.
- Safe ERC-20 transfer wrappers.
- Reentrancy protection on every token-moving path.
- Checks-effects-interactions ordering.
- Freshness and validity checks for every settlement quote.
- Upward rounding for recipient settlement.
- Explicit maximum reserve and top-up flow.
- Payer-only cancellation; permissionless expiry triggering with refunds fixed to the payer.
- Chain-ID and token-metadata checks in the deployment script.

## Known boundaries

- The model assumes the configured payment token follows standard ERC-20 behavior.
- FTSOv2 and FlareContractRegistry are external system dependencies.
- There is no keeper; a due payment requires a caller.
- References are hashes and do not prove the truth of an offchain invoice.
- The frontend demo workspace is not a chain indexer.
- Mainnet usage would require monitoring, incident procedures, verified deployment inputs, and an external audit.
