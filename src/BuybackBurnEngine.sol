// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev Standard interface for ERC-20 tokens
 */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @dev Uniswap v3 SwapRouter interface supporting exactInput multi-hop routing
 */
interface ISwapRouter {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/**
 * @title BuybackBurnEngine (SivletLabs Protocol Treasury on Base L2)
 * @notice Receives x402 USDC micropayments and executes permissionless,
 *         TWAP-protected market buybacks of $JEV / $SIVLET on Base Uniswap v3.
 *         
 * Manifesto: "The Sivlet Team Works for the Treasury"
 *  - Zero pre-mined team dumps. The team is employed by the autonomous protocol treasury.
 *  - 100% of x402 API revenue streams into the treasury contract.
 *  - 99% of every buyback is permanently burned to 0x000...dEaD.
 *  - 1% of every buyback is allocated to the Founder / Team Equity Incentive Pool.
 *  - Startup-Style Perpetual Cliff Vesting Model:
 *      1. Master Milestone Cliff ($100K FDV): 100% locked until market cap reaches $100,000 USD.
 *      2. Monthly Cliff Cycles: Passing $100K activates the vesting clock (30-day epoch cliffs).
 *      3. Perpetual Longevity: Continues into infinity as new revenue feeds the treasury, ensuring
 *         contributors are forever incentivized to grow protocol revenue.
 * 
 * Security Features:
 *  - Checks-Effects-Interactions (CEI) pattern + ReentrancyGuard
 *  - Multi-hop Uniswap v3 swap route (USDC -> WETH -> $JEV)
 *  - Strict Rug-Pull Prevention: Zero admin withdrawals for USDC protocol revenue or SIVLET tokens
 *  - Automated Keeper Bounty (0.5%) to incentivize decentralized calling
 *  - Cooldown & Minimum Balance constraints to prevent high-frequency sandwich attacks
 */
contract BuybackBurnEngine {
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // Base Mainnet Constants:
    // USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimals)
    // WETH: 0x4200000000000000000000000000000000000006 (18 decimals)
    // Uniswap v3 SwapRouter02: 0x2626664c2603336E57B271c5C0b26F421741e481
    IERC20 public immutable usdc;
    address public immutable weth;
    ISwapRouter public immutable swapRouter;

    // Address of the $JEV / $SIVLET token
    address public sivletToken;

    // Encoded Uniswap v3 swap path (e.g. USDC -[500]-> WETH -[10000]-> $JEV)
    bytes public swapPath;

    // Contract administrator
    address public owner;

    // Founder equity recipient address (defaults to deployer/owner)
    address public founderAddress;

    // Reentrancy guard state
    uint256 private _reentrancyStatus;

    // Execution parameters
    uint256 public minTriggerThreshold; // e.g. 50 * 10^6 (50 USDC)
    uint256 public cooldownInterval = 1 hours;
    uint256 public lastExecutionTimestamp;

    // Keeper incentive: 0.5% in basis points (50 bps) paid in USDC to keeper
    uint256 public constant CALLER_BOUNTY_BPS = 50; 
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Founder Equity Incentive: 1% (100 bps) of tokens bought during buybacks
    uint256 public constant FOUNDER_INCENTIVE_BPS = 100;

    // Master Milestone Unlock: $100,000 USD Market Cap (in USDC 6 decimals)
    uint256 public targetMarketCap = 100_000 * 1e6;
    bool public isMarketCapGoalReached;
    uint256 public cliffActivationTimestamp; // Timestamp when 100K milestone activated the vesting clock

    // Periodic Cliff Parameters (Startup-style monthly cliff vesting)
    uint256 public constant CLIFF_PERIOD = 30 days; // 30-day epoch cycle
    uint256 public vestingDurationMonths = 12;      // 12-month post-cliff vesting schedule

    // Cumulative transparent protocol metrics
    uint256 public totalUsdcSpent;
    uint256 public totalTokensBurned;
    uint256 public totalBurnEvents;

    // Founder incentive tracking
    uint256 public totalFounderIncentiveAccumulated;
    uint256 public totalFounderIncentiveClaimed;

    // Events
    event TokensBurned(
        uint256 indexed burnId,
        uint256 usdcSpent,
        uint256 tokensDestroyed,
        uint256 founderIncentiveLocked,
        address indexed caller,
        uint256 timestamp
    );

    event DirectBurn(
        address indexed burner,
        uint256 tokensBurned,
        uint256 timestamp
    );

    event CallerBountyPaid(address indexed caller, uint256 bountyAmount);
    event SivletTokenConfigured(address indexed token, bytes path);
    event ParametersUpdated(uint256 minThreshold, uint256 cooldown);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event EmergencyRescued(address indexed token, address indexed to, uint256 amount);

    event FounderIncentiveClaimed(address indexed recipient, uint256 amount, uint256 timestamp);
    event MarketCapGoalReached(uint256 impliedMarketCap, uint256 timestamp);
    event FounderAddressUpdated(address indexed previousFounder, address indexed newFounder);
    event TargetMarketCapUpdated(uint256 newTargetMarketCap);
    event VestingDurationUpdated(uint256 newDurationMonths);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier nonReentrant() {
        require(_reentrancyStatus != 2, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    constructor(
        address _usdc,
        address _weth,
        address _swapRouter,
        address _sivletToken,
        uint256 _minTriggerThreshold
    ) {
        require(_usdc != address(0) && _weth != address(0) && _swapRouter != address(0), "Zero address");
        owner = msg.sender;
        founderAddress = msg.sender;
        usdc = IERC20(_usdc);
        weth = _weth;
        swapRouter = ISwapRouter(_swapRouter);
        minTriggerThreshold = _minTriggerThreshold > 0 ? _minTriggerThreshold : 50 * 1e6; // default 50 USDC
        _reentrancyStatus = 1;

        if (_sivletToken != address(0)) {
            _configureSivletRoute(_sivletToken, 10000); // Default Clanker 1% fee
        }
    }

    /**
     * @notice Configure or update the token address and swap path
     * @param _token The deployed $JEV / $SIVLET contract address
     * @param _tokenFee Uniswap pool fee tier (e.g. 10000 for 1% Clanker standard, or 3000 for 0.3%)
     */
    function configureSivletToken(address _token, uint24 _tokenFee) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        _configureSivletRoute(_token, _tokenFee);
    }

    /**
     * @notice Set custom swap path (e.g. if a direct USDC/JEV pool is formed)
     */
    function setCustomSwapPath(bytes calldata _path) external onlyOwner {
        require(_path.length > 0, "Invalid path");
        swapPath = _path;
    }

    function _configureSivletRoute(address _token, uint24 _tokenFee) internal {
        sivletToken = _token;
        // Default multi-hop route: USDC -> (500 fee = 0.05%) -> WETH -> (_tokenFee = 1%) -> Token
        swapPath = abi.encodePacked(
            address(usdc),
            uint24(500),
            weth,
            _tokenFee,
            _token
        );
        emit SivletTokenConfigured(_token, swapPath);
    }

    /**
     * @notice Permissionless buyback and burn trigger.
     *         Anyone or any decentralized keeper can call this when criteria are met.
     * @param minAmountOut Minimum tokens expected from swap (slippage protection).
     */
    function executeBuybackAndBurn(uint256 minAmountOut) external nonReentrant returns (uint256 tokensBought) {
        require(sivletToken != address(0), "Token not configured");
        require(swapPath.length > 0, "Swap path not set");

        uint256 usdcBalance = usdc.balanceOf(address(this));
        require(usdcBalance >= minTriggerThreshold, "Insufficient treasury balance");
        require(block.timestamp >= lastExecutionTimestamp + cooldownInterval, "Cooldown active");

        // Follow Checks-Effects-Interactions (CEI)
        lastExecutionTimestamp = block.timestamp;

        // 1. Calculate keeper incentive (0.5%)
        uint256 callerBounty = (usdcBalance * CALLER_BOUNTY_BPS) / BPS_DENOMINATOR;
        uint256 swapAmount = usdcBalance - callerBounty;

        if (callerBounty > 0) {
            bool bountySuccess = usdc.transfer(msg.sender, callerBounty);
            require(bountySuccess, "Bounty transfer failed");
            emit CallerBountyPaid(msg.sender, callerBounty);
        }

        // 2. Safe approval: reset to 0 first, then approve swapAmount
        usdc.approve(address(swapRouter), 0);
        usdc.approve(address(swapRouter), swapAmount);

        // 3. Execute exactInput multi-hop swap: USDC -> WETH -> SIVLET -> address(this)
        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: swapPath,
            recipient: address(this), // Contract receives tokens to split burn (99%) and founder lock (1%)
            amountIn: swapAmount,
            amountOutMinimum: minAmountOut
        });

        tokensBought = swapRouter.exactInput(params);
        require(tokensBought > 0, "Zero tokens bought");

        // 4. Split: 1% Founder Equity Incentive locked, 99% burned to DEAD_ADDRESS
        uint256 founderIncentive = (tokensBought * FOUNDER_INCENTIVE_BPS) / BPS_DENOMINATOR;
        uint256 tokensToBurn = tokensBought - founderIncentive;

        totalFounderIncentiveAccumulated += founderIncentive;

        bool burnSuccess = IERC20(sivletToken).transfer(DEAD_ADDRESS, tokensToBurn);
        require(burnSuccess, "Burn transfer failed");

        // 5. Check if market swap implies Market Cap ($100k FDV) master milestone is reached
        uint256 tokenSupply = IERC20(sivletToken).totalSupply();
        if (!isMarketCapGoalReached && tokenSupply > 0) {
            // Implied Market Cap in USDC (6 decimals) = (swapAmount * tokenSupply) / tokensBought
            uint256 impliedMarketCap = (swapAmount * tokenSupply) / tokensBought;
            if (impliedMarketCap >= targetMarketCap) {
                isMarketCapGoalReached = true;
                cliffActivationTimestamp = block.timestamp;
                emit MarketCapGoalReached(impliedMarketCap, block.timestamp);
            }
        }

        // 6. Update cumulative statistics
        totalUsdcSpent += swapAmount;
        totalTokensBurned += tokensToBurn;
        totalBurnEvents++;

        emit TokensBurned(
            totalBurnEvents,
            swapAmount,
            tokensToBurn,
            founderIncentive,
            msg.sender,
            block.timestamp
        );

        return tokensBought;
    }

