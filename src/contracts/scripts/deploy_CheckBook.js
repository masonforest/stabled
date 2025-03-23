const hre = require("hardhat");

async function main() {
  [signer] = await ethers.getSigners();
  const BbUSD = await hre.ethers.getContractFactory("BbUSD");
  const bbUSD = await BbUSD.attach(
    "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
  );
  const CheckBook = await hre.ethers.getContractFactory("CheckBook");
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await hre.ethers.provider.getFeeData();
  const checkBook = await CheckBook.deploy({
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await checkBook.waitForDeployment();
  console.log(checkBook.target)
  let tx = await bbUSD.preApprove(checkBook.target, {
    maxFeePerGas,
    maxPriorityFeePerGas,

  });
  // let tx2 = await signer.sendTransaction({
  //   to: checkBook.target,
  //   value: ethers.parseEther("0.01"),
  //   maxFeePerGas,
  //   maxPriorityFeePerGas,
  // });
  // console.log("tx2")
  // console.log(tx2.hash);
  console.log(tx.hash)

  console.log(checkBook.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
