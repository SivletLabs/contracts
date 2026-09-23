import { expect } from "chai";
import hre from "hardhat";

describe("BuybackBurnEngine Treasury Unit Tests (Startup Monthly Cliff Model)", function () {
  let usdc, weth, sivlet, swapRouter, treasury;
  let owner, keeper, user, designatedFounder;
  const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

  beforeEach(async function () {
    [owner, keeper, user, designatedFounder] = await hre.ethers.getSigners();

    // 1. Deploy Mocks
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    sivlet = await MockERC20.deploy("SivletLabs", "SIVLET", 18);

    // Give total supply to mock token (1B tokens) so totalSupply() > 0 for FDV calculation
    await sivlet.mint(owner.address, hre.ethers.parseEther("1000000000"));

    const MockRouter = await hre.ethers.getContractFactory("MockSwapRouter");
    swapRouter = await MockRouter.deploy();
    await swapRouter.setMockTokenOut(await sivlet.getAddress());
    // Default mock price: 1 USDC = 20,000 SIVLET -> FDV = $50,000 USD (< $100K target)
    await swapRouter.setMockMultiplier(20000);

    // 2. Deploy BuybackBurnEngine
    const Engine = await hre.ethers.getContractFactory("BuybackBurnEngine");
    const minThreshold = hre.ethers.parseUnits("50", 6); // 50 USDC
    treasury = await Engine.deploy(
      await usdc.getAddress(),
      await weth.getAddress(),
      await swapRouter.getAddress(),
      await sivlet.getAddress(),
      minThreshold
    );
  });

  it("should initialize with correct parameters, swap path, and cliff defaults", async function () {
    expect(await treasury.owner()).to.equal(owner.address);
    expect(await treasury.founderAddress()).to.equal(owner.address);
    expect(await treasury.sivletToken()).to.equal(await sivlet.getAddress());
    expect(await treasury.minTriggerThreshold()).to.equal(hre.ethers.parseUnits("50", 6));
    expect(await treasury.cooldownInterval()).to.equal(3600); // 1 hour
    expect(await treasury.targetMarketCap()).to.equal(hre.ethers.parseUnits("100000", 6)); // $100k
    expect(await treasury.isMarketCapGoalReached()).to.equal(false);
    expect(await treasury.cliffActivationTimestamp()).to.equal(0);
    expect(await treasury.vestingDurationMonths()).to.equal(12);
    expect(await treasury.getClaimableFounderTokens()).to.equal(0);
  });

  it("should reject buyback when treasury balance is below threshold", async function () {
    await expect(treasury.connect(keeper).executeBuybackAndBurn(0))
      .to.be.revertedWith("Insufficient treasury balance");
  });

  it("should execute buyback, split 90% burn and 10% locked founder incentive, and pay keeper bounty", async function () {
    const depositAmount = hre.ethers.parseUnits("100", 6); // 100 USDC
    await usdc.mint(await treasury.getAddress(), depositAmount);

    const keeperBalanceBefore = await usdc.balanceOf(keeper.address);

    // Execute buyback
    const tx = await treasury.connect(keeper).executeBuybackAndBurn(0);
    await tx.wait();

    // Check keeper bounty (0.5% of 100 USDC = 0.5 USDC)
    const expectedBounty = hre.ethers.parseUnits("0.5", 6);
    const keeperBalanceAfter = await usdc.balanceOf(keeper.address);
    expect(keeperBalanceAfter - keeperBalanceBefore).to.equal(expectedBounty);

    // Mock router multiplier = 20,000 tokens per USDC
    // Swap amount = 99.5 USDC -> 99.5 * 20,000 = 1,990,000 SIVLET (18 decimals)
    const totalBought = hre.ethers.parseEther("1990000");
    const expectedIncentive = (totalBought * 1000n) / 10000n; // 10% = 199,000 SIVLET
    const expectedBurned = totalBought - expectedIncentive;   // 90% = 1,791,000 SIVLET

    // Check that 90% burned to DEAD_ADDRESS
    const deadBalance = await sivlet.balanceOf(DEAD_ADDRESS);
    expect(deadBalance).to.equal(expectedBurned);

    // Check that 10% retained in treasury
    const totalAccumulated = await treasury.totalFounderIncentiveAccumulated();
    expect(totalAccumulated).to.equal(expectedIncentive);

    // Check transparent accounting metrics
    expect(await treasury.totalBurnEvents()).to.equal(1);
    expect(await treasury.totalUsdcSpent()).to.equal(depositAmount - expectedBounty);
    expect(await treasury.totalTokensBurned()).to.equal(expectedBurned);
  });

  it("should strictly reject claiming founder incentive before 100K market cap milestone is reached", async function () {
    const depositAmount = hre.ethers.parseUnits("100", 6);
    await usdc.mint(await treasury.getAddress(), depositAmount);
    await treasury.connect(keeper).executeBuybackAndBurn(0);

    // Initial FDV is $50,000, so goal is not reached yet
    expect(await treasury.totalFounderIncentiveAccumulated()).to.be.gt(0);
    expect(await treasury.isMarketCapGoalReached()).to.equal(false);
    expect(await treasury.getClaimableFounderTokens()).to.equal(0);

    // Claiming must revert
    await expect(
      treasury.connect(owner).claimFounderIncentive()
    ).to.be.revertedWith("Market cap milestone (100K FDV) not yet reached");
  });

  it("should unlock cliff milestone at 100K FDV and vest monthly in 30-day epoch cycles", async function () {
    // Deposit 100 USDC and buy at $200K FDV (5,000 tokens per USDC)
    await swapRouter.setMockMultiplier(5000);

    const depositAmount = hre.ethers.parseUnits("100", 6);
    await usdc.mint(await treasury.getAddress(), depositAmount);

    await treasury.connect(keeper).executeBuybackAndBurn(0);

    // Milestone should automatically unlock!
    expect(await treasury.isMarketCapGoalReached()).to.equal(true);
    expect(await treasury.cliffActivationTimestamp()).to.be.gt(0);

    // Total bought = 99.5 * 5000 = 497,500 SIVLET
    // 10% Founder incentive = 49,750 SIVLET
    const totalAccumulated = await treasury.totalFounderIncentiveAccumulated();
    expect(totalAccumulated).to.equal(hre.ethers.parseEther("49750"));

    // In Month 0 (immediate on reaching 100K cliff), 1/12 vests immediately!
    const expectedMonth1Vested = totalAccumulated / 12n;
    expect(await treasury.getClaimableFounderTokens()).to.equal(expectedMonth1Vested);

    // Founder claims Month 1 tranche
    const ownerSivletBefore = await sivlet.balanceOf(owner.address);
    await treasury.connect(owner).claimFounderIncentive();
    const ownerSivletAfter = await sivlet.balanceOf(owner.address);

    expect(ownerSivletAfter - ownerSivletBefore).to.equal(expectedMonth1Vested);
    expect(await treasury.totalFounderIncentiveClaimed()).to.equal(expectedMonth1Vested);

    // Immediate second claim should revert because 0 claimable in current cycle
    expect(await treasury.getClaimableFounderTokens()).to.equal(0);
    await expect(
      treasury.connect(owner).claimFounderIncentive()
    ).to.be.revertedWith("No vested tokens available to claim in current cliff cycle");

    // Fast forward 30 days (1 month cliff cycle)
    await hre.network.provider.send("evm_increaseTime", [30 * 24 * 3600]);
    await hre.network.provider.send("evm_mine");

    // Now Month 2 tranche (another 1/12) is claimable!
    expect(await treasury.getClaimableFounderTokens()).to.equal(expectedMonth1Vested);

    // Claim Month 2 tranche
    await treasury.connect(owner).claimFounderIncentive();
    expect(await treasury.totalFounderIncentiveClaimed()).to.equal(expectedMonth1Vested * 2n);
  });

  it("should fully vest after 12 months and support perpetual continuous buyback rewards", async function () {
    await swapRouter.setMockMultiplier(5000);
    const depositAmount = hre.ethers.parseUnits("100", 6);
    await usdc.mint(await treasury.getAddress(), depositAmount);
    await treasury.connect(keeper).executeBuybackAndBurn(0);

    const totalAccumulated = await treasury.totalFounderIncentiveAccumulated();

    // Fast-forward 12 months (365 days)
    await hre.network.provider.send("evm_increaseTime", [365 * 24 * 3600]);
    await hre.network.provider.send("evm_mine");

    // 100% of accumulated tokens should be claimable
    expect(await treasury.getClaimableFounderTokens()).to.equal(totalAccumulated);

    // Claim all
    await treasury.connect(owner).claimFounderIncentive();
    expect(await treasury.totalFounderIncentiveClaimed()).to.equal(totalAccumulated);
    expect(await treasury.getClaimableFounderTokens()).to.equal(0);

    // Fast forward cooldown (1 hour) and execute another buyback (Month 13 perpetual revenue)
    await hre.network.provider.send("evm_increaseTime", [3600]);
    await hre.network.provider.send("evm_mine");

    await usdc.mint(await treasury.getAddress(), depositAmount);
    await treasury.connect(keeper).executeBuybackAndBurn(0);

    // New 1% tokens arrived into treasury! Because 12 months have passed, new tokens are claimable!
    const newClaimable = await treasury.getClaimableFounderTokens();
    expect(newClaimable).to.be.gt(0);

    await treasury.connect(owner).claimFounderIncentive();
    expect(await treasury.getClaimableFounderTokens()).to.equal(0);
  });

  it("should support manual milestone unlock via unlockMarketCapGoal and set designated founder", async function () {
    const Engine = await hre.ethers.getContractFactory("BuybackBurnEngine");
    const freshTreasury = await Engine.deploy(
      await usdc.getAddress(),
      await weth.getAddress(),
      await swapRouter.getAddress(),
      await sivlet.getAddress(),
      hre.ethers.parseUnits("50", 6)
    );

    // Owner sets designated founder
    await freshTreasury.connect(owner).setFounderAddress(designatedFounder.address);
    expect(await freshTreasury.founderAddress()).to.equal(designatedFounder.address);

    // Owner unlocks milestone
    await freshTreasury.connect(owner).unlockMarketCapGoal();
    expect(await freshTreasury.isMarketCapGoalReached()).to.equal(true);

    // Non-owner cannot unlock again
    await expect(freshTreasury.connect(owner).unlockMarketCapGoal())
      .to.be.revertedWith("Goal already unlocked");
  });

  it("should allow updating vesting duration and enforce bounds", async function () {
    await treasury.connect(owner).setVestingDurationMonths(24);
    expect(await treasury.vestingDurationMonths()).to.equal(24);

    await expect(
      treasury.connect(owner).setVestingDurationMonths(0)
    ).to.be.revertedWith("Duration must be between 1 and 48 months");

    await expect(
      treasury.connect(owner).setVestingDurationMonths(50)
    ).to.be.revertedWith("Duration must be between 1 and 48 months");
  });

  it("should enforce cooldown interval between consecutive buybacks", async function () {
    const depositAmount = hre.ethers.parseUnits("100", 6);
    await usdc.mint(await treasury.getAddress(), depositAmount);

    await treasury.connect(keeper).executeBuybackAndBurn(0);

    // Fund again immediately
    await usdc.mint(await treasury.getAddress(), depositAmount);

    // Attempting to trigger again immediately should revert due to cooldown
    await expect(treasury.connect(keeper).executeBuybackAndBurn(0))
      .to.be.revertedWith("Cooldown active");
  });

  it("should support direct token burn on use (burnDirect)", async function () {
    const burnAmount = hre.ethers.parseEther("500");
    await sivlet.mint(user.address, burnAmount);

    await sivlet.connect(user).approve(await treasury.getAddress(), burnAmount);
    await treasury.connect(user).burnDirect(burnAmount);

    expect(await sivlet.balanceOf(DEAD_ADDRESS)).to.equal(burnAmount);
    expect(await treasury.totalTokensBurned()).to.equal(burnAmount);
  });

  it("should strictly prevent rescuing USDC or SIVLET tokens while allowing other tokens", async function () {
    // 1. Accidental token rescue (e.g. WETH)
    const randomAmount = hre.ethers.parseEther("100");
    await weth.mint(await treasury.getAddress(), randomAmount);

    const userWethBefore = await weth.balanceOf(user.address);
    await treasury.connect(owner).emergencyRescueToken(await weth.getAddress(), user.address, randomAmount);
    expect(await weth.balanceOf(user.address) - userWethBefore).to.equal(randomAmount);

    // 2. Strict anti-rug protection: withdrawing USDC must revert
    const usdcDeposit = hre.ethers.parseUnits("50", 6);
    await usdc.mint(await treasury.getAddress(), usdcDeposit);

    await expect(
      treasury.connect(owner).emergencyRescueToken(await usdc.getAddress(), owner.address, usdcDeposit)
    ).to.be.revertedWith("Cannot withdraw USDC protocol revenue");

    // 3. Strict anti-rug protection: withdrawing SIVLET tokens via rescue must revert
    const sivletDeposit = hre.ethers.parseEther("1000");
    await sivlet.mint(await treasury.getAddress(), sivletDeposit);

    await expect(
      treasury.connect(owner).emergencyRescueToken(await sivlet.getAddress(), owner.address, sivletDeposit)
    ).to.be.revertedWith("Cannot withdraw SIVLET tokens via rescue");
  });

  it("should return comprehensive status via getFounderIncentiveStatus and getTreasuryStatus", async function () {
    const status = await treasury.getFounderIncentiveStatus();
    expect(status.currentPoolBalance).to.equal(0);
    expect(status.currentClaimableTokens).to.equal(0);
    expect(status.currentUnvestedTokens).to.equal(0);
    expect(status.totalAccumulated).to.equal(0);
    expect(status.totalClaimed).to.equal(0);
    expect(status.targetMarketCapUsdc).to.equal(hre.ethers.parseUnits("100000", 6));

    const treasuryStatus = await treasury.getTreasuryStatus();
    expect(treasuryStatus.currentUsdcBalance).to.equal(0);
    expect(treasuryStatus.isReadyToTrigger).to.equal(false);
  });

  it("should support receiving native ETH and updating router / Pons configurations", async function () {
    // 1. Send native ETH to treasury
    const ethAmount = hre.ethers.parseEther("0.1");
    await user.sendTransaction({
      to: await treasury.getAddress(),
      value: ethAmount
    });

    const treasuryBal = await hre.ethers.provider.getBalance(await treasury.getAddress());
    expect(treasuryBal).to.equal(ethAmount);

    // 2. Status readiness with ETH balance
    const status = await treasury.getTreasuryStatus();
    expect(status.isReadyToTrigger).to.equal(true);

    // 3. Update router address
    const dummyRouter = user.address;
    await treasury.connect(owner).setSwapRouter(dummyRouter);
    expect(await treasury.swapRouter()).to.equal(dummyRouter);

    // 4. Update Pons pool & router addresses
    await treasury.connect(owner).setPonsAddresses(dummyRouter, keeper.address);
    expect(await treasury.ponsPool()).to.equal(dummyRouter);
    expect(await treasury.ponsRouter()).to.equal(keeper.address);

    // 5. Update ETH threshold
    await treasury.connect(owner).updateEthThreshold(hre.ethers.parseEther("0.01"));
    expect(await treasury.minTriggerThresholdEth()).to.equal(hre.ethers.parseEther("0.01"));
  });
});

