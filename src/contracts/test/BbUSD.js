
const { expect } = require("chai");

describe("BbUSD", function () {
  let bbUSD, owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const BbUSD = await ethers.getContractFactory("BbUSD");
    bbUSD = await BbUSD.deploy();
  });

  describe.only("create and redeem magic", function () {
    it("allows for transferring", async function () {
      await bbUSD.mint(alice, 100) 
      let check = ethers.Wallet.createRandom(ethers.provider);
      await alice.sendTransaction({
        to: check.address,
        value: ethers.parseEther("0.01")
      })
      await bbUSD.connect(alice).fundCheck(check.address, 100);
      await bbUSD.connect(check).redeemCheck(bob);
      expect(await bbUSD.balanceOf(bob)).to.eq(100);
    });
  });
});