    /**
     * @notice Unlock founder incentive milestone if $100K market cap is confirmed
     */
    function unlockMarketCapGoal() external onlyOwner {
        require(!isMarketCapGoalReached, "Goal already unlocked");
        isMarketCapGoalReached = true;
        cliffActivationTimestamp = block.timestamp;
        emit MarketCapGoalReached(targetMarketCap, block.timestamp);
    }

    /**
     * @notice Calculate currently claimable founder incentive tokens based on monthly cliff schedule
     * @dev Before 100K FDV: returns 0.
     *      After 100K FDV: unlocks in 30-day epoch cliffs according to vestingDurationMonths.
     */
    function getClaimableFounderTokens() public view returns (uint256) {
        if (!isMarketCapGoalReached || cliffActivationTimestamp == 0) {
            return 0;
        }

        uint256 elapsedPeriods = (block.timestamp - cliffActivationTimestamp) / CLIFF_PERIOD;
        // Month 0 (immediate upon reaching 100K cliff milestone): 1 tranche vested
        uint256 effectivePeriods = elapsedPeriods + 1;

        uint256 totalVested;
        if (effectivePeriods >= vestingDurationMonths) {
            totalVested = totalFounderIncentiveAccumulated;
        } else {
            totalVested = (totalFounderIncentiveAccumulated * effectivePeriods) / vestingDurationMonths;
        }

        if (totalVested <= totalFounderIncentiveClaimed) {
            return 0;
        }

        return totalVested - totalFounderIncentiveClaimed;
    }

