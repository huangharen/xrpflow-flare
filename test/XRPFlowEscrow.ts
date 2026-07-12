import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

const { ethers } = await network.create();

const USD = (value: string) => ethers.parseUnits(value, 6);
const FXRP = (value: string) => ethers.parseUnits(value, 6);
const PRICE = (value: string) => ethers.parseUnits(value, 18);

async function latestTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("Missing latest block");
  return block.timestamp;
}

async function moveTo(timestamp: number) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function expectCustomError(action: Promise<unknown>, name: string) {
  await assert.rejects(action, (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(name);
  });
}

async function deployFixture() {
  const [payer, recipient, stranger] = await ethers.getSigners();
  const token = await ethers.deployContract("MockERC20");
  const oracle = await ethers.deployContract("MockFtsoV2");
  const escrow = await ethers.deployContract("XRPFlowEscrow", [token.target, oracle.target]);

  await (await token.mint(payer.address, FXRP("10000"))).wait();
  await (await token.connect(payer).approve(escrow.target, ethers.MaxUint256)).wait();

  return { payer, recipient, stranger, token, oracle, escrow };
}

async function createPayment(options?: {
  usd?: string;
  reserve?: string;
  dueOffset?: number;
  expiryOffset?: number;
}) {
  const fixture = await deployFixture();
  const now = await latestTimestamp();
  const dueAt = now + (options?.dueOffset ?? 3600);
  const expiresAt = dueAt + (options?.expiryOffset ?? 30 * 24 * 60 * 60);
  const referenceHash = ethers.id("July contributor payout");

  await (
    await fixture.escrow.connect(fixture.payer).createPayment(
      fixture.recipient.address,
      USD(options?.usd ?? "100"),
      FXRP(options?.reserve ?? "55"),
      dueAt,
      expiresAt,
      referenceHash,
    )
  ).wait();

  return { ...fixture, now, dueAt, expiresAt, referenceHash, paymentId: 1n };
}

