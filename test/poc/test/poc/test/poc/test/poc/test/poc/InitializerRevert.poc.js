const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoC 5 — initializer re-run sanity", function () {
  let deployer;
  let MockERC20, mock, Vault, vault;

  const initialDepositLimit = ethers.utils.parseUnits("1000000", 18);
  const periodDuration = 3600;

  beforeEach(async function () {
    [deployer] = await ethers.getSigners();

    MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
    mock = await MockERC20.deploy("MockToken", "MTK", 18);
    await mock.deployed();

    Vault = await ethers.getContractFactory("FirelightVault");
    vault = await Vault.deploy();
    await vault.deployed();

    const initParamsEncoded = ethers.utils.defaultAbiCoder.encode(
      ["address","address","address","address","address","uint256","uint48"],
      [deployer.address, deployer.address, deployer.address, deployer.address, deployer.address, initialDepositLimit, periodDuration]
    );

    await vault.initialize(mock.address, "FirelightVault Token", "FLT", initParamsEncoded);
  });

  it("second initialize should revert", async function () {
    const initParamsEncoded = ethers.utils.defaultAbiCoder.encode(
      ["address","address","address","address","address","uint256","uint48"],
      [deployer.address, deployer.address, deployer.address, deployer.address, deployer.address, initialDepositLimit, periodDuration]
    );

    await expect(vault.initialize(mock.address, "FirelightVault Token", "FLT", initParamsEncoded)).to.be.reverted;
  });
});
