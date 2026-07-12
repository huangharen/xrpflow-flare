import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const EXPLORER = "https://coston2-explorer.flare.network";
const deploymentPath = path.resolve("deployments/coston2.json");

type Deployment = {
  address: string;
  chainId: number;
  verified?: boolean;
  verifiedAt?: string;
  [key: string]: unknown;
};

type BuildInfo = {
  solcLongVersion: string;
  input: {
    sources?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

const deployment = JSON.parse(
  await readFile(deploymentPath, "utf8"),
) as Deployment;

if (deployment.chainId !== 114 || !/^0x[0-9a-fA-F]{40}$/.test(deployment.address)) {
  throw new Error("deployments/coston2.json does not contain a valid Coston2 deployment.");
}

const buildInfoDir = path.resolve("artifacts/build-info");
const candidates = (await readdir(buildInfoDir))
  .filter((name) => name.endsWith(".json") && !name.endsWith(".output.json"))
  .sort()
  .reverse();

let buildInfo: BuildInfo | undefined;
for (const name of candidates) {
  const parsed = JSON.parse(
    await readFile(path.join(buildInfoDir, name), "utf8"),
  ) as BuildInfo;
  if (parsed.input?.sources?.["project/contracts/XRPFlowEscrow.sol"]) {
    buildInfo = parsed;
    break;
  }
}

if (!buildInfo) {
  throw new Error("Production build info for XRPFlowEscrow was not found. Run contracts:build first.");
}

const compilerVersion = `v${buildInfo.solcLongVersion}`;
const configResponse = await fetch(
  `${EXPLORER}/api/v2/smart-contracts/verification/config`,
);
if (!configResponse.ok) {
  throw new Error(`Explorer verification service returned HTTP ${configResponse.status}.`);
}

const config = (await configResponse.json()) as {
  solidity_compiler_versions?: string[];
  verification_options?: string[];
};
if (!config.solidity_compiler_versions?.includes(compilerVersion)) {
  throw new Error(`Explorer does not advertise compiler ${compilerVersion}.`);
}
if (!config.verification_options?.includes("standard-input")) {
  throw new Error("Explorer does not advertise Standard JSON verification.");
}

const form = new FormData();
form.set("compiler_version", compilerVersion);
form.set("contract_name", "XRPFlowEscrow");
form.set("autodetect_constructor_args", "true");
form.set("license_type", "mit");
form.set(
  "files[0]",
  new Blob([JSON.stringify(buildInfo.input)], { type: "application/json" }),
  "xrpflow-standard-input.json",
);

const verificationResponse = await fetch(
  `${EXPLORER}/api/v2/smart-contracts/${deployment.address}/verification/via/standard-input`,
  { method: "POST", body: form },
);
if (!verificationResponse.ok) {
  throw new Error(
    `Verification request failed with HTTP ${verificationResponse.status}: ${await verificationResponse.text()}`,
  );
}

const deadline = Date.now() + 90_000;
let verified = false;
while (Date.now() < deadline) {
  const detailsResponse = await fetch(
    `${EXPLORER}/api/v2/smart-contracts/${deployment.address}`,
  );
  if (detailsResponse.ok) {
    const details = (await detailsResponse.json()) as { is_verified?: boolean };
    if (details.is_verified) {
      verified = true;
      break;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 3_000));
}

if (!verified) {
  throw new Error("Explorer did not report the contract as verified within 90 seconds.");
}

deployment.verified = true;
deployment.verifiedAt = new Date().toISOString();
await writeFile(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`, "utf8");

console.log(`Verified: ${EXPLORER}/address/${deployment.address}?tab=contract`);
