// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");


module.exports = buildModule("BbUSD", (m) => {

  const bbUsd = m.contract("BbUSD", [], {maxFeePerGas: 30000000000n,
    maxPriorityFeePerGas: 30000000000n});

  return { bbUsd };
});
