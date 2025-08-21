import type { HardhatUserConfig } from "hardhat/config";

import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
// import hardhatVerify from "@nomicfoundation/hardhat-verify";
import { configVariable } from "hardhat/config";

const config: HardhatUserConfig = {
  plugins: [
    // hardhatVerify,
    hardhatToolboxMochaEthersPlugin
  ],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  core :{
      type: "http",
            // url: "https://rpc.coredao.org",
            url: "https://rpc.ankr.com/core",
            // url: "https://1rpc.io/core",
            accounts: ["0x61550363447fb00671f72ec4cf2b798ed9137c7e5996f48b1fdeda6a9eb23e6a"],
            //maxFeePerGas: 30000000000n,
            // maxPriorityFeePerGas: 30000000000n,
            gasPrice: 0,
        }
  },
  // verify: {
  //   etherscan: {
  //     apiKey: "YOUR_ETHERSCAN_API_KEY",
  //   },
  // },
};

export default config;
