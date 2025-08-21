const hre = require("hardhat");

async function main() {
  const BbUSD = await hre.ethers.getContractFactory("BbUSD");
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await hre.ethers.provider.getFeeData();
  const bbUSD = await BbUSD.attach(
    "0x8d72ecc9e4b7ac1b73988129d1c78da4e812f3a0",
  );
  // await bbUSD.waitForDeployment();
  console.log(bbUSD.target);

  await bbUSD.mint(
    "0x1d2AF03Faa33C04F94EA6950305A466d4F170507",
    ethers.parseEther("100"),
    {
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
  );

  await bbUSD.approve(
    "0xc3FB4e9d3D56b825084e71ED61f5D572d7dD4F75",
    ethers.parseEther("10000000"),
    {
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