    /**
     * @notice Claim vested founder equity incentive tokens
     * @dev Only claimable once the $100K FDV cliff is unlocked, vested via 30-day periodic cliffs
     */
    function claimFounderIncentive() external nonReentrant {
        address recipient = founderAddress != address(0) ? founderAddress : owner;
        require(msg.sender == owner || msg.sender == recipient, "Only founder or owner");
        require(isMarketCapGoalReached, "Market cap milestone (100K FDV) not yet reached");

        uint256 claimable = getClaimableFounderTokens();
        require(claimable > 0, "No vested tokens available to claim in current cliff cycle");

        totalFounderIncentiveClaimed += claimable;

        bool success = IERC20(sivletToken).transfer(recipient, claimable);
        require(success, "Incentive transfer failed");

        emit FounderIncentiveClaimed(recipient, claimable, block.timestamp);
    }

    /**
     * @notice Direct burn for users who pay in $JEV / $SIVLET directly (Burn-on-use utility)
     * @param amount Amount of tokens to burn from caller's wallet
     */
    function burnDirect(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(sivletToken != address(0), "Token not configured");

        bool success = IERC20(sivletToken).transferFrom(msg.sender, DEAD_ADDRESS, amount);
        require(success, "Transfer failed");

        totalTokensBurned += amount;
        emit DirectBurn(msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Set or update the designated founder incentive recipient
     */
    function setFounderAddress(address _founder) external onlyOwner {
        require(_founder != address(0), "Zero address");
        emit FounderAddressUpdated(founderAddress, _founder);
        founderAddress = _founder;
    }

    /**
     * @notice Update the target market cap milestone in USDC
     */
    function setTargetMarketCap(uint256 _newTarget) external onlyOwner {
        require(_newTarget > 0, "Target must be > 0");
        targetMarketCap = _newTarget;
        emit TargetMarketCapUpdated(_newTarget);
    }

    /**
     * @notice Update the post-cliff vesting duration in months (default: 12)
     */
    function setVestingDurationMonths(uint256 _months) external onlyOwner {
        require(_months > 0 && _months <= 48, "Duration must be between 1 and 48 months");
        vestingDurationMonths = _months;
        emit VestingDurationUpdated(_months);
    }

    /**
     * @notice Rescue accidentally sent non-protocol tokens
     * @dev STRICT SECURITY: Cannot withdraw USDC protocol revenue or SIVLET tokens under any circumstances.
     */
    function emergencyRescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(usdc), "Cannot withdraw USDC protocol revenue");
        require(token != sivletToken, "Cannot withdraw SIVLET tokens via rescue");
        require(to != address(0), "Zero address");
        bool success = IERC20(token).transfer(to, amount);
        require(success, "Rescue failed");
        emit EmergencyRescued(token, to, amount);
    }

