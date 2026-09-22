// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../BuybackBurnEngine.sol";

contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance low");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance low");
        require(allowance[from][msg.sender] >= amount, "allowance low");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockSwapRouter is ISwapRouter {
    address public mockTokenOut;
    uint256 public mockMultiplier = 1000; // 1 USDC = 1000 SIVLET

    function setMockTokenOut(address _token) external {
        mockTokenOut = _token;
    }

    function setMockMultiplier(uint256 _mult) external {
        mockMultiplier = _mult;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut) {
        amountOut = (params.amountIn * mockMultiplier * 1e18) / 1e6;
        if (mockTokenOut != address(0)) {
            MockERC20(mockTokenOut).mint(params.recipient, amountOut);
        }
        return amountOut;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        amountOut = (params.amountIn * mockMultiplier * 1e18) / 1e6;
        if (mockTokenOut != address(0)) {
            MockERC20(mockTokenOut).mint(params.recipient, amountOut);
        }
        return amountOut;
    }
}
