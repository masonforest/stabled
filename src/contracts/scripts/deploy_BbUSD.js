const hre = require("hardhat");

async function main() {
  const BbUSD = await hre.ethers.getContractFactory("BbUSD");
  const FixedPriceEthExchange = await hre.ethers.getContractFactory(
    "FixedPriceEthExchange"
  );
  const fixedPriceEthExchange= FixedPriceEthExchange.attach("0xc4434F019De43Cd83Bb8a3bC1b3Bb7D9be4cAf2f")
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await hre.ethers.provider.getFeeData();
  const bbUSD = await BbUSD.deploy({
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await bbUSD.waitForDeployment();
  console.log(bbUSD.target);

  await bbUSD.mint("0xE9a2077F57191BFd81C25c4a249B98026622B7C3", ethers.parseEther("1"),{
    maxFeePerGas,
    maxPriorityFeePerGas,

  })
  await fixedPriceEthExchange.setPrice(bbUSD, ethers.parseEther("0.4363"),
    {
      maxFeePerGas,
      maxPriorityFeePerGas,

    }
  )
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
