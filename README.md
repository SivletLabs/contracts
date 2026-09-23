# ⚡ SivletLabs Smart Contracts

> **Production Smart Contracts for SivletLabs System-1 Decision Network**  
> Official `$SIVLET` fair launch on **Robinhood Chain** via **Pons**, permissionless buyback-and-burn engine, and decentralized keeper incentives.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Network: Robinhood Chain](https://img.shields.io/badge/Network-Robinhood_Chain_(4663)-00C805.svg)](https://robinhoodchain.blockscout.com)
[![Token: SIVLET](https://img.shields.io/badge/Token-0xb783...e2e1-00FF66.svg)](https://robinhoodchain.blockscout.com/token/0xb7832ca55ea7f9aa1504657376117b98deb4e2e1)
[![Solidity: 0.8.24](https://img.shields.io/badge/Solidity-0.8.24-363636.svg)](https://soliditylang.org/)

---

### 🌐 Official Live Contract Deployments

- **Token Name**: SivletLabs (`$SIVLET`)
- **Token Contract Address**: [`0xb7832ca55ea7f9aa1504657376117b98deb4e2e1`](https://robinhoodchain.blockscout.com/token/0xb7832ca55ea7f9aa1504657376117b98deb4e2e1)
- **Treasury Contract Address (BuybackBurnEngine)**: [`0x6B50f02D2292a28928bCe0F97b654E4DCbC75F8A`](https://robinhoodchain.blockscout.com/address/0x6B50f02D2292a28928bCe0F97b654E4DCbC75F8A)
- **Token Deployment Transaction**: [`0x6888381f1df994cdc4b9c38eee7b5cafe23d595269255ad92cbc56e5abba91b9`](https://robinhoodchain.blockscout.com/tx/0x6888381f1df994cdc4b9c38eee7b5cafe23d595269255ad92cbc56e5abba91b9)
- **Launchpad**: [Pons](https://www.ponsfamily.com/launchpad/0xb7832ca55ea7f9aa1504657376117b98deb4e2e1)
- **Network**: Robinhood Chain Mainnet (Chain ID: `4663`)
- **Total Supply**: 1,000,000,000 $SIVLET (18 decimals, fixed)


---

## 🌟 Architecture Overview

SivletLabs provides high-throughput, non-autoregressive System-1 decision policies and Gymnasium-compatible reinforcement learning evaluation. Monetization is handled via the machine-native **HTTP 402 (x402)** protocol.

```
       [ AI Agent / Developer Client ]
                 │
       ┌──────────┴──────────┐
       │  Pay with $SIVLET   │  Pay with USDC
       │  (20% Discount)     │  (Standard Fee)
       ▼                     ▼
 [ 0x...dEaD ]         [ Protocol Treasury ]
 (Immediate Burn)      (BuybackBurnEngine)
                             │
                ┌────────────┴────────────┐
                │ Uniswap v3 Multi-Hop    │
                │ USDC ─[0.05%]─► WETH    │
                │   │                     │
                │   └─[1.00%]──► $SIVLET  │
                ▼                         ▼
          [ 0x...dEaD ]          [ 1% Founder Lock ]
       (99% Permanent Burn)   (Locked until $100K FDV)
```

1. **Protocol Revenue Sink**: 100% of USDC earned from x402 API calls is held by `BuybackBurnEngine`.
2. **Uniswap v3 Multi-Hop Swap**: Because Clanker pools on Base pair `$SIVLET` with **WETH**, the treasury executes an atomic multi-hop swap:  
   $$\text{USDC} \xrightarrow{0.05\%} \text{WETH} \xrightarrow{1.0\%} \text{\$SIVLET}$$
3. **99% Burn / 1% Founder Incentive Split**:
   - **99%** of bought tokens are transferred directly to `0x...dEaD` (Permanent Burn Sink).
   - **1%** of bought tokens are retained in the treasury as **Founder Equity Incentive** (`lockedFounderTokens`).
   - **$100,000 USD Market Cap (100K FDV) Unlock Milestone**: Locked incentive tokens cannot be claimed until the token reaches $100K market cap ($0.00010/token for 1B supply). Once reached, the founder calls `claimFounderIncentive()`.
4. **Decentralized Keeper Bounty**: Anyone or automated bots (Chainlink Automation, Gelato, or cron) can call `executeBuybackAndBurn()`. The caller is awarded **0.5% (50 bps)** of the transaction in USDC to cover gas fees.
5. **Dual-Currency x402 Utility**: Users paying directly with `$SIVLET` receive a **20% protocol discount**, and their tokens are burned directly on use.

---

## 🚀 Part 1: Launching $SIVLET on Base via Clanker

Clanker is the premier fair-launch platform on Base L2 (powering tokens like `$LUM` and `$ANON`). When launched through Clanker, standard Uniswap v3 liquidity is automatically seeded and locked.

### Method A: One-Click Cast on Warpcast (Farcaster)

1. Open [Warpcast](https://warpcast.com).
2. Attach the official SivletLabs logo (`website/assets/logo.png`).
3. Post the following Cast tagging `@clanker`:

```text
@clanker Deploy a token named SivletLabs with symbol SIVLET for @sivletlabs System-1 decision models and x402 micropayment engine https://sivletlabs.github.io
```

### Method B: Web Interface Fallback

If you prefer launching via browser without Warpcast:
- Visit **[clanker.world/deploy](https://www.clanker.world/deploy)**
- Connect your Base wallet
- Fill in:
  - **Token Name**: `SivletLabs`
  - **Symbol**: `SIVLET`
  - **Image**: Upload official green `S` logo
  - **Description**: `System-1 Decision Models & Evaluation Infrastructure. Pay-per-call via x402. Protocol revenue automatically buys back and burns $SIVLET on Uniswap v3.`

---

## 🏛️ Part 2: Contracts in This Repository

### 1. `BuybackBurnEngine.sol` (Protocol Treasury)
- **Deployed Address (Robinhood Chain)**: [`0x6B50f02D2292a28928bCe0F97b654E4DCbC75F8A`](https://robinhoodchain.blockscout.com/address/0x6B50f02D2292a28928bCe0F97b654E4DCbC75F8A)
- **Pons Bonding Pool**: `0x5F02BE04d20aB66cf5Ea33ECda25194AECAd5601`
- **Pons Router**: `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`
- **Permanent Burn Sink**: `0x000000000000000000000000000000000000dEaD`
- **Dual Payment & Execution Support**:
  - `receive() external payable`: Accepts native ETH from x402 inference micropayments.
  - `executeBuybackEth(address targetDEX, bytes callData, uint256 minTokensOut)`: Native ETH buyback executed on Pons bonding pool or any DEX router.
  - `executeBuybackAndBurn(uint256 minAmountOut)`: ERC-20 (USDC) buyback via Uniswap router.
- **Key Methods**:
  - `claimFounderIncentive()`: Allows founder to withdraw accumulated incentive tokens once the $100,000 USD FDV milestone is unlocked.
  - `unlockMarketCapGoal()`: Milestone unlock trigger when 100K FDV condition is verified.
  - `setSwapRouter(address newRouter)`: Mutable DEX adapter allowing seamless upgrade to Uniswap v4 upon graduation.
  - `setFounderAddress(address newFounder)`: Updates the designated founder payout address (e.g. transfer to multisig or cold wallet).
  - `burnDirect(uint256 amount)`: Burn-on-use utility function for $SIVLET payments.
  - `getFounderIncentiveStatus()`: Returns locked tokens, cumulative accumulated/claimed tokens, and milestone status.
  - `getTreasuryStatus()`: View function returning balance, execution readiness, cooldown, and cumulative metrics.
  - `configureSivletToken(address token, uint24 fee)`: Configures the deployed token address.

### 2. `SivletToken.sol` (Reference & Testing Token)
- Standard ERC-20 implementation with fixed 1,000,000,000 supply, EIP-2612 gasless approvals (`permit`), and burn capabilities.

---

## 🛠️ Developer Quickstart

### Prerequisites
- Node.js >= 20 or Bun >= 1.3
- Optional: Foundry (`forge`)

### Install Dependencies
```bash
bun install
```

### Compile Contracts
```bash
# Using Hardhat
npx hardhat compile

# Or using local compiler script
bun run scripts/compile.ts
```

### Run Unit Tests
```bash
npx hardhat test
```

---

## 🚢 Deployment to Base

### 1. Configure Environment
Copy `.env.example` to `.env`:
```bash
PRIVATE_KEY="your-private-key-without-0x"
BASE_RPC_URL="https://mainnet.base.org"
BASESCAN_API_KEY="your-basescan-api-key"
MIN_TRIGGER_USDC="50"
```

### 2. Deploy Treasury
```bash
# Test on Base Sepolia
npx hardhat run scripts/deploy-treasury.js --network baseSepolia

# Deploy to Base Mainnet
npx hardhat run scripts/deploy-treasury.js --network base
```

### 3. Connect Clanker Token
Once Clanker creates the `$SIVLET` token contract on Base:
```javascript
// In hardhat console or script:
const treasury = await ethers.getContractAt("BuybackBurnEngine", TREASURY_ADDRESS);
await treasury.configureSivletToken(SIVLET_TOKEN_ADDRESS, 10000); // 1% pool fee
```

### 4. Verify on Basescan
```bash
npx hardhat verify --network base \
  <TREASURY_ADDRESS> \
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  "0x4200000000000000000000000000000000000006" \
  "0x2626664c2603336E57B271c5C0b26F421741e481" \
  "<SIVLET_TOKEN_ADDRESS>" \
  "50000000"
```

---

## 🤖 Decentralized Keeper Bot

Run automated checks every hour or configure Chainlink Automation / Gelato to monitor `getTreasuryStatus()`:

```bash
TREASURY_ADDRESS="0x..." npx hardhat run scripts/trigger-buyback.js --network base
```

---

## 🔒 Security & Verification

- **Zero Admin Extraction**: The contract contains NO withdraw functions for USDC or SIVLET. All funds can only flow into the Uniswap router and straight to `0x...dEaD`.
- **Slippage Protection**: `executeBuybackAndBurn` accepts an `amountOutMinimum` parameter to protect against MEV sandwich attacks.
- **Cooldown Interval**: Prevents transaction spamming and pool manipulation.

---

## 📄 License
MIT © 2026 SivletLabs
