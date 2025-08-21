import { expect } from "chai";
import { network } from "hardhat";
const { ethers } = await network.connect();

describe("CheckBook", function () {
  let bbUSD: any, checkBook: any, owner: any, alice: any, bob: any;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const BbUSD = await ethers.getContractFactory("BbUSD");
    bbUSD = await BbUSD.deploy();
    const CheckBook = await ethers.getContractFactory("CheckBook");
    const HDWalletMessenger =
    await ethers.getContractFactory("HDWalletMessenger");
  let hDWalletMessenger = await HDWalletMessenger.deploy();
    checkBook = await CheckBook.deploy(bbUSD.target, hDWalletMessenger.target);
  });

  describe("fund and redeem check", function () {
    it("allows for transferring", async function () {
      await bbUSD.mint(alice, 100);
      await bbUSD.connect(alice).approve(checkBook.target, ethers.MaxUint256);
      let check = ethers.Wallet.createRandom(ethers.provider);
      await checkBook
        .connect(alice)
        .fundCheck(check.address, 100, {
          value: ethers.parseEther("0.04"),
        });
      await checkBook.connect(check).redeemCheck(bob, new Uint8Array(), new Uint8Array());
      expect(await bbUSD.balanceOf(bob)).to.eq(100);
    });
  });
});
