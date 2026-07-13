# DoraHacks submission copy

Event: Flare Summer Signal Hackathon  
Bounty: Interoperable Asset Products  
Project: XRPFlow

## Short description

XRPFlow schedules USD-denominated treasury payments that settle in FTestXRP/FXRP using a fresh Flare FTSOv2 price, with isolated escrow and automatic reserve refunds.

## Target user

Remote-first studios, agencies, DAOs, and small global teams that hold an XRP-based treasury but agree contributor or vendor payments in USD terms.

## Product

XRPFlow lets a payer create an explicit USD payment instruction, escrow a maximum FTestXRP reserve, and settle the required token amount when the payment becomes due. Flare FTSOv2 supplies the execution-time XRP/USD price. Any unused reserve returns to the payer in the same transaction.

Each payment has its own payer, recipient, USD amount, reserve, due time, expiry, status, and reference hash. Anyone may execute a due instruction. Only the payer may cancel before it is due, and anyone may trigger an expired refund that always returns funds to the payer.

## Why Flare

The contract resolves FTSOv2 through `FlareContractRegistry` and reads the native XRP/USD feed at settlement time. The Coston2 prototype uses FTestXRP to prove the XRP-asset payment flow safely. XRPFlow does not claim to implement FAssets minting or redemption; those remain a separate lifecycle.

## What was built during the program

- The complete responsive treasury product and payment workflow.
- `XRPFlowEscrow`, including isolated liabilities, reserve top-ups, settlement, cancellation, expiry refunds, and backing checks.
- Coston2 wallet and event integration plus live FTSOv2 quote resolution.
- Thirteen contract behavior tests and two rendered-application checks.
- Standard JSON source verification and a live acceptance runner.
- Public Cloudflare Workers deployment, security notes, architecture, demo script, and submission evidence.

## Working links

- Application: https://xrpflow.huanghar.workers.dev
- GitHub: https://github.com/huangharen/xrpflow-flare
- Verified contract: https://coston2-explorer.flare.network/address/0xE6fCF19eb7Fc9Ba0C9515C1C0901d461260dcab9?tab=contract
- Deployment transaction: https://coston2-explorer.flare.network/tx/0x2ef24d60e80f5c6d941f18c88891196f7cec965ec9b77cb78f5105ed48d2a124
- Create: https://coston2-explorer.flare.network/tx/0xc15f0865d5f49eb65eab6023b17264dc7297c3006992ca0e7f70ed1b1ec89c21
- Execute: https://coston2-explorer.flare.network/tx/0x90dd1f065c70746c4f8a8c66d0df464c13f5de10cd1f067149d1afa52005943b
- Cancel: https://coston2-explorer.flare.network/tx/0x40a7de7c099399165d2364df22543dc2605bfa896a0ff87b742197d410340370
- Expiry refund: https://coston2-explorer.flare.network/tx/0x14d98236f811cfd761879323571e60cf79c9b6604733ab9964ab607a0ac0394d

## How to test

Open the application without a wallet to inspect the fully labeled demonstration workspace, live FTSOv2 quote, network configuration, and verified contract status. To exercise contract mode, connect an EIP-1193 wallet on Coston2. The repository also contains machine-readable deployment and successful transaction evidence under `deployments/`.

## Current status and traction

XRPFlow is a working Coston2 prototype. It does not claim production users, partner commitments, or mainnet volume. The current evidence is a verified deployment, successful end-to-end testnet transactions, a public application, and reproducible tests.

## Roadmap

1. Run a small remote-team treasury pilot and measure payment creation, settlement, and failed-execution recovery.
2. Add recurring instructions and optional permissionless keeper execution without adding an administrator withdrawal path.
3. Integrate the production FAssets lifecycle separately, then complete an external security review before any Flare Mainnet release.

## Team

Solo builder. Responsibilities cover product design, frontend implementation, Solidity development, testing, documentation, and deployment. GitHub: `huangharen`.

## Video

The event accepts a demo link, video, or working app link. XRPFlow supplies a public working application; a walkthrough video is an optional enhancement rather than a submission blocker.
