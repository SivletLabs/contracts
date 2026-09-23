# SivletLabs Solana Tooling Suite & Meteora DLMM Guide

Production deployment, liquidity provisioning, and automated deflation scripts for the SivletLabs ($SIVLET) ecosystem on **Solana Mainnet**.

---

## Tooling Overview

| Script | Purpose | Stack |
| :--- | :--- | :--- |
| `create_spl_token.sh` | Mints 1B fixed supply $SIVLET, revokes authorities, attaches Metaplex metadata | Solana CLI, SPL Token CLI, Metaplex |
| `meteora_dlmm_setup.js` | Initializes Meteora DLMM pool, sets bin step & dynamic fees, configures Alpha Vault | `@meteora-ag/dlmm`, `@solana/web3.js` |
| `jupiter_buyback_bot.js` | Monitors Treasury USDC, executes TWAP buyback on Meteora via Jupiter, burns tokens | `@jup-ag/api`, `@solana/spl-token` |

---

## 1. Prerequisites

1. **Install Node.js (v18+)** and **Bun** or **npm**:
   ```bash
   cd scripts/solana
   npm install
   ```

2. **Solana CLI Configuration**:
   ```bash
   solana config set --url https://api.mainnet-beta.solana.com
   solana-keygen new --outfile ~/.config/solana/id.json
   ```

3. **Environment Setup**:
   Copy `.env.example` to `.env`:
   ```bash
   SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
   SOLANA_KEYPAIR_PATH="/Users/echo/.config/solana/id.json"
   SIVLET_TOKEN_MINT="<DEPLOYED_SIVLET_MINT_ADDRESS>"
   MIN_BUYBACK_USDC=50.0
   ```

---

## 2. Launching the $SIVLET Token

Run the automated minting and freeze pipeline:
```bash
npm run token:create
```

What this does:
1. Mints exactly `1,000,000,000` tokens (9 decimals).
2. Revokes mint authority permanently (0% inflation forever).
3. Revokes freeze authority permanently (non-custodial).
4. Uploads and binds token metadata to Metaplex Token Metadata V3 program.

---

## 3. Provisioning Liquidity on Meteora DLMM

Run the Meteora DLMM pool configuration generator:
```bash
npm run meteora:setup
```

Features activated:
- **DLMM Dynamic Bins**: 100 bps bin step for maximum capital efficiency.
- **Dynamic Volatility Fees**: Surges during high volume to capture toxic arbitrage for the treasury.
- **Alpha Vault Anti-Sniper**: Protects early community buyers against MEV sandwich bots.
- **Permanent LP Lock**: Locks 100% of the initial liquidity position.

---

## 4. Running the Autonomous Buyback & Burn Bot

Run the continuous TWAP buyback bot:
```bash
npm run buyback:bot
```

Features:
- Polls Treasury SPL USDC balance (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
- Routes market orders through Jupiter directly to the Meteora DLMM pool.
- Automatically burns 100% of acquired $SIVLET via SPL Token `Burn` instruction to `11111111111111111111111111111111`.
- Outputs confirmed Solscan transaction URLs for real-time verification.
