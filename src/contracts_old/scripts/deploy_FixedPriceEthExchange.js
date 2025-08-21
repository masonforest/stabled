const hre = require("hardhat");

async function main() {
  [signer] = await ethers.getSigners();
  const BbUSD = await hre.ethers.getContractFactory("BbUSD");
  const FixedPriceEthExchange = await hre.ethers.getContractFactory(
    "FixedPriceEthExchange",
  );
  const bbUSD = await BbUSD.attach(
    "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
  );

  const { maxFeePerGas, maxPriorityFeePerGas } =
    await hre.ethers.provider.getFeeData();
  const fixedPriceEthExchange = await FixedPriceEthExchange.deploy({
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await fixedPriceEthExchange.waitForDeployment();
  await bbUSD.preApprove(fixedPriceEthExchange.target, {
    maxFeePerGas,
    maxPriorityFeePerGas,
  })
  await signer.sendTransaction({
    to: fixedPriceEthExchange.target,
    value: ethers.parseEther("0.25"),
  });
  console.log(fixedPriceEthExchange.target);

  // await signer.sendTransaction({
  //   to: fixedPriceEthExchange.target,
  //   value: ethers.parseEther("1"),
  //   maxFeePerGas,
  //   maxPriorityFeePerGas,
  // });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
