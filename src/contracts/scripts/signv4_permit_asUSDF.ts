import { network } from "hardhat";

const { ethers } = await network.connect({
  // network: "core",
});

const signPermitV4 = async function ({ signer, tokenAddress, spender }) {
  const provider = signer.provider;

  const abi = [
    "function name() view returns (string)",
    "function nonces(address) view returns (uint256)",
  ];
  const token = new ethers.Contract(tokenAddress, abi, provider);

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value = {
    owner: signer.address,
    spender: spender,
    value: ethers.MaxUint256,
    nonce: await token.nonces(signer.address),
    deadline: ethers.MaxUint256,
  };

  const chainId = (await provider.getNetwork()).chainId;
  const domain = {
    name: await token.name(),
    version: "1",
    chainId,
    verifyingContract: token.target,
  };

  console.log("domain", domain);
  console.log("value", value);

  const signature = await signer.signTypedData(domain, types, value);
  const { v, r, s } = ethers.Signature.from(signature);

  return {
    v,
    r,
    s,
  };
};

async function main() {
  let [signer] = await ethers.getSigners();
  const AsUSDF = await ethers.getContractFactory("asUSDF");
  const asUSDF = await AsUSDF.attach(
    "0x917af46b3c3c6e1bb7286b9f59637fb7c65851fb"
  );
  const FixedPriceEthExchange = await ethers.getContractFactory(
    "FixedPriceEthExchange"
  );
  const fixedPriceEthExchange = await FixedPriceEthExchange.attach(
    "0x0826310469A436769F48e0F9de3B1f9907d83a6e"
  );

  const { v, r, s } = await signPermitV4({
    signer,
    tokenAddress: asUSDF.target,
    spender: fixedPriceEthExchange.target,
  });
  let tx = await fixedPriceEthExchange.permit(
    // signer.address,
    // fixedPriceEthExchange.target,
    ethers.MaxUint256,
    ethers.MaxUint256,
    v,
    r,
    s,
    {
      gasLimit: 250000,
      gasPrice: ethers.parseUnits("0.051", "gwei"),
    }
  );
  console.log("permit tx hash:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
