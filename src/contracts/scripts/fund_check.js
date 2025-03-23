const hre = require("hardhat");
const { HDNodeWallet } = require("ethers/wallet");
const { randomBytes } = require("@noble/hashes/utils");

async function main() {
  [owner, alice, bob] = await ethers.getSigners();
  const BbUSD = await hre.ethers.getContractFactory("BbUSD");
  const CheckBook = await hre.ethers.getContractFactory("CheckBook");
  const FixedPriceEthExchange = await hre.ethers.getContractFactory(
    "FixedPriceEthExchange",
  );
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await hre.ethers.provider.getFeeData();
  const bbUSD = await BbUSD.attach(
    "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
  );
  const checkBook = await CheckBook.attach(
    "0x92Ec2ac50CFeBea0A4AE6ce5df7DB0cC90FF42a9",
  );
  const fixedPriceEthExchange = await FixedPriceEthExchange.attach(
  "0xeee7616a6e44f8C91e4a52dB33B75B782Aa55f65",
  );

  await bbUSD.waitForDeployment();

  const checkSeed = randomBytes(16);
  const check = HDNodeWallet.fromSeed(checkSeed);
  const checkSeed2 = randomBytes(16);
  const check2 = HDNodeWallet.fromSeed(checkSeed2);
  // console.log(await bbUSD.balanceOf(owner.address))
  // console.log(owner.address)
  // let tx = await checkBook.setX(
  //   bbUSD.target,
  //   check.address,
  //   1n,
  // {
  //     maxFeePerGas,
  //     maxPriorityFeePerGas,
  //     value: ethers.parseEther("0.004"),

  // });
  // await bbUSD.approve(checkBook.target, ethers.MaxUint256)
  // await tx1.wait(1);
  let tx1 = await checkBook.fundCheck(
    bbUSD.target,
    check.address,
    1n,
  {
      maxFeePerGas,
      maxPriorityFeePerGas,
      value: ethers.parseEther("0.008"),

  });
  console.log(tx1)
  // console.log()
  let callData = await checkBook.interface.encodeFunctionData("fundCheck", [
    bbUSD.target,
    check2.address,
    1n,
  ]);
  // let callData = await checkBook.interface.encodeFunctionData("setX", [
  //   bbUSD.target,
  //   owner.address,
  //   1n
  // ]);
  // let callData = await checkBook.interface.encodeFunctionData("transferFrom", [
  //   bbUSD.target,
  //   fixedPriceEthExchange.target,
  //   1
  // ]);
  // console.log(checkBook.target)
  let tx = await fixedPriceEthExchange.connect(owner).buyEthAndCallWithTokens(
    bbUSD.target,
    bbUSD.target,
    1n,
    ethers.parseEther("0.008"),
    checkBook.target,
    callData,
    ethers.parseEther("0.008"),
    // 0,
    {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit: 250000,
      // value: ethers.parseEther("0.004"),
    },
  );
  console.log(tx)
  tx.wait(0);

  // let tx = await fixedPriceEthExchange.connect(owner).buyEthAndCall(
  //   bbUSD.target,
  //   ethers.parseEther("0.006"),
  //   checkBook.target,
  //   callData,
  //   ethers.parseEther("0.004"),
  //   // 0,
  //   {
  //     maxFeePerGas,
  //     maxPriorityFeePerGas,
  //     // value: ethers.parseEther("0.004"),
  //   },
  // );
  // let tx2 = await bbUSD.approve(
  //   fixedPriceEthExchange.target,
  //   ethers.MaxUint25,{
  //   maxFeePerGas,
  //   maxPriorityFeePerGas,
  // });
  // tx2.wait(0);

  // let tx = await checkBook.transferFrom(
  //   bbUSD.target,
  //   owner.address,
  //   1n,
  //   // 0,
  //   {
  //     maxFeePerGas,
  //     maxPriorityFeePerGas,
  //     // value: ethers.parseEther("0.004"),
  //   },
  // );

  // console.log(tx);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
