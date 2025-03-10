// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// Use the IERC20Permit interface from OpenZeppelin
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

/**
 * @title FixedPriceEthExchange
 * @notice Exchange an existing ERC20 token for ETH at a fixed price.  
 *         Allows selling in a single transaction using `permit`.
 */
contract FixedPriceEthExchange is Ownable {
    IERC20 public token;           // The ERC20 token to trade
    uint256 public price;          // Price in Wei per 1 full token (assuming token has 18 decimals)

    /**
     * @dev Constructor sets the token address and the initial price (in Wei per 1*10^18 tokens).
     * @param _tokenAddress The address of the ERC20 token.
     * @param _price The price in Wei per 1 full token (1e18 base units).
     */
    constructor(address _tokenAddress, uint256 _price) Ownable(msg.sender) {
        token = IERC20(_tokenAddress);
        price = _price;
    }

    /**
     * @notice Buy tokens by sending ETH.  
     * @dev The number of tokens is (msg.value * 1e18) / price, assuming 18 decimals.
     */
    function sellEth() external payable {
        require(msg.value > 0, "No ETH sent");

        uint256 tokensToBuy = (msg.value * 1e18) / price;
        require(tokensToBuy > 0, "Insufficient ETH for 1 base unit");

        // The contract must hold enough tokens
        require(token.balanceOf(address(this)) >= tokensToBuy, "Not enough tokens in contract");

        // Transfer tokens out to the buyer
        token.transfer(msg.sender, tokensToBuy);
    }

    /**
     * @notice Sell `tokenAmount` of tokens in exchange for ETH.  
     * @dev Pulls tokens via `transferFrom` (requiring prior approval).
     *      The ETH returned is (tokenAmount * price) / 1e18.
     */
    function buyEth(uint256 tokenAmount) external {
        _buyEth(tokenAmount, msg.sender);
    }

    /**
     * @notice Sell `tokenAmount` of tokens using EIP-2612 permit in the same tx.  
     *         This avoids the need for a separate on-chain `approve`.
     * @param tokenAmount The amount of tokens (in base units) to sell.
     * @param deadline The permit signature deadline (timestamp).
     * @param v The `v` component of the ERC-2612 permit signature.
     * @param r The `r` component of the ERC-2612 permit signature.
     * @param s The `s` component of the ERC-2612 permit signature.
     */
    function buyEthWithPermit(
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // 1) First call permit on the token to allow this contract to spend `tokenAmount`
        IERC20Permit(address(token)).permit(
            msg.sender,       // owner
            address(this),    // spender
            tokenAmount,      // value
            deadline,
            v, 
            r, 
            s
        );

        // 2) Proceed with the sell operation
        _buyEth(tokenAmount, msg.sender);
    }

    /**
     * @dev Internal function that performs the token pull (transferFrom) and sends ETH back.
     */
    function _buyEth(uint256 tokenAmount, address seller) internal {
        require(tokenAmount > 0, "Zero token amount");

        // Calculate how much ETH to return
        uint256 ethToReturn = (tokenAmount * price) / 1e18;
        require(address(this).balance >= ethToReturn, "Not enough ETH in contract");

        // Transfer tokens from seller -> contract
        bool success = token.transferFrom(seller, address(this), tokenAmount);
        require(success, "Token transfer failed");

        // Pay the seller
        payable(seller).transfer(ethToReturn);
    }

    /**
     * @notice Change the price (in Wei per 1 token = 1e18 base units).
     */
    function setPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price must be > 0");
        price = newPrice;
    }

    /**
     * @notice Owner can withdraw ETH from the contract.
     */
    function withdrawEth(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient ETH in contract");
        payable(owner()).transfer(amount);
    }
}
