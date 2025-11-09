const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoC 6 — claimWithdraw defensive reentrancy simulation", function () {
  let deployer, user;
  let MockReentrantERC20, reToken, Vault, vault;

  const initialDepositLimit = ethers.utils.parseUnits("1000000", 18);
  const periodDuration = 3600;

  beforeEach(async function () {
    [deployer, user] = await ethers.getSigners();

    MockReentrantERC20 = await ethers.getContractFactory("contracts/mocks/MockReentrantERC20.sol:MockReentrantERC20");
    reToken = await MockReentrantERC20.deploy("ReentrantToken", "RNT", 18);
    await reToken.deployed();

    Vault = await ethers.getContractFactory("FirelightVault");
    vault = await Vault.deploy();
    await vault.deployed();

    const initParamsEncoded = ethers.utils.defaultAbiCoder.encode(
      ["address","address","address","address","address","uint256","uint48"],
      [deployer.address, deployer.address, deployer.address, deployer.address, deployer.address, initialDepositLimit, periodDuration]
    );
    await vault.initialize(reToken.address, "FirelightVault Token", "FLT", initParamsEncoded);

    // mint and approve
    await reToken.mint(user.address, ethers.utils.parseUnits("50", 18));
    await reToken.connect(user).approve(vault.address, ethers.utils.parseUnits("50", 18));
  });

  it("simulate reentrant callback during claimWithdraw transfer", async function () {
    // deposit then redeem to create pending withdraw for next period
    const depositAmount = ethers.utils.parseUnits("10", 18);
    await vault.connect(user).deposit(depositAmount, user.address);
    const userShares = await vault.balanceOf(user.address);
    await vault.connect(user).redeem(userShares, user.address, user.address);

    // compute next period and prepare to claim with a malicious reentry during transfer
    const period = (await vault.currentPeriod()).toNumber() + 1;

    // Set token to call vault.claimWithdraw(period) during transfers to the receiver
    const reenterData = vault.interface.encodeFunctionData("claimWithdraw", [period]);
    await reToken.setReenter(vault.address, reenterData);

    // Now try to call claimWithdraw; the token transfer will trigger a reenter call.
    // We expect the vault to be safe (no double-claim / reentrancy exploit)
    // Run and ensure it either succeeds once or reverts safely; it must not allow double-claims.

    // Fast-forward time in tests if necessary — many vaults require crossing period boundaries.
    // If Hardhat network, increase time to after period end:
    await ethers.provider.send("evm_increaseTime", [periodDuration + 10]);
    await ethers.provider.send("evm_mine");

    // Now try to claim
    await expect(vault.connect(user).claimWithdraw(period)).to.not.be.reverted;

    // After claim, second claim should revert
    await expect(vault.connect(user).claimWithdraw(period)).to.be.reverted;
  }).timeout(120000);
});
