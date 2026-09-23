/**
 * SivletLabs: Scan-to-Sign Token & Meteora Launch Engine
 * 
 * Protocol: Solana Pay Transaction Request Specification
 * Supported Wallets: Phantom (Mobile & Extension), Solflare (Mobile & Extension)
 * 
 * Features:
 *   1. Starts a local Solana Pay endpoint.
 *   2. Displays an interactive ASCII QR code in the terminal.
 *   3. User scans with Phantom / Solflare mobile camera -> signs with FaceID.
 *   4. Zero private key exposure: 100% non-custodial and secure.
 */

import http from 'http';
import os from 'os';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType
} from '@solana/spl-token';
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METAPLEX_PROGRAM_ID
} from '@metaplex-foundation/mpl-token-metadata';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = parseInt(process.env.SCAN_PORT || '3402', 10);
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TOKEN_LOGO_URI = 'https://sivletlabs.github.io/assets/logo.png';
const TOKEN_METADATA_URI = 'https://sivletlabs.github.io/assets/token-metadata.json';
const TOTAL_SUPPLY_TOKENS = BigInt('1000000000000000000'); // 1 Billion tokens with 9 decimals

// Get Local LAN IP for mobile wallet connectivity
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function findMetadataPda(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METAPLEX_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    METAPLEX_PROGRAM_ID
  );
  return pda;
}

async function main() {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const localIp = getLocalIp();
  const mintKeypair = Keypair.generate();
  const mintPubkey = mintKeypair.publicKey;

  console.log('================================================================');
  console.log('SivletLabs: Scan-to-Sign Solana Deployment Engine');
  console.log('Protocol: Solana Pay Transaction Request Specification');
  console.log('================================================================\n');

  console.log(`[1/4] Generated Ephemeral Token Mint: ${mintPubkey.toBase58()}`);
  console.log(`      Metadata URI: ${TOKEN_METADATA_URI}`);
  console.log(`      Logo Avatar:  ${TOKEN_LOGO_URI}`);
  console.log(`      Total Supply: 1,000,000,000 SIVLET (Fixed 0% Inflation)`);

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // GET /api/solana-pay -> Solana Pay Metadata
    if (url.pathname === '/api/solana-pay' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        label: 'SivletLabs $SIVLET Genesis Deployment',
        icon: TOKEN_LOGO_URI
      }));
      return;
    }

    // POST /api/solana-pay -> Builds and returns transaction for user's account
    if (url.pathname === '/api/solana-pay' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          if (!parsed.account) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing account in request body' }));
            return;
          }

          const userPubkey = new PublicKey(parsed.account);
          console.log(`\n[+] Wallet Connected via Solana Pay: ${userPubkey.toBase58()}`);
          console.log('    Constructing all-in-one genesis transaction...');

          const { blockhash } = await connection.getLatestBlockhash('confirmed');
          const userAta = getAssociatedTokenAddressSync(mintPubkey, userPubkey);
          const metadataPda = findMetadataPda(mintPubkey);

          const tx = new Transaction();
          tx.feePayer = userPubkey;
          tx.recentBlockhash = blockhash;

          const metadataData = {
            name: 'SivletLabs Token',
            symbol: 'SIVLET',
            uri: TOKEN_METADATA_URI,
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null
          };

          // All 7 steps in 1 single transaction
          tx.add(
            SystemProgram.createAccount({
              fromPubkey: userPubkey,
              newAccountPubkey: mintPubkey,
              space: MINT_SIZE,
              lamports: 1461600,
              programId: TOKEN_PROGRAM_ID
            }),
            createInitializeMintInstruction(mintPubkey, 9, userPubkey, userPubkey),
            createAssociatedTokenAccountInstruction(userPubkey, userAta, userPubkey, mintPubkey),
            createMintToInstruction(mintPubkey, userAta, userPubkey, TOTAL_SUPPLY_TOKENS),
            createCreateMetadataAccountV3Instruction(
              {
                metadata: metadataPda,
                mint: mintPubkey,
                mintAuthority: userPubkey,
                payer: userPubkey,
                updateAuthority: userPubkey
              },
              {
                createMetadataAccountArgsV3: {
                  data: metadataData,
                  isMutable: false,
                  collectionDetails: null
                }
              }
            ),
            createSetAuthorityInstruction(mintPubkey, userPubkey, AuthorityType.MintTokens, null),
            createSetAuthorityInstruction(mintPubkey, userPubkey, AuthorityType.FreezeAccount, null)
          );

          // Partial sign with the new Mint Keypair
          tx.partialSign(mintKeypair);

          const serializedTx = tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false
          });

          console.log(`    Transaction successfully prepared (${serializedTx.length} bytes)!`);
          console.log('    Sending transaction payload to mobile wallet...');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            transaction: serializedTx.toString('base64'),
            message: 'Deploy $SIVLET SPL Token & Bind Verified Metaplex Metadata'
          }));
        } catch (err) {
          console.error('[-] Error constructing Solana Pay transaction:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Default fallback
    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(PORT, '0.0.0.0', () => {
    const solanaPayUri = `solana:http://${localIp}:${PORT}/api/solana-pay`;
    const webBrowserUrl = `https://sivletlabs.github.io/launch.html?mint=${mintPubkey.toBase58()}`;

    console.log(`[2/4] Solana Pay Bridge Server listening on port ${PORT}`);
    console.log(`      Endpoint: http://${localIp}:${PORT}/api/solana-pay`);
    console.log('\n[3/4] SCAN TO SIGN WITH YOUR MOBILE WALLET:');
    console.log('----------------------------------------------------------------');
    console.log('  OPTION A: OKX WALLET APP (RECOMMENDED):');
    console.log('  Open OKX App -> Tap Scan icon (top right) -> Scan QR code below:');
    console.log('  (Opens directly in OKX Web3 Browser with auto-connection)\n');

    qrcodeTerminal.generate(webBrowserUrl, { small: true }, (qr) => {
      console.log(qr);
    });
    console.log(`  OKX Web3 Launch URL: ${webBrowserUrl}\n`);

    console.log('----------------------------------------------------------------');
    console.log('  OPTION B: PHANTOM / SOLFLARE (SOLANA PAY):');
    console.log('  Open Phantom or Solflare -> Tap QR Scanner -> Scan below:\n');

    qrcodeTerminal.generate(solanaPayUri, { small: true }, (qr) => {
      console.log(qr);
    });
    console.log(`  Solana Pay URI: ${solanaPayUri}\n`);

    console.log('----------------------------------------------------------------');
    console.log('[4/4] DESKTOP EXTENSION (OKX / PHANTOM / SOLFLARE):');
    console.log(`      Open Web Launchpad: ${webBrowserUrl}`);
    console.log('      (Connect wallet and click "Sign & Deploy $SIVLET")');
    console.log('================================================================\n');
    console.log('[*] Waiting for wallet scan & signature... (Press Ctrl+C to stop)');
  });
}

main().catch(err => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
