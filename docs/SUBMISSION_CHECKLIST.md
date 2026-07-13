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
- [ ] Optional manual QA with an installed EVM browser wallet is complete.
- [x] Live FTSOv2 quote resolves through FlareContractRegistry.
- [x] New payment validation handles invalid address, amount, date, stale quote, wallet rejection, and transaction failure.
- [x] Contract address and explorer links match the final deployment.
- [x] FTestXRP is never presented as production FXRP.

## Contract

- [x] `npm run contracts:build` succeeds.
- [x] `npm run test:contracts` passes.
- [x] Deployment uses a dedicated Coston2 wallet.
- [x] Source is verified on the Coston2 explorer.
- [x] Deployment address is bundled in the app and the submission page.
- [x] At least one create, execute, cancel, and expiry-refund transaction is recorded.
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
- [x] Coston2 contract and explorer URL are included.
- [x] The required demo/video/working-app field is satisfied by the public working app.
- [x] Architecture diagram is legible.
- [x] Team roles and work completed during the hackathon are stated.
- [x] Known limitations are stated.
- [ ] DoraHacks account is logged in and the final BUIDL form is submitted.

## Suggested short description

> XRPFlow schedules USD-denominated treasury payments that settle in FTestXRP/FXRP using a fresh Flare FTSOv2 price, with isolated escrow and automatic reserve refunds.
