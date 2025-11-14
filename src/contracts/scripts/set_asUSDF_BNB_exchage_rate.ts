import { network } from "hardhat";

const { ethers } = await network.connect({
  // network: "core",
});
async function main() {
  const registryAddress = "0x1647a10D50e1Ebf84FF6E38e4c8dd1298E0E69cC"; //Testnet address
  //Pass the name or ABI of the contract
  const registry = await ethers.getContractAt("FeedRegistryInterface", registryAddress);
  const priceWithoutDecimals = await registry.latestAnswerByName("BTC", "USD");
  console.log("Answer for BTC/USD: ", priceWithoutDecimals.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
