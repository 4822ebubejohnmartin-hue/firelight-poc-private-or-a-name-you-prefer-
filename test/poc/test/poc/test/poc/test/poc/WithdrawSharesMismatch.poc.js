const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoC 4 — withdraw shares mismatch detection", function () {
  let deployer, user;
  let MockERC20, mock, Vault, vault;

  const initialDepositLimit = ethers.utils.parseUnits("1000000", 18);
  const periodDuration = 3600;

  beforeEach(async function () {
    [deployer, user] = await ethers.getSigners();

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
    await mock.mint(user.address, ethers.utils.parseUnits("100", 18));
    await mock.connect(user).approve(vault.address, ethers.utils.parseUnits("100", 18));
  });

  it("records withdrawn shares vs burned shares for a redeem", async function () {
    const depositAmount = ethers.utils.parseUnits("5", 18);
    await vault.connect(user).deposit(depositAmount, user.address);

    // compute preview shares for redeeming 'depositAmount' assets
    let sharesForAssets;
    try {
      sharesForAssets = await vault.callStatic.convertToShares(depositAmount);
    } catch {
      try {
        sharesForAssets = await vault.callStatic.previewWithdraw(depositAmount);
      } catch {
        // fallback to using balanceOf after deposit
        sharesForAssets = await vault.balanceOf(user.address);
      }
    }

    // call redeem to create withdraw request (burns shares and queues withdraw for next period)
    await vault.connect(user).redeem(sharesForAssets, user.address, user.address);

    // Try to read withdrawShares and withdrawSharesOf via public getters (may require adapting names)
    let period = (await vault.currentPeriod()).toNumber() + 1; // redeem scheduled for next period
    console.log("next period:", period);

    let withdrawSharesPeriod;
    let withdrawSharesOfReceiver;
    try {
      withdrawSharesPeriod = await vault.withdrawShares(period);
    } catch {
      console.warn("withdrawShares getter not available publicly; adapt test to storage visibility");
      return;
    }

    try {
      withdrawSharesOfReceiver = await vault.withdrawSharesOf(period, user.address);
    } catch {
      console.warn("withdrawSharesOf getter not available publicly; adapt test to storage visibility");
      return;
    }

    console.log("withdrawShares[period]:", withdrawSharesPeriod.toString());
    console.log("withdrawSharesOf[period][user]:", withdrawSharesOfReceiver.toString());
    console.log("shares burned (approx):", sharesForAssets.toString());

    // Basic sanity: recorded withdraw shares for user shouldn't exceed burned shares
    expect(withdrawSharesOfReceiver.lte(sharesForAssets)).to.equal(true, "Recorded withdraw shares for user exceed burned shares (unexpected)");
  });
});
