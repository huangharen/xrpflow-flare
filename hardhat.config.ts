import hardhatEthersPlugin from "@nomicfoundation/hardhat-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.25",
        preferWasm: true,
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 },
        },
      },
      production: {
        version: "0.8.25",
        preferWasm: true,
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 1000 },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    coston2: {
      type: "http",
      chainType: "l1",
      chainId: 114,
      url: "https://coston2-api.flare.network/ext/C/rpc",
      accounts: [configVariable("COSTON2_PRIVATE_KEY")],
    },
  },
});
