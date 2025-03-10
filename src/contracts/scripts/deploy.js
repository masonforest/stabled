// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {
  const BbUSD = await hre.ethers.getContractFactory("BbUSD");
  const feeData = await hre.ethers.provider.getFeeData();
  console.log(feeData)
  const bbUSD = await BbUSD.deploy({
    // gasPrice: 30000000000n,
    maxFeePerGas: 30000000000n,
    maxPriorityFeePerGas: 30000000000n
  });
await bbUSD.waitForDeployment();
console.log(bbUSD.target)
//   await bbUSD.deployed();

await (await hre.ethers.provider.getSigner()).sendTransaction({
    to: bbUSD.target,
    value: ethers.parseEther("0.05"),
    maxFeePerGas: 30000000000n,
    maxPriorityFeePerGas: 30000000000n
  })
  await bbUSD.mint("0x1d2AF03Faa33C04F94EA6950305A466d4F170507", ethers.parseEther("5"),
{
    maxFeePerGas: 30000000000n,
    maxPriorityFeePerGas: 30000000000n

}) 
//   console.log("BbUSD contract deployed to:", bbUSD.address);

//   console.log("call retrieve():", await bbUSD.retrieve())

//   console.log("call store(), set value to 100")
//   const tx = await bbUSD.store(100)
//   await tx.wait()
  
//   console.log("call retrieve() again:", await bbUSD.retrieve())
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});