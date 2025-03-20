const hre = require("hardhat");

async function main() {
  [signer] = await ethers.getSigners();
  const FixedPriceEthExchange = await hre.ethers.getContractFactory(
    "FixedPriceEthExchange"
  );
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await hre.ethers.provider.getFeeData();
  const fixedPriceEthExchange = await FixedPriceEthExchange.deploy(
    {
      maxFeePerGas,
      maxPriorityFeePerGas,
    }
  );
  await fixedPriceEthExchange.waitForDeployment();
  console.log(fixedPriceEthExchange.target);

  await signer.sendTransaction({
    to: fixedPriceEthExchange.target,
    value: ethers.parseEther("0.10"),
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
