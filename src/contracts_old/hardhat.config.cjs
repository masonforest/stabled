import "@nomicfoundation/hardhat-toolbox";

const ETHERSCAN_API_KEY = vars.get("ETHERSCAN_API_KEY");
import 'hardhat-abi-exporter';

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  abiExporter: {
    path: '../frontend/abi',
  },
  // solidity: "0.8.28",
  solidity: {
    compilers: [
      {
         version: '0.8.28',
         settings: {
            evmVersion: "paris",
            optimizer: {
               enabled: false,
               runs: 200,
            },
         },
      }
    ],
 },
  networks: {
      core: {
        // url: "https://rpc.coredao.org",
        url: "https://rpc.ankr.com/core",
        // url: "https://1rpc.io/core",
        accounts: ["0x61550363447fb00671f72ec4cf2b798ed9137c7e5996f48b1fdeda6a9eb23e6a"],
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 30000000000n,
        gasPrice: 0,
    }
  },
  etherscan: {
    apiKey: {
      testnet: "5d68b304fed149328ca1af5cc737272e",
      mainnet: "5d68b304fed149328ca1af5cc737272e"
    },
    customChains: [
      {
        network: "testnet",
        chainId: 1115,
        urls: {
          apiURL: "https://api.test.btcs.network/api",
          browserURL: "https://scan.test.btcs.network/"
        }
      },
      {
        network: "core",
        chainId: 1116,
        urls: {
          apiURL: "https://openapi.coredao.org/api",
          browserURL: "https://scan.coredao.org/"
        }
      }
    ]
},
};