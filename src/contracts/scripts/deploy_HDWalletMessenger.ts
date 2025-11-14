import { network } from "hardhat";

const { ethers } = await network.connect({
  // network: "core",
});
async function main() {
  let [signer] = await ethers.getSigners();
  const HDWalletMessenger = await ethers.getContractFactory("HDWalletMessenger");
  // const { maxFeePerGas, maxPriorityFeePerGas } =
  //   await ethers.provider.getFeeData();
  const hDWalletMessenger = await HDWalletMessenger.deploy({
    // maxFeePerGas,
    // maxPriorityFeePerGas,
  });
  await hDWalletMessenger.waitForDeployment();
  console.log(hDWalletMessenger.target)
  // let tx = await bbUSD.preApprove(hDWalletMessenger.target, {
  //   maxFeePerGas,
  //   maxPriorityFeePerGas,

  // });
  // let tx2 = await signer.sendTransaction({
  //   to: hDWalletMessenger.target,
  //   value: ethers.parseEther("0.01"),
  //   maxFeePerGas,
  //   maxPriorityFeePerGas,
  // });
  // console.log("tx2")
  // console.log(tx2.hash);
  // console.log(tx.hash)

  // console.log(hDWalletMessenger.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
