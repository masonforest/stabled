import { network } from "hardhat";

const { ethers } = await network.connect({
  network: "core",
});
async function main() {
  let [signer] = await ethers.getSigners();
  const BbUSD = await ethers.getContractFactory("BbUSD");
  const FixedPriceEthExchange = await ethers.getContractFactory(
    "FixedPriceEthExchange",
  );
  const bbUSD = await BbUSD.attach(
    "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
  );

  const { maxFeePerGas, maxPriorityFeePerGas } =
    await ethers.provider.getFeeData();
  const fixedPriceEthExchange = await FixedPriceEthExchange.deploy({
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await fixedPriceEthExchange.waitForDeployment();
  await bbUSD.preApprove(fixedPriceEthExchange.target, {
    maxFeePerGas,
    maxPriorityFeePerGas,
  })
  await signer.sendTransaction({
    to: fixedPriceEthExchange.target,
    value: ethers.parseEther("0.25"),
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
