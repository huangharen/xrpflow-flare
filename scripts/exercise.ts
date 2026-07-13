import { network } from "hardhat";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FTEST_XRP = "0x0b6A3645c240605887a5532109323A3E12273dc7";
const EXPLORER = "https://coston2-explorer.flare.network";
const USD_AMOUNT_6 = 100_000n;
const RECIPIENT = "0x1111111111111111111111111111111111111111";
const GAS_LIMIT = 500_000n;
const deploymentPath = path.resolve("deployments/coston2.json");

const deployment = JSON.parse(await readFile(deploymentPath, "utf8")) as {
  address: string;
  chainId: number;
};
if (deployment.chainId !== 114 || !/^0x[0-9a-fA-F]{40}$/.test(deployment.address)) {
  throw new Error("A valid deployments/coston2.json is required.");
}

const { ethers } = await network.create();
const [actor] = await ethers.getSigners();
const connected = await ethers.provider.getNetwork();
if (connected.chainId !== 114n) {
  throw new Error(`Refusing to exercise chain ${connected.chainId}; expected Coston2 (114).`);
}

const escrow = await ethers.getContractAt("XRPFlowEscrow", deployment.address, actor);
const token = new ethers.Contract(
  FTEST_XRP,
  [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ],
  actor,
);

const code = await ethers.provider.getCode(deployment.address);
if (code === "0x") throw new Error("The deployment address has no contract code.");
if ((await escrow.paymentToken()).toLowerCase() !== FTEST_XRP.toLowerCase()) {
  throw new Error("The deployed escrow uses an unexpected payment token.");
}

const [quotedFxrp6] = (await escrow.quoteFxrp.staticCall(USD_AMOUNT_6)) as [
  bigint,
  bigint,
  bigint,
];
const reserveFxrp6 = (quotedFxrp6 * 115n + 99n) / 100n;
const requiredBalance = reserveFxrp6 * 3n;
const tokenBalance = (await token.balanceOf(actor.address)) as bigint;
if (tokenBalance < requiredBalance) {
  throw new Error(
    `Need ${ethers.formatUnits(requiredBalance, 6)} FTestXRP, but the actor has ${ethers.formatUnits(tokenBalance, 6)}.`,
  );
}

const approveTx = await token.approve(deployment.address, requiredBalance, {
  gasLimit: GAS_LIMIT,
});
const approveReceipt = await approveTx.wait();
if (!approveReceipt || approveReceipt.status !== 1) throw new Error("Token approval failed.");

const latest = await ethers.provider.getBlock("latest");
if (!latest) throw new Error("Could not read the latest Coston2 block.");
const now = BigInt(latest.timestamp);

async function create(
  label: string,
  dueAt: bigint,
  expiresAt: bigint,
): Promise<{ id: bigint; hash: string }> {
  const id = (await escrow.nextPaymentId()) as bigint;
  const tx = await escrow.createPayment(
    RECIPIENT,
    USD_AMOUNT_6,
    reserveFxrp6,
    dueAt,
    expiresAt,
    ethers.id(`xrpflow-coston2-${label}`),
    { gasLimit: GAS_LIMIT },
  );
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${label} creation failed.`);
  return { id, hash: tx.hash };
}

async function waitUntilTimestamp(target: bigint): Promise<void> {
  while (true) {
    const block = await ethers.provider.getBlock("latest");
    if (block && BigInt(block.timestamp) > target) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

const paid = await create("paid", now + 15n, now + 180n);
const cancelled = await create("cancelled", now + 300n, now + 600n);
const expired = await create("expired", now + 15n, now + 35n);

const cancelTx = await escrow.cancelPayment(cancelled.id, { gasLimit: GAS_LIMIT });
const cancelReceipt = await cancelTx.wait();
if (!cancelReceipt || cancelReceipt.status !== 1) throw new Error("Cancellation failed.");

await waitUntilTimestamp(now + 20n);
const executeTx = await escrow.executePayment(paid.id, { gasLimit: GAS_LIMIT });
const executeReceipt = await executeTx.wait();
if (!executeReceipt || executeReceipt.status !== 1) throw new Error("Execution failed.");

await waitUntilTimestamp(now + 50n);
const refundTx = await escrow.refundExpired(expired.id, { gasLimit: GAS_LIMIT });
const refundReceipt = await refundTx.wait();
if (!refundReceipt || refundReceipt.status !== 1) throw new Error("Expiry refund failed.");

if (!(await escrow.isFullyBacked())) {
  throw new Error("Escrow backing invariant is false after the live scenario.");
}

const evidence = {
  network: "coston2",
  chainId: Number(connected.chainId),
  contract: deployment.address,
  actor: actor.address,
  recipient: RECIPIENT,
  usdAmount6: USD_AMOUNT_6.toString(),
  reserveFxrp6: reserveFxrp6.toString(),
  transactions: {
    approval: approveTx.hash,
    createPaid: paid.hash,
    executePaid: executeTx.hash,
    createCancelled: cancelled.hash,
    cancel: cancelTx.hash,
    createExpired: expired.hash,
    refundExpired: refundTx.hash,
  },
  explorer: `${EXPLORER}/address/${deployment.address}`,
  fullyBacked: true,
  completedAt: new Date().toISOString(),
};

await writeFile(
  "deployments/coston2-evidence.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(evidence, null, 2));
