import { network } from "hardhat";

const { ethers } = await network.connect({
  // network: "core",
});


async function main() {
  let [signer] = await ethers.getSigners();
  const HDWalletMessenger = await ethers.getContractFactory("HDWalletMessenger");
  const hDWalletMessenger = await HDWalletMessenger.attach(
    "0xe35FCA78813F21a5a3abEf96e2e71A9d0bc059AC",
  );
  let initialPrice = ethers.parseEther("876");
  let transactionCost = ethers.parseEther("0.000008");
  const CheckBook = await ethers.getContractFactory("CheckBook");
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await ethers.provider.getFeeData();
  const checkBook = await CheckBook.deploy(
    "0x917af46b3c3c6e1bb7286b9f59637fb7c65851fb",
    initialPrice,
    transactionCost,
    hDWalletMessenger.target, {
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await checkBook.waitForDeployment();
  console.log(checkBook.target)
  // let tx = await bbUSD.preApprove(checkBook.target, {
  //   maxFeePerGas,
  //   maxPriorityFeePerGas,

  // });
  // let tx2 = await signer.sendTransaction({
  //   to: checkBook.target,
  //   value: ethers.parseEther("0.01"),
  //   maxFeePerGas,
  //   maxPriorityFeePerGas,
  // });
  // console.log("tx2")
  // console.log(tx2.hash);
  // console.log(tx.hash)

  console.log(checkBook.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
