// const { UInt32Schema } = require("bitcoinjs-lib/src/types");
// const { expect } = require("chai");
// const { formatEther, HDNodeWallet, UndecodedEventLog } = require("ethers");
import { network } from "hardhat";
const { ethers } = await network.connect();
import { expect } from "chai";

describe("FixedPriceEthExchange", function () {
  let bbUSD: any, checkBook: any, fixedPriceEthEthExchange: any, owner: any, alice: any, bob: any;
  let initialPrice = 50190000n;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    alice = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', ethers.provider)
    const HDWalletMessenger =
      await ethers.getContractFactory("HDWalletMessenger");
    let hDWalletMessenger = await HDWalletMessenger.deploy();

    const BbUSD = await ethers.getContractFactory("BbUSD");
    bbUSD = await BbUSD.deploy();
    
    const CheckBook = await ethers.getContractFactory("CheckBook");
    checkBook = await CheckBook.deploy(bbUSD.target, hDWalletMessenger.target);
    
    const FixedPriceEthExchange = await ethers.getContractFactory(
      "FixedPriceEthExchange",
    );
    fixedPriceEthEthExchange = await FixedPriceEthExchange.deploy();
    await fixedPriceEthEthExchange.setPrice(bbUSD.target, initialPrice);
    await bbUSD.preApprove(fixedPriceEthEthExchange.target);
    await bbUSD.preApprove(checkBook.target);
    await owner.sendTransaction({
      to: fixedPriceEthEthExchange.target,
      value: ethers.parseEther("1.04"),
    });
    await owner.sendTransaction({
      to: alice.address,
      value: ethers.parseEther("1"),
    });
  });

  describe("buyEthAndCall", function () {
    it("should swap tokens for ETH call a function", async function () {
      await bbUSD.mint(alice.address, 200n);
      await bbUSD
        .connect(alice)
        .approve(fixedPriceEthEthExchange.target, ethers.MaxUint256);

      const ethAmount = ethers.parseEther("1");
      const transferFromCallData = bbUSD.interface.encodeFunctionData(
        "transferFrom",
        [alice.address, fixedPriceEthEthExchange.target, 100n],
      );
      // const callValue2 = ethers.parseEther("0.01");
      let check = ethers.Wallet.createRandom(ethers.provider);
      const tokenAmount =
        (ethAmount * initialPrice) / (1000000n * ethers.parseEther("1"));
      const fundCheckCallData = checkBook.interface.encodeFunctionData(
        "fundCheck",
        [check.address, 100n],
      );

      const userEthBalanceBefore = await ethers.provider.getBalance(
        alice.address,
      );
      const userTokenBalanceBefore = await bbUSD.balanceOf(alice.address);
      const contractTokenBalanceBefore = await bbUSD.balanceOf(
        fixedPriceEthEthExchange.target,
      );

      const tx = await fixedPriceEthEthExchange.connect(alice).buyEthAndCall(
        bbUSD.target,
        ethAmount,
        [
          {
            target: bbUSD.target,
            data: transferFromCallData,
            value: 0,
          },
          {
            target: checkBook.target,
            data: fundCheckCallData,
            value: ethers.parseEther("0.04"),
          },
        ],
        new Uint8Array(),
        {
          gasLimit: 10000000,
        }
      );
      await tx.wait()
      await checkBook.connect(check).redeemCheck(bob, new Uint8Array(), new Uint8Array());

      const receipt = await tx.wait();
      const gasCost: bigint = BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice);

      const userEthBalanceAfter = await ethers.provider.getBalance(
        alice.address,
      );
      const userTokenBalanceAfter = await bbUSD.balanceOf(alice.address);
      const contractTokenBalanceAfter = await bbUSD.balanceOf(
        fixedPriceEthEthExchange.target,
      );

      expect(userTokenBalanceAfter).to.equal(
        userTokenBalanceBefore - (tokenAmount + 100n),
      );
      expect(contractTokenBalanceAfter).to.equal(
        contractTokenBalanceBefore + tokenAmount,
      );
      expect(userEthBalanceAfter).to.equal(
        userEthBalanceBefore + ethAmount - gasCost,
      );
    });
  });
});
