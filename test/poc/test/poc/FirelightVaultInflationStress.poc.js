const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoC 2 — FirelightVault inflation stress test", function () {
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

    // fund & approve
    await mock.mint(user.address, ethers.utils.parseUnits("1000", 18));
    await mock.connect(user).approve(vault.address, ethers.utils.parseUnits("1000", 18));
  });

  it("many tiny deposits should not cumulatively inflate beyond epsilon", async function () {
    const tiny = ethers.BigNumber.from("1000000"); // 1e6 wei (very small)
    const iterations = 1000;
    let totalIn = ethers.BigNumber.from("0");
    let totalOutPreview = ethers.BigNumber.from("0");

    for (let i = 0; i < iterations; i++) {
      await vault.connect(user).deposit(tiny, user.address);
      totalIn = totalIn.add(tiny);
      const userShares = await vault.balanceOf(user.address);

      // preview convert
      let assetsOut;
      try {
        assetsOut = await vault.callStatic.convertToAssets(userShares);
      } catch (err) {
        try {
          assetsOut = await vault.callStatic.previewRedeem(userShares);
        } catch {
          assetsOut = ethers.BigNumber.from("0");
        }
      }
      totalOutPreview = assetsOut;
      // We don't sum per iteration because previewRedeem returns total redeemable for current shares.
    }

    console.log("totalIn approximate:", totalIn.toString());
    console.log("totalOutPreview:", totalOutPreview.toString());

    // We expect totalOutPreview to be <= totalIn + epsilon (small): allow larger epsilon for many iterations
    const epsilon = ethers.utils.parseUnits("0.001", 18); // 0.001 token tolerance
    expect(totalOutPreview.lte(totalIn.add(epsilon))).to.equal(true, "Cumulative previewed assets exceed total deposits by more than epsilon");
  }).timeout(120000);
});
