const hre = require("hardhat");

async function main() {
  const BbUSD = await hre.ethers.getContractFactory("BbUSD");
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await hre.ethers.provider.getFeeData();
  const bbUSD = await BbUSD.deploy({
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await bbUSD.waitForDeployment();
  console.log(bbUSD.target);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
