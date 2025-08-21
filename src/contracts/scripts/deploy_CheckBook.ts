import { network } from "hardhat";

const { ethers } = await network.connect({
  network: "core",
});


async function main() {
  let [signer] = await ethers.getSigners();
  const BbUSD = await ethers.getContractFactory("BbUSD");
  const bbUSD = await BbUSD.attach(
    "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
  );
  const HDWalletMessenger = await ethers.getContractFactory("HDWalletMessenger");
  const hDWalletMessenger = await HDWalletMessenger.attach(
    "0x6F39c7c97e5A095A595774e2D773fD253d1eD1a7",
  );
  const CheckBook = await ethers.getContractFactory("CheckBook");
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await ethers.provider.getFeeData();
  const checkBook = await CheckBook.deploy(bbUSD.target, hDWalletMessenger.target, {
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