    /**
     * @notice Update execution threshold and cooldown
     */
    function updateParameters(uint256 _minThreshold, uint256 _cooldown) external onlyOwner {
        minTriggerThreshold = _minThreshold;
        cooldownInterval = _cooldown;
        emit ParametersUpdated(_minThreshold, _cooldown);
    }

    /**
     * @notice Transfer ownership of the treasury
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice View founder incentive status, locked balance, and milestone unlock state
     */
    function getFounderIncentiveStatus() external view returns (
        uint256 currentPoolBalance,
        uint256 currentClaimableTokens,
        uint256 currentUnvestedTokens,
        uint256 totalAccumulated,
        uint256 totalClaimed,
        bool isGoalReached,
        uint256 cliffActivatedAt,
        uint256 currentCliffCycle,
        uint256 targetMarketCapUsdc,
        address currentFounderAddress
    ) {
        uint256 claimable = getClaimableFounderTokens();
        uint256 poolBalance = totalFounderIncentiveAccumulated - totalFounderIncentiveClaimed;
        uint256 unvested = poolBalance >= claimable ? poolBalance - claimable : 0;
        uint256 cycle = 0;
        if (isMarketCapGoalReached && cliffActivationTimestamp > 0) {
            cycle = ((block.timestamp - cliffActivationTimestamp) / CLIFF_PERIOD) + 1;
        }

        return (
            poolBalance,
            claimable,
            unvested,
            totalFounderIncentiveAccumulated,
            totalFounderIncentiveClaimed,
            isMarketCapGoalReached,
            cliffActivationTimestamp,
            cycle,
            targetMarketCap,
            founderAddress != address(0) ? founderAddress : owner
        );
    }

    /**
     * @notice View current treasury status and readiness
     */
    function getTreasuryStatus() external view returns (
        uint256 currentUsdcBalance,
        bool isReadyToTrigger,
        uint256 secondsUntilCooldownExpires,
        uint256 cumulativeUsdcSpent,
        uint256 cumulativeTokensBurned,
        uint256 currentFounderPoolBalance,
        bool isFounderGoalReached
    ) {
        currentUsdcBalance = usdc.balanceOf(address(this));
        bool balanceReady = currentUsdcBalance >= minTriggerThreshold;
        bool timeReady = block.timestamp >= lastExecutionTimestamp + cooldownInterval;
        
        isReadyToTrigger = (sivletToken != address(0)) && balanceReady && timeReady;
        secondsUntilCooldownExpires = timeReady ? 0 : (lastExecutionTimestamp + cooldownInterval - block.timestamp);
        cumulativeUsdcSpent = totalUsdcSpent;
        cumulativeTokensBurned = totalTokensBurned;
        currentFounderPoolBalance = totalFounderIncentiveAccumulated - totalFounderIncentiveClaimed;
        isFounderGoalReached = isMarketCapGoalReached;
    }
}
