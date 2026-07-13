import { network } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";

const CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
const FTEST_XRP = "0x0b6A3645c240605887a5532109323A3E12273dc7";

const registryAbi = [
  "function getContractAddressByName(string name) view returns (address)",
];

const tokenAbi = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const { ethers } = await network.create();
const [deployer] = await ethers.getSigners();
const connection = await ethers.provider.getNetwork();

if (connection.chainId !== 114n) {
  throw new Error(`Refusing to deploy on chain ${connection.chainId}; expected Coston2 (114).`);
}

const registry = new ethers.Contract(CONTRACT_REGISTRY, registryAbi, deployer);
const token = new ethers.Contract(FTEST_XRP, tokenAbi, deployer);
const [ftsoV2, symbol, decimals] = await Promise.all([
  registry.getContractAddressByName("FtsoV2") as Promise<string>,
  token.symbol() as Promise<string>,
  token.decimals() as Promise<bigint>,
]);

if (ftsoV2 === ethers.ZeroAddress) {
  throw new Error("FlareContractRegistry returned the zero address for FtsoV2.");
}

const ftsoV2Code = await ethers.provider.getCode(ftsoV2);
if (ftsoV2Code === "0x") {
  throw new Error(`FlareContractRegistry returned an address without code for FtsoV2: ${ftsoV2}`);
}

if (symbol !== "FTestXRP" || decimals !== 6n) {
  throw new Error(`Unexpected payment token metadata: ${symbol} / ${decimals} decimals.`);
}

console.log(`Deploying from ${deployer.address}`);
console.log(`Payment token: ${FTEST_XRP} (${symbol})`);
console.log(`FTSOv2: ${ftsoV2} (resolved through FlareContractRegistry)`);

const escrow = await ethers.deployContract("XRPFlowEscrow", [FTEST_XRP, ftsoV2]);
await escrow.waitForDeployment();
const address = await escrow.getAddress();
const transaction = escrow.deploymentTransaction();
const receipt = await transaction?.wait();
if (!receipt || receipt.status !== 1) {
  throw new Error("Deployment transaction did not complete successfully.");
}

console.log("");
console.log("XRPFlowEscrow deployed");
console.log(`Address: ${address}`);
console.log(`Transaction: ${transaction?.hash ?? "unknown"}`);
console.log(`Deployment block: ${receipt.blockNumber}`);
console.log(`Explorer: https://coston2-explorer.flare.network/address/${address}`);

await mkdir("deployments", { recursive: true });
await writeFile(
  "deployments/coston2.json",
  `${JSON.stringify(
    {
      network: "coston2",
      chainId: Number(connection.chainId),
      contract: "XRPFlowEscrow",
      address,
      transactionHash: transaction?.hash ?? null,
      deploymentBlock: receipt.blockNumber,
      deployer: deployer.address,
      paymentToken: FTEST_XRP,
      ftsoV2,
      explorer: `https://coston2-explorer.flare.network/address/${address}`,
      deployedAt: new Date().toISOString(),
      verified: false,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log("Deployment record: deployments/coston2.json");
console.log("");
console.log(`Set NEXT_PUBLIC_TREASURY_ADDRESS=${address} in your local .env file.`);
console.log(`Set NEXT_PUBLIC_TREASURY_DEPLOY_BLOCK=${receipt.blockNumber} in your local .env file.`);
