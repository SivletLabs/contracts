import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=================================================");
  console.log("Deploying SivletLabs Protocol Treasury on Base");
  console.log(`Deployer address: ${deployer.address}`);
  console.log("=================================================");

  // Base Mainnet Addresses
  const BASE_USDC = process.env.BASE_USDC || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const BASE_WETH = process.env.BASE_WETH || "0x4200000000000000000000000000000000000006";
  const BASE_UNISWAP_V3_ROUTER = process.env.BASE_SWAP_ROUTER || "0x2626664c2603336E57B271c5C0b26F421741e481";
  
  // SIVLET token (if already launched via Clanker, pass SIVLET_TOKEN env, else address(0) to configure later)
  const SIVLET_TOKEN = process.env.SIVLET_TOKEN || hre.ethers.ZeroAddress;
  const MIN_TRIGGER_USDC = hre.ethers.parseUnits(process.env.MIN_TRIGGER_USDC || "50", 6); // 50 USDC default

  console.log(`Config:`);
  console.log(` - USDC: ${BASE_USDC}`);
  console.log(` - WETH: ${BASE_WETH}`);
  console.log(` - SwapRouter02: ${BASE_UNISWAP_V3_ROUTER}`);
  console.log(` - SIVLET Token: ${SIVLET_TOKEN}`);
  console.log(` - Min Trigger: ${hre.ethers.formatUnits(MIN_TRIGGER_USDC, 6)} USDC\n`);

  const TreasuryFactory = await hre.ethers.getContractFactory("BuybackBurnEngine");
  const treasury = await TreasuryFactory.deploy(
    BASE_USDC,
    BASE_WETH,
    BASE_UNISWAP_V3_ROUTER,
    SIVLET_TOKEN,
    MIN_TRIGGER_USDC
  );

  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();

  console.log("-------------------------------------------------");
  console.log(`🎉 BuybackBurnEngine successfully deployed at:`);
  console.log(`   ${treasuryAddress}`);
  console.log("-------------------------------------------------");
  console.log("\nNext Steps:");
  if (SIVLET_TOKEN === hre.ethers.ZeroAddress) {
    console.log("1. Launch $SIVLET on Warpcast via @clanker");
    console.log(`2. Call configureSivletToken(TOKEN_ADDRESS, 10000) on ${treasuryAddress}`);
  } else {
    console.log("1. $SIVLET route is already configured for Uniswap v3 pool!");
  }
  console.log(`3. Update Cloudflare Worker TREASURY_ADDRESS to: ${treasuryAddress}`);
  console.log(`4. Verify on Basescan: npx hardhat verify --network base ${treasuryAddress} "${BASE_USDC}" "${BASE_WETH}" "${BASE_UNISWAP_V3_ROUTER}" "${SIVLET_TOKEN}" "${MIN_TRIGGER_USDC}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
