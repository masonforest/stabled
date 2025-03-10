const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("BbUSD", function () {
  let bbUSD, owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const BbUSD = await ethers.getContractFactory("BbUSD");
    bbUSD = await BbUSD.deploy(); // Deploy with initial supply and transferValue
    await owner.sendTransaction({
      to: bbUSD.target,
      value: ethers.parseEther("0.004")
    })
  });

  describe("setTransferCost", function () {
    it("should allow owner to update transferCost", async function () {
      const newTransferCost = ethers.parseEther("0.0002");

      // Owner updates the transferCost
      await bbUSD.connect(owner).setTransferCost(newTransferCost);

      // Check if the transferCost was updated
      const updatedTransferCost = await bbUSD.transferCost();
      expect(updatedTransferCost).to.equal(newTransferCost);
    });

    it("should revert if non-owner tries to update transferCost", async function () {
      const newTransferCost = ethers.parseEther("0.0002");

      // Alice (non-owner) tries to update the transferCost
      await expect(bbUSD.connect(alice).setTransferCost(newTransferCost))
      .to.be.revertedWithCustomError(bbUSD, "OwnableUnauthorizedAccount");
    });
  });

  describe("transfer", function () {
    it("sends the sender and recipient enough CORE for a single transaction", async function () {
      await bbUSD.mint(alice, 100) 
      bob = ethers.Wallet.createRandom(ethers.provider)
      const alicesBalanceBefore = await ethers.provider.getBalance(alice.address);
      const bobsBalanceBefore = await ethers.provider.getBalance(bob.address);

      const tx = await bbUSD.connect(alice).transfer(bob, 100);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * tx.gasPrice;
      const alicesBalanceAfter = await ethers.provider.getBalance(alice.address);
      const bobsBalanceAfter = await ethers.provider.getBalance(bob.address);
      expect(alicesBalanceAfter).to.be.gt(alicesBalanceBefore)
      expect(alicesBalanceAfter - alicesBalanceBefore ).to.be.equal(ethers.parseEther("0.002") - gasCost)
      expect(bobsBalanceAfter).to.equal(bobsBalanceBefore + ethers.parseEther("0.002")) 
    });
  });
  describe("create and redeem magic", function () {
    it("allows for transferring", async function () {
      await bbUSD.mint(alice, 100) 
      await bbUSD.connect(alice).createMagic(bob, 100);
      await bbUSD.connect(bob).redeemMagic();
      expect(await bbUSD.balanceOf(bob)).to.eq(100);
    });
  });
});
