# Submission checklist

Target event: [Flare Summer Signal Hackathon](https://dorahacks.io/hackathon/flaresummersignal/detail)  
Track: Interoperable Asset Products  
Deadline: August 14, 2026  
Live site: https://xrpflow.huanghar.workers.dev
Public repository: https://github.com/huangharen/xrpflow-flare

## Product

- [x] Public site loads without authentication.
- [x] Desktop and mobile layouts are usable.
- [x] Demo records are visibly labeled.
- [ ] Wallet connection and Coston2 switching work.
- [x] Live FTSOv2 quote resolves through FlareContractRegistry.
- [x] New payment validation handles invalid address, amount, date, stale quote, wallet rejection, and transaction failure.
- [ ] Contract address and explorer links match the final deployment.
- [x] FTestXRP is never presented as production FXRP.

## Contract

- [x] `npm run contracts:build` succeeds.
- [x] `npm run test:contracts` passes.
- [ ] Deployment uses a dedicated Coston2 wallet.
- [ ] Source is verified on the Coston2 explorer.
- [ ] Deployment address is added to `.env` and the submission page.
- [ ] At least one create, execute, cancel, and expiry-refund transaction is recorded.
- [x] `isFullyBacked()` returns true across every contract behavior test flow.

## Repository

- [x] `npm run check` succeeds from a clean install.
- [x] `.env`, private keys, and wallet files are absent from Git.
- [x] README links are valid.
- [x] License and security policy are included.
- [x] Commit history distinguishes original work from imported dependencies.

## DoraHacks entry

- [x] One-sentence description is specific and non-promotional.
- [x] Problem, user, and Flare-specific mechanism are explained.
- [x] Public repository URL is included.
- [x] Public application URL is included.
- [ ] Coston2 contract and explorer URL are included.
- [ ] Two-minute video is uploaded.
- [x] Architecture diagram is legible.
- [x] Team roles and work completed during the hackathon are stated.
- [x] Known limitations are stated.

## Suggested short description

> XRPFlow schedules USD-denominated treasury payments that settle in FTestXRP/FXRP using a fresh Flare FTSOv2 price, with isolated escrow and automatic reserve refunds.