describe("XRPFlowEscrow", function () {
  it("escrows each payment and preserves the backing invariant", async function () {
    const { escrow, token, payer, recipient, dueAt, expiresAt, referenceHash } =
      await createPayment();

    const payment = await escrow.getPayment(1n);
    assert.equal(payment.payer, payer.address);
    assert.equal(payment.recipient, recipient.address);
    assert.equal(payment.usdAmount6, USD("100"));
    assert.equal(payment.escrowedFxrp6, FXRP("55"));
    assert.equal(payment.dueAt, BigInt(dueAt));
    assert.equal(payment.expiresAt, BigInt(expiresAt));
    assert.equal(payment.referenceHash, referenceHash);
    assert.equal(await escrow.totalEscrowedFxrp6(), FXRP("55"));
    assert.equal(await token.balanceOf(escrow.target), FXRP("55"));
    assert.equal(await escrow.isFullyBacked(), true);
  });

  it("quotes 100 USD at 2 USD/XRP as 50 FTestXRP", async function () {
    const { escrow, oracle } = await deployFixture();
    const now = await latestTimestamp();
    await (await oracle.setQuote(PRICE("2"), now)).wait();

    const [required, price, observedAt] = await escrow.quoteFxrp.staticCall(USD("100"));
    assert.equal(required, FXRP("50"));
    assert.equal(price, PRICE("2"));
    assert.equal(observedAt, BigInt(now));
  });

  it("rounds settlement up so the recipient is never underpaid", async function () {
    const { escrow, oracle } = await deployFixture();
    const now = await latestTimestamp();
    await (await oracle.setQuote(PRICE("3"), now)).wait();

    const [required] = await escrow.quoteFxrp.staticCall(USD("100"));
    assert.equal(required, 33_333_334n);
  });

  it("lets any caller settle and immediately refunds unused reserve", async function () {
    const { escrow, oracle, token, recipient, payer, stranger, dueAt, paymentId } =
      await createPayment();
    await moveTo(dueAt);
    await (await oracle.setQuote(PRICE("2"), dueAt)).wait();
    await (await escrow.connect(stranger).executePayment(paymentId)).wait();

    assert.equal(await token.balanceOf(recipient.address), FXRP("50"));
    assert.equal(await token.balanceOf(payer.address), FXRP("9950"));
    assert.equal(await token.balanceOf(escrow.target), 0n);
    assert.equal(await escrow.totalEscrowedFxrp6(), 0n);
    assert.equal((await escrow.getPayment(paymentId)).status, 2n);
  });

  it("blocks execution before the due time", async function () {
    const { escrow, paymentId } = await createPayment();
    await expectCustomError(escrow.executePayment(paymentId), "PaymentNotDue");
  });

  it("requires a top-up when XRP falls below the reserve assumption", async function () {
    const { escrow, oracle, token, payer, recipient, dueAt, paymentId } =
      await createPayment();
    await moveTo(dueAt);
    await (await oracle.setQuote(PRICE("1.5"), dueAt)).wait();

    await expectCustomError(escrow.executePayment(paymentId), "InsufficientEscrow");
    await (await escrow.connect(payer).topUp(paymentId, FXRP("20"))).wait();
    assert.equal(await escrow.totalEscrowedFxrp6(), FXRP("75"));
    await (await escrow.executePayment(paymentId)).wait();

    assert.equal(await token.balanceOf(recipient.address), 66_666_667n);
    assert.equal(await token.balanceOf(escrow.target), 0n);
  });

  it("rejects a top-up after expiry without changing escrow accounting", async function () {
    const { escrow, token, payer, paymentId, expiresAt } = await createPayment({
      expiryOffset: 600,
    });
    await moveTo(expiresAt + 1);

    await expectCustomError(
      escrow.connect(payer).topUp(paymentId, FXRP("1")),
      "PaymentExpired",
    );
    assert.equal((await escrow.getPayment(paymentId)).escrowedFxrp6, FXRP("55"));
    assert.equal(await escrow.totalEscrowedFxrp6(), FXRP("55"));
    assert.equal(await token.balanceOf(escrow.target), FXRP("55"));
  });

  it("lets only the payer cancel before the due time", async function () {
    const { escrow, token, payer, stranger, paymentId } = await createPayment();

    await expectCustomError(escrow.connect(stranger).cancelPayment(paymentId), "NotPayer");
    await (await escrow.connect(payer).cancelPayment(paymentId)).wait();

    assert.equal(await token.balanceOf(payer.address), FXRP("10000"));
    assert.equal(await escrow.totalEscrowedFxrp6(), 0n);
    await expectCustomError(escrow.connect(payer).cancelPayment(paymentId), "InvalidStatus");
  });

  it("lets anyone trigger an expired refund that always returns funds to the payer", async function () {
    const { escrow, token, payer, stranger, paymentId, expiresAt } = await createPayment({
      expiryOffset: 600,
    });
    await moveTo(expiresAt);
    await expectCustomError(
      escrow.connect(stranger).refundExpired.staticCall(paymentId),
      "PaymentNotExpired",
    );
    await moveTo(expiresAt + 1);
    await (await escrow.connect(stranger).refundExpired(paymentId)).wait();

    assert.equal(await token.balanceOf(payer.address), FXRP("10000"));
    assert.equal(await token.balanceOf(stranger.address), 0n);
    assert.equal(await token.balanceOf(escrow.target), 0n);
    assert.equal(await escrow.totalEscrowedFxrp6(), 0n);
    assert.equal((await escrow.getPayment(paymentId)).status, 4n);
  });

  it("uses non-overlapping due and expiry boundaries", async function () {
    const { escrow, oracle, token, payer, recipient, stranger, dueAt, expiresAt, paymentId } =
      await createPayment({ dueOffset: 60, expiryOffset: 60 });

    await (await oracle.setQuote(PRICE("2"), dueAt)).wait();
    await moveTo(dueAt);

    await expectCustomError(
      escrow.connect(payer).cancelPayment(paymentId),
      "PaymentAlreadyDue",
    );
    await escrow.connect(stranger).executePayment.staticCall(paymentId);

    const second = await createPayment({ dueOffset: 60, expiryOffset: 60 });
    await (await second.oracle.setQuote(PRICE("2"), second.expiresAt)).wait();
    await ethers.provider.send("evm_setNextBlockTimestamp", [second.expiresAt]);
    await (await second.escrow.connect(second.stranger).executePayment(second.paymentId)).wait();

    assert.equal(await token.balanceOf(recipient.address), 0n);
    assert.equal((await escrow.getPayment(paymentId)).status, 1n);
    assert.equal((await second.escrow.getPayment(second.paymentId)).status, 2n);
    assert.equal(await second.token.balanceOf(second.recipient.address), FXRP("50"));
    assert.equal(await second.escrow.totalEscrowedFxrp6(), 0n);
    assert.equal(expiresAt, dueAt + 60);
  });

  it("isolates multiple payments while preserving the aggregate backing invariant", async function () {
    const { escrow, oracle, token, payer, recipient, stranger } = await deployFixture();
    const now = await latestTimestamp();
    const dueAt = now + 3600;
    const expiresAt = dueAt + 600;

    await (
      await escrow.connect(payer).createPayment(
        recipient.address,
        USD("100"),
        FXRP("55"),
        dueAt,
        expiresAt,
        ethers.id("payment-one"),
      )
    ).wait();
    await (
      await escrow.connect(payer).createPayment(
        recipient.address,
        USD("200"),
        FXRP("125"),
        dueAt,
        expiresAt,
        ethers.id("payment-two"),
      )
    ).wait();

    assert.equal(await escrow.totalEscrowedFxrp6(), FXRP("180"));
    assert.equal(await token.balanceOf(escrow.target), FXRP("180"));
    assert.equal(await escrow.isFullyBacked(), true);

    await (await escrow.connect(payer).cancelPayment(1n)).wait();
    assert.equal(await escrow.totalEscrowedFxrp6(), FXRP("125"));
    assert.equal(await token.balanceOf(escrow.target), FXRP("125"));
    assert.equal((await escrow.getPayment(1n)).status, 3n);
    assert.equal((await escrow.getPayment(2n)).status, 1n);

    await moveTo(dueAt);
    await (await oracle.setQuote(PRICE("2"), dueAt)).wait();
    await (await escrow.connect(stranger).executePayment(2n)).wait();

    assert.equal(await token.balanceOf(recipient.address), FXRP("100"));
    assert.equal(await token.balanceOf(escrow.target), 0n);
    assert.equal(await escrow.totalEscrowedFxrp6(), 0n);
    assert.equal(await escrow.isFullyBacked(), true);
  });

  it("rejects zero, future, and stale oracle quotes", async function () {
    const { escrow, oracle } = await deployFixture();
    const now = await latestTimestamp();

    await (await oracle.setQuote(0n, now)).wait();
    await expectCustomError(escrow.quoteFxrp(USD("100")), "OracleInvalidPrice");

    await (await oracle.setQuote(PRICE("2"), now + 60)).wait();
    await expectCustomError(escrow.quoteFxrp(USD("100")), "OracleFutureTimestamp");

    await moveTo(now + 600);
    await (await oracle.setQuote(PRICE("2"), now)).wait();
    await expectCustomError(escrow.quoteFxrp(USD("100")), "OracleStale");
  });

  it("prevents repeated settlement", async function () {
    const { escrow, oracle, dueAt, paymentId } = await createPayment();
    await moveTo(dueAt);
    await (await oracle.setQuote(PRICE("2"), dueAt)).wait();
    await (await escrow.executePayment(paymentId)).wait();

    await expectCustomError(escrow.executePayment(paymentId), "InvalidStatus");
  });
});
