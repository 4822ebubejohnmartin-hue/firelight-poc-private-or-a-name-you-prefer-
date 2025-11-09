const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoC 3 — totalAssets vs pendingWithdrawAssets invariant", function () {
  let deployer, user, other;
  let MockERC20, mock, Vault, vault;

  const initialDepositLimit = ethers.utils.parseUnits("1000000", 18);
  const periodDuration = 3600;

  beforeEach(async function () {
    [deployer, user, other] = await ethers.getSigners();

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

  it("totalAssets view should not underflow and pendingWithdrawAssets should be <= token balance", async function () {
    const depositAmount = ethers.utils.parseUnits("10", 18);
    await vault.connect(user).deposit(depositAmount, user.address);

    // user requests withdraw via withdraw() or redeem() — we'll call redeem to create pending withdrawals
    // redeem burns shares and schedules withdraw for next period
    const userShares = await vault.balanceOf(user.address);
    await vault.connect(user).redeem(userShares, user.address, user.address);

    // Get vault token balance (raw)
    const tokenBal = await mock.balanceOf(vault.address);

    // Compute pendingWithdrawAssets: tokenBalance - vault.totalAssets()  (since totalAssets() = raw - pending)
    let reportedTotalAssets;
    try {
      reportedTotalAssets = await vault.totalAssets();
    } catch (err) {
      // If totalAssets() reverts, that's a problem — fail the test
      expect.fail("vault.totalAssets() reverted");
    }

    const pending = tokenBal.sub(reportedTotalAssets);
    console.log("tokenBal:", tokenBal.toString());
    console.log("reportedTotalAssets:", reportedTotalAssets.toString());
    console.log("computed pendingWithdrawAssets:", pending.toString());

    // Check that the computed pending value is not greater than token balance (sanity)
    expect(tokenBal.gte(pending)).to.equal(true, "token balance is smaller than computed pending withdraw assets (unexpected)");
  });
});
