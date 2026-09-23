const hre = require("hardhat");

async function main() {
  const signers = await hre.ethers.getSigners();
  if (!signers || signers.length === 0) {
    console.error("=================================================");
    console.error("❌ ERROR: Deployer private key not found!");
    console.error("👉 Please configure PRIVATE_KEY in /Users/echo/project/SivletLabs/contracts/.env");
    console.error("   Example: PRIVATE_KEY=\"your_wallet_private_key_here\"");
    console.error("=================================================");
    process.exit(1);
  }

  const [deployer] = signers;
  const networkName = hre.network.name;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  console.log("=================================================");
  console.log(`Deploying SivletLabs Protocol Treasury on: ${networkName} (Chain ID: ${chainId})`);
  console.log(`Deployer address: ${deployer.address}`);
  console.log("=================================================");

  const isRobinhood = networkName === "robinhood" || Number(chainId) === 4663;

  // Network Addresses
  const USDC_ADDRESS = isRobinhood
    ? (process.env.ROBINHOOD_USDC || "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e") // Pons Router placeholder if native ETH
    : (process.env.BASE_USDC || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");

  const WETH_ADDRESS = isRobinhood
    ? (process.env.ROBINHOOD_WETH || "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e")
    : (process.env.BASE_WETH || "0x4200000000000000000000000000000000000006");

  const SWAP_ROUTER = isRobinhood
    ? (process.env.ROBINHOOD_SWAP_ROUTER || "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e") // Pons Router
    : (process.env.BASE_SWAP_ROUTER || "0x2626664c2603336E57B271c5C0b26F421741e481");

  // Official $SIVLET deployed on Pons (Robinhood Chain) / configurable via env
  const SIVLET_TOKEN = process.env.SIVLET_TOKEN || "0xb7832ca55ea7f9aa1504657376117b98deb4e2e1";
  const MIN_TRIGGER_USDC = hre.ethers.parseUnits(process.env.MIN_TRIGGER_USDC || "50", 6);

  console.log(`Config:`);
  console.log(` - Network Mode: ${isRobinhood ? "Robinhood Chain (Pons & Native ETH)" : "Base L2 (Uniswap v3)"}`);
  console.log(` - Payment Asset / USDC: ${USDC_ADDRESS}`);
  console.log(` - WETH / Base Asset: ${WETH_ADDRESS}`);
  console.log(` - Swap Router: ${SWAP_ROUTER}`);
  console.log(` - SIVLET Token: ${SIVLET_TOKEN}`);
  console.log(` - Min Trigger: ${hre.ethers.formatUnits(MIN_TRIGGER_USDC, 6)} USDC\n`);

  const TreasuryFactory = await hre.ethers.getContractFactory("BuybackBurnEngine");
  const treasury = await TreasuryFactory.deploy(
    USDC_ADDRESS,
    WETH_ADDRESS,
    SWAP_ROUTER,
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
  console.log(`1. Official $SIVLET token bound: ${SIVLET_TOKEN}`);
  console.log(`2. Router / Pons integration: ${SWAP_ROUTER}`);
  console.log(`3. Update Cloudflare Worker TREASURY_ADDRESS to: ${treasuryAddress}`);
  console.log(`4. Verify on Explorer: npx hardhat verify --network ${networkName} ${treasuryAddress} "${USDC_ADDRESS}" "${WETH_ADDRESS}" "${SWAP_ROUTER}" "${SIVLET_TOKEN}" "${MIN_TRIGGER_USDC}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
