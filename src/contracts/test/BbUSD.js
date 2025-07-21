const { expect } = require("chai");

describe("BbUSD", function () {
  let bbUSD, owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const BbUSD = await ethers.getContractFactory("BbUSD");
    bbUSD = await BbUSD.deploy();
  });
});
