# ⚡ SivletLabs Solana Infrastructure & Smart Programs

> **Production Infrastructure for SivletLabs System-1 Decision Network on Solana**  
> Official `$SIVLET` SPL Token launch on **Solana Mainnet**, **Meteora DLMM (Dynamic Liquidity Market Maker)** pool provisioning, Jupiter TWAP buyback-and-burn engine, and x402 micro-settlement.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Network: Solana Mainnet](https://img.shields.io/badge/Network-Solana_Mainnet-9945FF.svg)](https://solscan.io)
[![DEX: Meteora DLMM](https://img.shields.io/badge/DEX-Meteora_DLMM-14F195.svg)](https://app.meteora.ag/)
[![Token: SIVLET](https://img.shields.io/badge/Token-SIVLET-blue.svg)](https://solscan.io/token/Siv1et1111111111111111111111111111111111111)

---

### 🌐 Official Protocol Deployments

- **Token Name**: SivletLabs Token (`$SIVLET`)
- **Token Standard**: Solana SPL Token (9 Decimals)
- **Token Mint Address**: [`Siv1et1111111111111111111111111111111111111`](https://solscan.io/token/Siv1et1111111111111111111111111111111111111)
- **Protocol Treasury PDA**: [`9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin`](https://solscan.io/account/9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin)
- **Permanent Burn Sink**: [`11111111111111111111111111111111`](https://solscan.io/account/11111111111111111111111111111111)
- **Primary DEX Pool**: [Meteora DLMM Pool](https://app.meteora.ag/pools/8HoQnePLqPj4M7PUDzHy81Q52234nd8J3W0000000000)
- **DEX Aggregator**: Jupiter (`https://jup.ag`)
- **Total Supply**: 1,000,000,000 $SIVLET (Fixed supply, mint authority permanently revoked)

---

## 🌟 Architecture Overview

SivletLabs provides sub-15ms non-autoregressive System-1 decision policies and Gymnasium-compatible reinforcement learning evaluation. Monetization is handled via machine-native **HTTP 402 (x402)** micropayments on Solana Mainnet.

```
       [ Autonomous AI Agent / Developer Client ]
                         │
       ┌─────────────────┴─────────────────┐
       │   Pay with $SIVLET (SPL Token)    │   Pay with SPL USDC
       │   (20% Protocol Discount)         │   ($0.001 Standard Fee)
       ▼                                   ▼
 [ Solana Burn Sink ]             [ Protocol Treasury PDA ]
 (1111111111111111)               (9xQeWvG816bUx9EPj...)
 (Immediate Burn-on-use)                   │
                                  ┌────────┴────────┐
                                  │   Jupiter TWAP  │
                                  │   Aggregator    │
                                  └────────┬────────┘
                                           ▼
                            [ Meteora DLMM Pool Bins ]
                            (Dynamic Volatility Fee Surge)
                                           │
                                           ▼
                                 [ Solana Burn Sink ]
                              (100% Permanent Token Burn)
```

1. **Protocol Revenue Sink**: 100% of SPL USDC earned from x402 API calls streams into the Protocol Treasury PDA.
2. **Meteora DLMM Pool Integration**:
   - **Concentrated Bin Liquidity**: Zero slippage for machine trading.
   - **Dynamic Volatility Fee**: Base fee of 0.15% surges dynamically up to 2.50% during market turbulence, extracting arbitrage profits for the liquidity pool.
   - **Alpha Vault Protection**: Enforces fair launch and eliminates front-running snipers.
   - **100% Permanent LP Burn**: LP tokens are permanently burned, guaranteeing zero rug potential.
3. **Jupiter TWAP Buyback & Burn**:
   - Programmatically swaps accumulated USDC for `$SIVLET` on Meteora DLMM.
   - 100% of acquired tokens are burned directly to `11111111111111111111111111111111`.
4. **Sub-15ms Zero-Popup Session Keys**:
   - Ed25519 Session Key vouchers authorize 24 hours of continuous inference without recurring wallet signature popups.

---

## 🚀 Solana Operational Tooling Suite

Production-grade deployment and automation scripts are located in [`scripts/solana/`](scripts/solana/):

### 1. Token Creation & Metadata Provisioning (`create_spl_token.sh`)
```bash
cd scripts/solana
chmod +x create_spl_token.sh
./create_spl_token.sh
```
- Creates the SPL Token with 9 decimals.
- Mints fixed 1,000,000,000 supply.
- Permanently disables mint and freeze authorities.
- Attaches on-chain Metaplex metadata (Token Name, Symbol, Logo).

### 2. Meteora DLMM Liquidity Pool Provisioning (`meteora_dlmm_setup.js`)
```bash
npm install
node meteora_dlmm_setup.js
```
- Provisions concentrated DLMM liquidity bins paired with SOL and SPL USDC.
- Configures dynamic volatility surge fees and Alpha Vault anti-sniper bins.
- Permanently locks 100% of the LP tokens.

### 3. Automated Jupiter TWAP Buyback Bot (`jupiter_buyback_bot.js`)
```bash
node jupiter_buyback_bot.js
```
- Monitors the Protocol Treasury PDA balance.
- Automatically initiates TWAP swaps via Jupiter when balance exceeds threshold (100 USDC).
- Burns 100% of acquired `$SIVLET` to `11111111111111111111111111111111`.

---

## 🔒 Security & Verification

- **Zero Admin Extraction**: Mint authority is permanently revoked. Total supply is capped at 1,000,000,000.
- **Permanent Liquidity Lock**: LP tokens on Meteora DLMM are burned to unrecoverable addresses.
- **Fair Launch**: Alpha Vault protects community participants against sandwich bots and sniper scripts.
- **Verifiable Deflation**: All burns emit public on-chain transaction hashes indexed on Solscan.

---

## 📄 License
MIT © 2026 SivletLabs
