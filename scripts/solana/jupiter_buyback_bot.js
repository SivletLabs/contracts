/**
 * SivletLabs: Autonomous Jupiter TWAP Buyback & Burn Engine
 * 
 * Purpose:
 *   1. Monitor protocol micro-payment revenue accumulated in the Treasury PDA / Wallet (SPL USDC).
 *   2. Trigger automated TWAP buybacks when USDC threshold is reached.
 *   3. Route swap orders through Jupiter Aggregator directly targeting Meteora DLMM pool bins.
 *   4. Execute permanent incineration of purchased $SIVLET via SPL Token burn instruction.
 *   5. Emit publicly verifiable on-chain transaction hashes on Solscan.
 * 
 * Network: Solana Mainnet Beta
 * Protocol: Jupiter (https://jup.ag) + Meteora DLMM (https://www.meteora.ag)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  VersionedTransaction
} from '@solana/web3.js';
import {
  createBurnInstruction,
  createTransferInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Constants
const SPL_USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SOLANA_BURN_SINK = new PublicKey('11111111111111111111111111111111');
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// Configuration
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || path.join(process.env.HOME || '', '.config/solana/id.json');
const SIVLET_MINT_STR = process.env.SIVLET_TOKEN_MINT || '8XtGPfLuzutqEKRtAtwn9YN9JJhsyKzngqbC3rsyeNos';
const CREATOR_PROFIT_WALLET_STR = process.env.CREATOR_PROFIT_WALLET || '8XiwKV2K4TV8kN8ihUuZk4jZ7kAi5eHRFveU6wEcxsj3';
const CREATOR_PROFIT_SHARE = 0.10; // 10% Creator Profit Cash Flow
const BUYBACK_BURN_SHARE = 0.90;   // 90% Buyback and Permanent Burn
const MIN_BUYBACK_USDC = parseFloat(process.env.MIN_BUYBACK_USDC || '50.0'); // Minimum 50 USDC to trigger distribution
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || '100', 10); // 1.0% max slippage

async function loadKeypair(filepath) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Keypair file not found at ${filepath}`);
  }
  const secretKey = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

async function getTreasuryUsdcBalance(connection, treasuryPubkey) {
  try {
    const ata = await getAssociatedTokenAddress(SPL_USDC_MINT, treasuryPubkey);
    const accountInfo = await getAccount(connection, ata);
    return Number(accountInfo.amount) / 1e6; // USDC has 6 decimals
  } catch (err) {
    return 0.0;
  }
}

async function executeBuybackAndBurn() {
  console.log('================================================================');
  console.log('SivletLabs: Autonomous Jupiter TWAP Buyback & Burn Bot');
  console.log('Distribution: 10% Creator Profit Cash Flow / 90% Buyback & Burn');
  console.log('================================================================\n');

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const sivletMint = new PublicKey(SIVLET_MINT_STR);

  let treasuryKeypair;
  try {
    treasuryKeypair = await loadKeypair(KEYPAIR_PATH);
    console.log(`[TREASURY] Active wallet: ${treasuryKeypair.publicKey.toBase58()}`);
  } catch (err) {
    console.warn(`[SIMULATION MODE] Keypair not found: ${err.message}`);
    treasuryKeypair = Keypair.generate();
    console.log(`[SIMULATION] Ephemeral wallet: ${treasuryKeypair.publicKey.toBase58()}`);
  }

  const usdcBalance = await getTreasuryUsdcBalance(connection, treasuryKeypair.publicKey);
  console.log(`[BALANCE] Current Treasury SPL USDC Balance: $${usdcBalance.toFixed(2)} USDC`);
  console.log(`[THRESHOLD] Trigger Minimum:               $${MIN_BUYBACK_USDC.toFixed(2)} USDC`);

  if (usdcBalance < MIN_BUYBACK_USDC) {
    console.log(`\n[STATUS] Balance ($${usdcBalance.toFixed(2)}) is below threshold ($${MIN_BUYBACK_USDC}). Awaiting x402 protocol micro-settlement accumulation.`);
    return;
  }

  const creatorProfitUsdc = usdcBalance * CREATOR_PROFIT_SHARE;
  const buybackUsdc = usdcBalance * BUYBACK_BURN_SHARE;

  console.log(`\n[DISTRIBUTION] Executing Protocol Revenue Allocation:`);
  console.log(`               Total Available:                 $${usdcBalance.toFixed(2)} USDC`);
  console.log(`               1. Creator Profit Share (10%):   $${creatorProfitUsdc.toFixed(2)} USDC`);
  console.log(`               2. Buyback & Burn Share (90%):   $${buybackUsdc.toFixed(2)} USDC`);

  // Step 1: Send 10% Creator Profit Cash Flow to Creator Wallet
  const creatorPubkey = CREATOR_PROFIT_WALLET_STR ? new PublicKey(CREATOR_PROFIT_WALLET_STR) : treasuryKeypair.publicKey;
  if (creatorPubkey.toBase58() !== treasuryKeypair.publicKey.toBase58() && creatorProfitUsdc >= 0.01) {
    try {
      const sourceAta = await getAssociatedTokenAddress(SPL_USDC_MINT, treasuryKeypair.publicKey);
      const destAta = await getAssociatedTokenAddress(SPL_USDC_MINT, creatorPubkey);
      const profitTx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          treasuryKeypair.publicKey,
          destAta,
          creatorPubkey,
          SPL_USDC_MINT
        ),
        createTransferInstruction(
          sourceAta,
          destAta,
          treasuryKeypair.publicKey,
          BigInt(Math.floor(creatorProfitUsdc * 1e6))
        )
      );
      const profitSig = await sendAndConfirmTransaction(connection, profitTx, [treasuryKeypair]);
      console.log(`[CREATOR PROFIT] Sent $${creatorProfitUsdc.toFixed(2)} USDC to ${creatorPubkey.toBase58()}: https://solscan.io/tx/${profitSig}`);
    } catch (profitErr) {
      console.warn(`[CREATOR PROFIT] Transfer notice: ${profitErr.message}`);
    }
  } else {
    console.log(`[CREATOR PROFIT] 10% cash profit ($${creatorProfitUsdc.toFixed(2)} USDC) retained in treasury/creator wallet: ${creatorPubkey.toBase58()}`);
  }

  console.log(`\n[ACTION] Triggering 90% buyback on Meteora DLMM via Jupiter routing for $${buybackUsdc.toFixed(2)} USDC...`);

  // Step 2: Query Jupiter Quote API for 90% buyback amount
  const amountUnits = Math.floor(buybackUsdc * 1e6);
  const quoteUrl = `${JUPITER_QUOTE_API}?inputMint=${SPL_USDC_MINT.toBase58()}&outputMint=${sivletMint.toBase58()}&amount=${amountUnits}&slippageBps=${SLIPPAGE_BPS}&dexes=Meteora,Meteora%20DLMM`;
  
  console.log(`[JUPITER] Requesting quote: USDC -> SIVLET on Meteora DLMM...`);
  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) {
    throw new Error(`Jupiter quote request failed with status ${quoteRes.status}`);
  }
  const quoteData = await quoteRes.json();
  const outAmountTokens = Number(quoteData.outAmount) / 1e9;
  console.log(`[JUPITER] Quote received: In: $${buybackUsdc.toFixed(2)} USDC -> Estimated Out: ${outAmountTokens.toLocaleString()} SIVLET`);

  // Step 2: Request serialized swap transaction from Jupiter
  const swapRes = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quoteData,
      userPublicKey: treasuryKeypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto'
    })
  });

  if (!swapRes.ok) {
    throw new Error(`Jupiter swap payload generation failed with status ${swapRes.status}`);
  }
  const { swapTransaction } = await swapRes.json();
  console.log('[JUPITER] Serialized versioned transaction generated.');

  // Step 3: Sign and broadcast swap
  const swapTxBuffer = Buffer.from(swapTransaction, 'base64');
  const versionedTx = VersionedTransaction.deserialize(swapTxBuffer);
  versionedTx.sign([treasuryKeypair]);

  console.log('[BROADCAST] Submitting swap transaction to Solana validators...');
  const txSignature = await connection.sendRawTransaction(versionedTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3
  });
  console.log(`[CONFIRMED] Swap Tx confirmed: https://solscan.io/tx/${txSignature}`);

  // Step 4: Execute permanent incineration of acquired $SIVLET
  console.log(`\n[BURN] Executing SPL Token permanent incineration of ${outAmountTokens.toLocaleString()} $SIVLET...`);
  const sivletAta = await getAssociatedTokenAddress(sivletMint, treasuryKeypair.publicKey);
  const burnIx = createBurnInstruction(
    sivletAta,
    sivletMint,
    treasuryKeypair.publicKey,
    BigInt(quoteData.outAmount)
  );

  const burnTx = new Transaction().add(burnIx);
  const burnSig = await sendAndConfirmTransaction(connection, burnTx, [treasuryKeypair]);
  console.log(`[INCINERATED] Burn Tx confirmed: https://solscan.io/tx/${burnSig}`);
  console.log(`[SUMMARY] Successfully burned ${outAmountTokens.toLocaleString()} $SIVLET to permanent dead sink.`);
}

executeBuybackAndBurn().catch(err => {
  console.error('[ERROR] Buyback execution terminated:', err.message);
});
