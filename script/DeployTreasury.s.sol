// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ScriptInterface {}

import "../src/BuybackBurnEngine.sol";

contract DeployTreasuryScript {
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant BASE_WETH = 0x4200000000000000000000000000000000000006;
    address constant BASE_SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    function run() external returns (BuybackBurnEngine engine) {
        address sivletToken = address(0); // Set after Clanker deployment
        uint256 minThreshold = 50 * 1e6; // 50 USDC

        engine = new BuybackBurnEngine(
            BASE_USDC,
            BASE_WETH,
            BASE_SWAP_ROUTER,
            sivletToken,
            minThreshold
        );
    }
}
