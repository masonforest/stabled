
const { expect } = require("chai");

describe("CheckBook", function () {
  let bbUSD, checkBook, owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const BbUSD = await ethers.getContractFactory("BbUSD")
    bbUSD = await BbUSD.deploy();
    const CheckBook = await ethers.getContractFactory("CheckBook");
    checkBook = await CheckBook.deploy();
  });

  describe("fund and redeem check", function () {
    it("allows for transferring", async function () {
      await bbUSD.mint(alice, 100) 
      await bbUSD.connect(alice).approve(checkBook.target, ethers.MaxUint256);
      let check = ethers.Wallet.createRandom(ethers.provider);
      await checkBook.connect(alice).fundCheck(bbUSD.target, check.address, 100, {
        value: ethers.parseEther("0.004")
      });
      await checkBook.connect(check).redeemCheck(bbUSD.target, bob);
      expect(await bbUSD.balanceOf(bob)).to.eq(100);
    });
  });
});
