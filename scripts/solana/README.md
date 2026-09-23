# SivletLabs Solana Tooling Suite & Meteora DLMM Guide

Production deployment, liquidity provisioning, and automated deflation scripts for the SivletLabs ($SIVLET) ecosystem on **Solana Mainnet**.

---

## Tooling Overview

| Script | Purpose | Stack |
| :--- | :--- | :--- |
| `create_spl_token.sh` | Mints 1B fixed supply $SIVLET, revokes authorities, attaches Metaplex metadata | Solana CLI, SPL Token CLI, Metaplex |
| `meteora_dlmm_setup.js` | Initializes Meteora DLMM pool with **10.0% Maximum Base Fee** and up to **25.0% Dynamic Volatility Surge** | `@meteora-ag/dlmm`, `@solana/web3.js` |
| `instant_buyback_burn_crank.js` | **Gas-Self-Funding Instant Crank**: Claims fees, auto-reimburses gas, market-buys $SIVLET, and burns | `@jup-ag/api`, `@meteora-ag/dlmm` |
| `jupiter_buyback_bot.js` | Autonomous TWAP buyback engine routing Treasury USDC into Meteora DLMM | `@jup-ag/api`, `@solana/spl-token` |

---

## 1. Prerequisites

1. **Install Dependencies**:
   ```bash
   cd scripts/solana
   npm install
   ```

2. **Solana CLI Configuration**:
   ```bash
   solana config set --url https://api.mainnet-beta.solana.com
   solana-keygen new --outfile ~/.config/solana/id.json
   ```

3. **Zero Deployer Contract Overhead**:
   - On Solana, SPL Token programs and Meteora DLMM programs are already deployed by the core protocol.
   - Deploying requires **0 custom smart contract compilation/rent costs**. Total account creation rent is `< 0.05 SOL` (~$7).

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
4. Binds token metadata to Metaplex Token Metadata V3 program.

---

## 3. Provisioning Liquidity on Meteora DLMM (10% Max Fee Tier)

Run the Meteora DLMM pool configuration generator:
```bash
npm run meteora:setup
```

Features activated:
- **Maximum 10.0% Base Fee (1000 bps)**: High-yield trading fee captured directly by the liquidity pool.
- **Dynamic Volatility Surge (up to 25.0%)**: Spikes during market volatility and MEV sniper attacks, extracting maximum revenue from arbitrageurs.
- **Alpha Vault Anti-Sniper**: Enforces fair launch and eliminates bot front-running.
- **100% Permanent LP Lock**: Eliminates rug vectors forever.

---

## 4. Running the Gas-Self-Funding Instant Buyback & Burn Crank

Launch the real-time continuous buyback bot:
```bash
npm run crank:instant
```

### How the Gas-Self-Funding Flywheel Works:
```
Trade on Meteora DLMM (Buy or Sell)
      │
      ▼
10% ~ 25% Fee Accumulated in DLMM Pool (SOL / USDC)
      │
      ▼
Crank Claims Trading Fee
      ├─► Withholds 0.00005 SOL (~$0.007) to replenish its own transaction gas!
      │    └─► Deployer pays ZERO out-of-pocket gas on an ongoing basis!
      │
      └─► 99.999% of fees immediately market-buy $SIVLET via Jupiter routing
           └─► 100% of acquired $SIVLET is burned to 11111111111111111111111111111111!
```

- **Perpetual Operation**: As long as trading volume exists, the crank fuels its own gas from the collected trading fees.
- **Instant Buy Pressure**: Every sell creates an immediate market-buyback and supply reduction on the chart.
