import hre from "hardhat";

async function main() {
  const [caller] = await hre.ethers.getSigners();
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;

  if (!TREASURY_ADDRESS) {
    console.error("Please set TREASURY_ADDRESS environment variable.");
    process.exit(1);
  }

  console.log(`Checking SivletLabs Treasury at ${TREASURY_ADDRESS} from ${caller.address}...`);
  const treasury = await hre.ethers.getContractAt("BuybackBurnEngine", TREASURY_ADDRESS);

  const status = await treasury.getTreasuryStatus();
  console.log(`Current Treasury USDC: ${hre.ethers.formatUnits(status.currentUsdcBalance, 6)} USDC`);
  console.log(`Is Ready to Trigger: ${status.isReadyToTrigger}`);
  console.log(`Cooldown remaining: ${status.secondsUntilCooldownExpires}s`);
  console.log(`Cumulative Burned: ${hre.ethers.formatEther(status.cumulativeTokensBurned)} SIVLET`);

  if (!status.isReadyToTrigger) {
    console.log("Treasury not ready yet. Exiting.");
    return;
  }

  console.log("🚀 Conditions met! Triggering executeBuybackAndBurn (slippage min: 0)...");
  const tx = await treasury.executeBuybackAndBurn(0);
  console.log(`Transaction sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`✅ Buyback executed in block ${receipt.blockNumber}! Gas used: ${receipt.gasUsed.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
