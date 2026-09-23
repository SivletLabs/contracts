#!/usr/bin/env node

/**
 * @file attach_metadata.js
 * @description Production helper script to bind Metaplex Token Metadata to an SPL Token mint.
 * SivletLabs Token Launch Tooling ($SIVLET)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METAPLEX_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';

// Load environment variables if .env exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

function printUsage() {
  console.log(`
Usage:
  node attach_metadata.js [options]

Options:
  --mint <PUBKEY>          Token Mint public key (required)
  --keypair <PATH>         Path to keypair JSON of mint authority / payer (default: ~/.config/solana/id.json)
  --rpc <URL>              Solana RPC URL (default: https://api.mainnet-beta.solana.com or process.env.SOLANA_RPC_URL)
  --name <STRING>          Token Name (default: "SivletLabs Token")
  --symbol <STRING>        Token Symbol / Ticker (default: "SIVLET")
  --uri <URL>              Metadata JSON URI (default: "https://sivletlabs.github.io/assets/token-metadata.json")
  --immutable              Set isMutable to false (freezes metadata permanently)
  --help                   Display this help message
  `);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    mint: process.env.SIVLET_MINT_ADDRESS || null,
    keypair: process.env.KEYPAIR_PATH || path.join(process.env.HOME || '', '.config', 'solana', 'id.json'),
    rpc: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    name: process.env.TOKEN_NAME || 'SivletLabs Token',
    symbol: process.env.TOKEN_SYMBOL || 'SIVLET',
    uri: process.env.TOKEN_METADATA_URI || 'https://sivletlabs.github.io/assets/token-metadata.json',
    immutable: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--mint' && args[i + 1]) {
      params.mint = args[++i];
    } else if (arg === '--keypair' && args[i + 1]) {
      params.keypair = args[++i];
    } else if (arg === '--rpc' && args[i + 1]) {
      params.rpc = args[++i];
    } else if (arg === '--name' && args[i + 1]) {
      params.name = args[++i];
    } else if (arg === '--symbol' && args[i + 1]) {
      params.symbol = args[++i];
    } else if (arg === '--uri' && args[i + 1]) {
      params.uri = args[++i];
    } else if (arg === '--immutable') {
      params.immutable = true;
    }
  }

  return params;
}

function loadKeypair(filePath) {
  try {
    const resolvedPath = path.resolve(filePath.replace(/^~(?=$|\/|\\)/, process.env.HOME || ''));
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Keypair file not found at: ${resolvedPath}`);
    }
    const secretKeyArray = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
  } catch (err) {
    console.error(`[-] Failed to load keypair from "${filePath}":`, err.message);
    process.exit(1);
  }
}

async function main() {
  console.log('====================================================');
  console.log(' SivletLabs Metaplex Token Metadata Binding Tool');
  console.log('====================================================\n');

  const config = parseArgs();

  if (!config.mint) {
    console.error('[-] Error: Token Mint address is required. Specify with --mint <PUBKEY> or SIVLET_MINT_ADDRESS env.');
    printUsage();
    process.exit(1);
  }

  let mintPubkey;
  try {
    mintPubkey = new PublicKey(config.mint);
  } catch {
    console.error(`[-] Invalid mint public key provided: ${config.mint}`);
    process.exit(1);
  }

  const payer = loadKeypair(config.keypair);
  const connection = new Connection(config.rpc, 'confirmed');

  console.log(`[+] RPC Endpoint:      ${config.rpc}`);
  console.log(`[+] Payer / Authority: ${payer.publicKey.toBase58()}`);
  console.log(`[+] Token Mint:        ${mintPubkey.toBase58()}`);
  console.log(`[+] Token Name:        ${config.name}`);
  console.log(`[+] Token Ticker:      ${config.symbol}`);
  console.log(`[+] Metadata URI:      ${config.uri}`);
  console.log(`[+] Metadata Mutable:  ${!config.immutable}`);

  // Check Payer Balance
  const balanceLamports = await connection.getBalance(payer.publicKey);
  const balanceSol = balanceLamports / 1e9;
  console.log(`[+] Authority Balance: ${balanceSol.toFixed(4)} SOL`);

  if (balanceSol < 0.015) {
    console.warn(`[!] Warning: Authority balance is low (< 0.015 SOL). Transaction may fail due to rent fees.`);
  }

  // Derive PDA for Metaplex Metadata Account
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METAPLEX_PROGRAM_ID.toBuffer(),
      mintPubkey.toBuffer(),
    ],
    METAPLEX_PROGRAM_ID
  );

  console.log(`[+] Metadata PDA:      ${metadataPDA.toBase58()}`);

  // Verify if metadata account already exists
  const existingAccount = await connection.getAccountInfo(metadataPDA);
  if (existingAccount !== null) {
    console.log(`[!] Metadata account already exists for mint ${mintPubkey.toBase58()}. Skipping creation.`);
    return;
  }

  // Construct CreateMetadataAccountV3 instruction
  const accounts = {
    metadata: metadataPDA,
    mint: mintPubkey,
    mintAuthority: payer.publicKey,
    payer: payer.publicKey,
    updateAuthority: payer.publicKey,
  };

  const dataV2 = {
    name: config.name,
    symbol: config.symbol,
    uri: config.uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  };

  const args = {
    createMetadataAccountArgsV3: {
      data: dataV2,
      isMutable: !config.immutable,
      collectionDetails: null,
    },
  };

  const metadataInstruction = createCreateMetadataAccountV3Instruction(accounts, args);

  const tx = new Transaction().add(metadataInstruction);

  console.log('\n[*] Submitting CreateMetadataAccountV3 transaction...');
  try {
    const signature = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });

    console.log('[+] Metaplex Metadata successfully attached!');
    console.log(`[+] Transaction Signature: ${signature}`);
    console.log(`[+] Solscan: https://solscan.io/tx/${signature}`);
    console.log(`[+] Token Page: https://solscan.io/token/${mintPubkey.toBase58()}`);
  } catch (err) {
    console.error('[-] Transaction failed:', err.message);
    if (err.logs) {
      console.error('[-] Transaction Program Logs:');
      err.logs.forEach((log) => console.error(`    ${log}`));
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[-] Unexpected fatal error:', err);
  process.exit(1);
});
