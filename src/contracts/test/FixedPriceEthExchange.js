const { expect } = require("chai");

describe("FixedPriceEthExchange", function () {
  let bbUSD, fixedPriceEthEthExchange, owner, alice, bob;
  let initialPrice = ethers.parseEther("0.4360");

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    // alice = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', ethers.provider) 

    
    const BbUSD = await ethers.getContractFactory("BbUSD");
    bbUSD = await BbUSD.deploy();

    const FixedPriceEthExchange = await ethers.getContractFactory("FixedPriceEthExchange");
    fixedPriceEthEthExchange = await FixedPriceEthExchange.deploy();
    await fixedPriceEthEthExchange.setPrice(bbUSD.target, initialPrice)
    await owner.sendTransaction({
      to: fixedPriceEthEthExchange.target,
      value: ethers.parseEther("0.004")
    })
    await owner.sendTransaction({
      to: alice.address,
      value: ethers.parseEther("0.004")
    })
  });

  describe("buyEth", function () {    
    it("should swap tokens for ETH", async function () {
    
    await bbUSD.mint(alice.address, 1n);
    await bbUSD.connect(alice).approve(fixedPriceEthEthExchange.target, ethers.MaxUint256);

    const tokenAmount = 1n;
    // const ethAmount = (tokenAmount * 100n * initialPrice) / ethers.parseEther("1");
    // console.log(ethAmount)
    const userEthBalanceBefore = await ethers.provider.getBalance(alice.address);
    const userTokenBalanceBefore = await bbUSD.balanceOf(alice.address);
    const contractTokenBalanceBefore = await bbUSD.balanceOf(fixedPriceEthEthExchange.target);
    

    
    const tx = await fixedPriceEthEthExchange.connect(alice).buyEth(
      bbUSD.target,
      tokenAmount,
    );
    
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    
    const userEthBalanceAfter = await ethers.provider.getBalance(alice.address);
    const userTokenBalanceAfter = await bbUSD.balanceOf(alice.address);
    const contractTokenBalanceAfter = await bbUSD.balanceOf(fixedPriceEthEthExchange.target);
    
    expect(userTokenBalanceAfter).to.equal(userTokenBalanceBefore - tokenAmount);
    expect(contractTokenBalanceAfter).to.equal(contractTokenBalanceBefore + tokenAmount);
    // expect(userEthBalanceAfter).to.equal(userEthBalanceBefore + ethAmount - gasCost - 100n);
  });
});
});