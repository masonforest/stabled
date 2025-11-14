import { network } from "hardhat";

const { ethers } = await network.connect({
  // network: "core",
});

async function main() {
  let [signer] = await ethers.getSigners();
  let initialPrice = ethers.parseEther("1097");
  const CheckBook = await ethers.getContractFactory("CheckBook2");
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await ethers.provider.getFeeData();
  const checkBook = await CheckBook.deploy(
    "0x917af46b3c3c6e1bb7286b9f59637fb7c65851fb",
    initialPrice,
    {
      maxFeePerGas,
      maxPriorityFeePerGas,
    }
  );
  await checkBook.waitForDeployment();
  console.log(checkBook.target);
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
  // console.log(tx.hash);

  console.log(checkBook.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
