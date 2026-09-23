require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Bypass local proxy for Robinhood Chain RPC to avoid TLS connection reset
if (process.env.HTTP_PROXY || process.env.http_proxy) {
  process.env.NO_PROXY = `${process.env.NO_PROXY || ""},.robinhood.com,rpc.mainnet.chain.robinhood.com,4663`;
  process.env.no_proxy = process.env.NO_PROXY;
}

function getAccounts() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk || pk === "your_private_key_here" || pk === "your-private-key-without-0x") return [];
  const cleanPk = pk.trim();
  return [cleanPk.startsWith("0x") ? cleanPk : `0x${cleanPk}`];
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    hardhat: {},
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: getAccounts()
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: getAccounts()
    },
    robinhood: {
      url: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: getAccounts()
    }
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
      robinhood: process.env.BLOCKSCOUT_API_KEY || "empty"
    },
    customChains: [
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com"
        }
      }
    ]
  }
};
