# Two-minute demonstration

## Preparation

- Open the site at desktop width.
- Keep the Coston2 explorer open in another tab.
- Fund a dedicated demo payer wallet with C2FLR and FTestXRP. The contract has no administrator role.
- Confirm the bundled deployment opens as verified on Coston2 Explorer.
- Create one payment that is already ready to execute if the live demo will include settlement.

## Script

### 0:00–0:15 — Establish the product

“XRPFlow lets a team keep an XRP-based treasury while scheduling predictable USD payments. The payer sets a maximum reserve, and Flare’s FTSOv2 determines the actual FXRP settlement when the payment becomes due.”

Show the treasury balance, reserved funds, live XRP/USD quote, and Coston2 status.

### 0:15–0:50 — Schedule a payment

Open **New payment** and use:

- Recipient: `Kenji Sato`
- Amount: `250.00 USD`
- Reference: `July contributor payout`
- Due date: a future Coston2 timestamp

Point out the live quote, estimated settlement, maximum reserve, and five-percent cap. Continue to the review screen and approve both wallet transactions.

### 0:50–1:15 — Verify the instruction

Open the new payment and show:

- payer and recipient;
- USD amount;
- FTestXRP reserve;
- due and expiry behavior;
- creation transaction on the Coston2 explorer.

### 1:15–1:40 — Settle a due payment

Open a prepared payment in **Ready to claim** state and execute it. Show that the recipient gets the price-adjusted FTestXRP amount and the payer receives the unused reserve.

### 1:40–2:00 — Close with verifiability

Show **Activity** and **Settings**. Point out the resolved oracle, token address, chain ID, contract address, and explicit test-asset warning.

Closing line:

“The prototype keeps the promise narrow: transparent USD instructions, isolated XRP escrow, fresh Flare data, and no administrative custody.”

## Fallback

If the RPC or wallet is unavailable, use the labeled demo workspace. Do not imply the sample transaction hashes were produced in the current session. Explain the interruption once, show the complete UX, then use the bundled verified deployment and transaction links in `deployments/coston2-evidence.json`.
