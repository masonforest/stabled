import { expect } from "chai";
import { network } from "hardhat";
const { ethers } = await network.connect();

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

  // console.log("domain", domain);
  // console.log("value", value);

  const signature = await signer.signTypedData(domain, types, value);
  const { v, r, s } = ethers.Signature.from(signature);

  return {
    v,
    r,
    s,
  };
};
describe("CheckBook2", function () {
  let erc20Permit: any, checkBook2: any, owner: any, alice: any, bob: any;

  beforeEach(async function () {
      let initialPrice = ethers.parseEther("1000");
    [owner, alice, bob] = await ethers.getSigners();

    const ERC20Permit = await ethers.getContractFactory("MockERC20Permit");
    erc20Permit = await ERC20Permit.deploy("MockToken", "MTK", 0n);
    const CheckBook2 = await ethers.getContractFactory("CheckBook2");
    checkBook2 = await CheckBook2.deploy(
      erc20Permit.target,
      initialPrice
    );
  });

  describe("fund and redeem check", function () {
    it("allows for transferring", async function () {
      await erc20Permit.mint(alice, ethers.parseEther("100"));
      // await erc20Permit.connect(alice).approve(checkBook2.target, ethers.MaxUint256);
      let check = ethers.Wallet.createRandom(ethers.provider);
      const userEthBalanceBefore = await ethers.provider.getBalance(
        alice.address,
      );
      const {v, r, s} = await signPermitV4({
        signer: alice,
        tokenAddress: erc20Permit.target,
        spender: checkBook2.target,
      });
      const userTokenBalanceBefore = await erc20Permit.balanceOf(alice.address);
      await checkBook2
        .connect(alice)
        .permitAndTransferTokensAndEth(
          check.address,
          100,
          ethers.MaxUint256,
          ethers.MaxUint256,
          v,
          r,
          s,
        {
          value: ethers.parseEther("0.04"),
          gasPrice:  ethers.parseUnits("5.1", "gwei"),
        },
      );
      const userTokenBalanceAfter = await erc20Permit.balanceOf(alice.address);
      expect(userTokenBalanceBefore - userTokenBalanceAfter).to.equal(
        20000000000000100n
      );
      // const userEthBalanceAfter = await ethers.provider.getBalance(
      //   alice.address,
      // );
      // const gasCost = 83491175944587n;
      // console.log(ethers.formatEther(gasCost));
      // console.log(ethers.formatEther(ethers.parseEther("0.0002")));
      // console.log(ethers.formatEther(userEthBalanceBefore - userEthBalanceAfter));
      // expect(userEthBalanceAfter).to.equal(
      //   userEthBalanceBefore - gasCost - ethers.parseEther("0.04"),
      // );
    //   await checkBook2.connect(check).redeemCheck(bob, new Uint8Array(), new Uint8Array());
      expect(await erc20Permit.balanceOf(check.address)).to.eq(100);
      const checkBalance = await ethers.provider.getBalance(
         check.address,
      );
      expect(checkBalance).to.eq(ethers.parseEther("0.00001"));
    });
  });
});
