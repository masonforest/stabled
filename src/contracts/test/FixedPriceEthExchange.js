const { expect } = require("chai");
const { formatEther, HDNodeWallet } = require("ethers");


describe("FixedPriceEthExchange", function () {
  let bbUSD, checkBook, fixedPriceEthEthExchange, owner, alice, bob;
  let initialPrice = 50190000n;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    // alice = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', ethers.provider)
    const BbUSD = await ethers.getContractFactory("BbUSD");
    bbUSD = await BbUSD.deploy();

    const CheckBook = await ethers.getContractFactory("CheckBook");
    checkBook = await CheckBook.deploy();

    const FixedPriceEthExchange = await ethers.getContractFactory(
      "FixedPriceEthExchange",
    );
    fixedPriceEthEthExchange = await FixedPriceEthExchange.deploy();
    await fixedPriceEthEthExchange.setPrice(bbUSD.target, initialPrice);
    await bbUSD.preApprove(fixedPriceEthEthExchange.target);
    await bbUSD.preApprove(checkBook.target);
    await owner.sendTransaction({
      to: fixedPriceEthEthExchange.target,
      value: ethers.parseEther("1.004"),
    });
    await owner.sendTransaction({
      to: alice.address,
      value: ethers.parseEther("1"),
    });
  });

  describe("buyEthAndCallWithTokens", function () {
    it("should swap tokens for ETH call a function", async function () {
      await bbUSD.mint(alice.address, 200n);
      await bbUSD
        .connect(alice)
        .approve(fixedPriceEthEthExchange.target, ethers.MaxUint256);

      const ethAmount = ethers.parseEther("1");
      const callValue = ethers.parseEther("0.004"); 
      let check = ethers.Wallet.createRandom(ethers.provider);
      const tokenAmount =
        (ethAmount * initialPrice) / (1000000n * ethers.parseEther("1"));
      const callData = checkBook.interface.encodeFunctionData("fundCheck", [
        bbUSD.target,
        check.address,
        100n,
      ]);

      const userEthBalanceBefore = await ethers.provider.getBalance(
        alice.address,
      );
      const userTokenBalanceBefore = await bbUSD.balanceOf(alice.address);
      const contractTokenBalanceBefore = await bbUSD.balanceOf(
        fixedPriceEthEthExchange.target,
      );

      const tx = await fixedPriceEthEthExchange
        .connect(alice)
        .buyEthAndCallWithTokens(
            bbUSD.target,
            bbUSD.target,
            100n,
            ethAmount,
            checkBook.target,
            callData,
            callValue,
          );

      await checkBook.connect(check).redeemCheck(bbUSD.target, bob)

      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

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
      expect(contractTokenBalanceAfter).to.equal(contractTokenBalanceBefore + tokenAmount);
      expect(userEthBalanceAfter).to.equal(userEthBalanceBefore + ethAmount - gasCost);
    });
  });
});
