const hre = require("hardhat");

async function main() {
  const HelloWorld = await hre.ethers.getContractFactory("HelloWorld");
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await hre.ethers.provider.getFeeData();
  const helloWorld = await HelloWorld.deploy({
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await helloWorld.waitForDeployment();
  console.log(helloWorld.target);

}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
