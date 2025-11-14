import { network } from "hardhat";

const { ethers } = await network.connect({
  // network: "core",
});
async function main() {
  let [signer] = await ethers.getSigners();
  let initialPrice = ethers.parseEther("1097.63860507");
  const AsUSDF = await ethers.getContractFactory("asUSDF");
  const asUSDF = await AsUSDF.attach(
    "0x917AF46B3C3c6e1Bb7286B9F59637Fb7C65851Fb",
  );
  const FixedPriceEthExchange = await ethers.getContractFactory(
  "FixedPriceEthExchange",
  );

  const { maxFeePerGas, maxPriorityFeePerGas } =
    await ethers.provider.getFeeData();
  const fixedPriceEthExchange = await FixedPriceEthExchange.deploy(
    asUSDF.target,
    initialPrice,
    {
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await fixedPriceEthExchange.waitForDeployment();
  // await bbUSD.preApprove(fixedPriceEthExchange.target, {
  //   maxFeePerGas,
  //   maxPriorityFeePerGas,
  // })
  await signer.sendTransaction({
    to: fixedPriceEthExchange.target,
    value: ethers.parseEther("0.00005"),
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
