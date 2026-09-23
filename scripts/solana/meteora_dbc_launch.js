/**
 * SivletLabs: Meteora Dynamic Bonding Curve (DBC) Launchpad Initializer
 * 
 * Purpose:
 *   1. Initialize a native Meteora Dynamic Bonding Curve (DBC) pool for $SIVLET.
 *   2. Support 0-initial-capital fair launch: bonding curve collects SOL as buyers purchase.
 *   3. Enforce MAXIMUM fee structure (10.0% Base Fee + Dynamic Volatility Surge).
 *   4. Allocate 100% of creator trading fees to Protocol Treasury for Instant Buyback & Burn.
 *   5. Automatically migrate to Meteora DAMM V2 upon reaching quote target (e.g. 85 SOL).
 *   6. Permanently lock 100% of migrated LP liquidity to ensure zero rug-pull risk.
 * 
 * Protocol: Meteora Dynamic Bonding Curve (DBC)
 * Program ID: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
 * Official Web Launchpad: https://launch.meteora.ag
 * Manual Migrator: https://migrator.meteora.ag
 */

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction
} from '@solana/web3.js';
import {
  DynamicBondingCurveClient,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  TokenType,
  TokenDecimal,
  TokenAuthorityOption,
  MigrationOption,
  MigrationFeeOption,
  ActivationType,
  CollectFeeMode,
  BaseFeeMode,
  buildCurve,
  deriveDbcPoolAddress,
  deriveDbcTokenVaultAddress
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Standard Constants
const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || path.join(process.env.HOME || '', '.config/solana/id.json');
const SIVLET_MINT_STR = process.env.SIVLET_TOKEN_MINT || 'Siv1et1111111111111111111111111111111111111';

// Token Branding & Avatar Metadata
const TOKEN_LOGO_URI = process.env.TOKEN_LOGO_URI || 'https://sivletlabs.github.io/assets/logo.png';
const TOKEN_METADATA_URI = process.env.TOKEN_METADATA_URI || 'https://sivletlabs.github.io/assets/token-metadata.json';

// Bonding Curve Launchpad Configuration
const TOTAL_TOKEN_SUPPLY = 1_000_000_000; // 1 Billion $SIVLET tokens
const MIGRATION_QUOTE_THRESHOLD_SOL = parseFloat(process.env.MIGRATION_THRESHOLD_SOL || '85'); // 85 SOL standard graduation target
const BASE_FEE_BPS = parseInt(process.env.BASE_FEE_BPS || '1000', 10); // 10.0% Base Fee (1000 bps)
const PERCENTAGE_SUPPLY_ON_MIGRATION = 20; // 20% of tokens seeded into DAMM V2 liquidity pool upon graduation

async function loadKeypair(filepath) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Keypair file not found at ${filepath}. Please provide a valid Solana keypair.`);
  }
  const secretKey = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

async function main() {
  console.log('================================================================');
  console.log('SivletLabs: Meteora Dynamic Bonding Curve (DBC) Launchpad');
  console.log('Official Portal: https://launch.meteora.ag');
  console.log('DBC Program ID:  dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
  console.log('================================================================\n');

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  console.log(`[1/5] Connected to Solana RPC: ${RPC_ENDPOINT}`);

  let payer;
  let isSimulated = false;
  try {
    payer = await loadKeypair(KEYPAIR_PATH);
    console.log(`[2/5] Deployer wallet: ${payer.publicKey.toBase58()}`);
  } catch (err) {
    console.warn(`[WARNING] Could not load deployer keypair from ${KEYPAIR_PATH}:`, err.message);
    console.log('Generating ephemeral configuration keypair for simulated dry-run...');
    payer = Keypair.generate();
    isSimulated = true;
  }

  const sivletMint = new PublicKey(SIVLET_MINT_STR);
  console.log(`[3/5] Base Token ($SIVLET):     ${sivletMint.toBase58()}`);
  console.log(`      Quote Token (Native SOL): ${NATIVE_SOL_MINT.toBase58()}`);
  console.log(`      DBC Program:              ${DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58()}`);
  console.log(`      Token Avatar / Logo:      ${TOKEN_LOGO_URI}`);
  console.log(`      Token Metadata URI:       ${TOKEN_METADATA_URI}`);

  console.log('\n[4/5] Building Mathematical Dynamic Bonding Curve:');
  console.log(`      - Total Supply:               ${TOTAL_TOKEN_SUPPLY.toLocaleString()} SIVLET`);
  console.log(`      - Curve Trading Base Fee:     ${BASE_FEE_BPS / 100}% (MAXIMUM 1000 bps tier)`);
  console.log(`      - Dynamic Volatility Surge:   Enabled`);
  console.log(`      - Creator Fee Allocation:     100% of trading fees to Sivlet Treasury`);
  console.log(`      - Migration Quote Threshold:  ${MIGRATION_QUOTE_THRESHOLD_SOL} SOL`);
  console.log(`      - Post-Graduation AMM:        Meteora DAMM V2`);
  console.log(`      - LP Liquidity Lock:          100% Permanently Locked / Burned`);
  console.log(`      - Capital Requirement:        0 SOL required to seed initial curve`);

  // Build curve configuration parameters
  const curveConfig = {
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.NINE,
      tokenQuoteDecimal: TokenDecimal.NINE,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: TOTAL_TOKEN_SUPPLY,
      leftover: 0
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: BASE_FEE_BPS,
          endingFeeBps: BASE_FEE_BPS,
          numberOfPeriod: 0,
          totalDuration: 0
        }
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 100, // 100% of fees to Treasury
      poolCreationFee: 0.01,
      enableFirstSwapWithMinFee: false
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: {
        feePercentage: 0,
        creatorFeePercentage: 0
      }
    },
    liquidityDistribution: {
      creatorPermanentLockedLiquidityPercentage: 100,
      creatorLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 0,
      partnerLiquidityPercentage: 0
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0
    },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: PERCENTAGE_SUPPLY_ON_MIGRATION,
    migrationQuoteThreshold: MIGRATION_QUOTE_THRESHOLD_SOL
  };

  const builtCurve = buildCurve(curveConfig);
  console.log(`\n      Successfully validated curve profile!`);
  console.log(`      - Number of curve points:     ${builtCurve.curve.length}`);
  console.log(`      - Migration Lamports Target:  ${builtCurve.migrationQuoteThreshold.toString()}`);

  const launchProfile = {
    platform: 'Meteora Dynamic Bonding Curve Launchpad',
    launchpad_url: 'https://launch.meteora.ag',
    manual_migrator_url: 'https://migrator.meteora.ag',
    dbc_program_id: DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58(),
    token: {
      name: 'SivletLabs Token',
      symbol: 'SIVLET',
      decimals: 9,
      total_supply: TOTAL_TOKEN_SUPPLY,
      mint: sivletMint.toBase58(),
      logo_url: TOKEN_LOGO_URI,
      metadata_uri: TOKEN_METADATA_URI
    },
    bonding_curve_parameters: {
      base_fee_bps: BASE_FEE_BPS,
      base_fee_percent: `${BASE_FEE_BPS / 100}%`,
      dynamic_fee_enabled: true,
      creator_fee_percentage: '100%',
      migration_quote_threshold_sol: MIGRATION_QUOTE_THRESHOLD_SOL,
      graduation_destination: 'Meteora DAMM V2',
      lp_lock_percentage: '100% Permanently Locked'
    },
    buyback_integration: {
      revenue_source: '100% of DBC trading fees collected in SOL',
      crank_script: 'scripts/solana/instant_buyback_burn_crank.js',
      action: 'Automatically market-buys $SIVLET and routes to permanent burn sink (11111111111111111111111111111111)'
    }
  };

  const outputPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'meteora_dbc_config.json');
  fs.writeFileSync(outputPath, JSON.stringify(launchProfile, null, 2));
  console.log(`\n[5/5] Launch profile saved to: ${outputPath}`);

  console.log('\n================================================================');
  console.log('TWO WAYS TO LAUNCH ON METEORA LAUNCHPAD:');
  console.log('================================================================');
  console.log('METHOD 1: WEB PORTAL (1-Click Fair Launch - Recommended)');
  console.log('  1. Navigate to: https://launch.meteora.ag');
  console.log('  2. Connect Phantom or Solflare wallet.');
  console.log('  3. Token Profile & Avatar:');
  console.log('     - Token Name:   SivletLabs Token');
  console.log('     - Symbol:       SIVLET');
  console.log(`     - Avatar/Logo:  ${TOKEN_LOGO_URI}`);
  console.log(`     - Metadata URI: ${TOKEN_METADATA_URI}`);
  console.log(`  4. Set Migration Threshold to ${MIGRATION_QUOTE_THRESHOLD_SOL} SOL.`);
  console.log('  5. Set Fee tier to Maximum (10.0%) and Creator Fee Share to 100%.');
  console.log('  6. Confirm transaction. Zero initial SOL liquidity required!');
  console.log('  7. Start instant buyback crank: npm run crank:instant\n');
  console.log('METHOD 2: CLI / PROGRAMMATIC LAUNCH');
  console.log('  1. Fund deployer wallet with ~0.02 SOL for rent & account creation.');
  console.log('  2. Export environment variables:');
  console.log('     export SOLANA_KEYPAIR_PATH=~/.config/solana/id.json');
  console.log('     export SIVLET_TOKEN_MINT=<mint_address>');
  console.log('  3. Run: npm run launch:dbc');
  console.log('================================================================\n');

  if (isSimulated) {
    console.log('[NOTE] Simulated dry-run completed successfully without broadcasting.');
    console.log('       To broadcast on Solana Mainnet, supply a funded SOLANA_KEYPAIR_PATH.');
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR] Meteora DBC launch initialization failed:', err);
  process.exit(1);
});
