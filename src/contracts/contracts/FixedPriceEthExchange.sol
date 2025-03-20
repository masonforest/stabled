// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FixedPriceEthExchange is Ownable {
    mapping(IERC20 token => uint) public prices;

    constructor() Ownable(msg.sender) {}

    function sellEth(IERC20 token) external payable {
        uint256 tokensToBuy = (msg.value * 1e18) / prices[token];
        token.transfer(msg.sender, tokensToBuy);
    }

    function buyEth(IERC20 token, uint256 tokenAmount) external {
        uint256 ethToReturn = (tokenAmount * prices[token]) / 1e18;
        token.transferFrom(msg.sender, address(this), tokenAmount);
        payable(msg.sender).transfer(ethToReturn);
    }

    function setPrice(IERC20 token, uint256 price) external onlyOwner {
        prices[token] = price;
    }
    
    function withdrawEth(uint256 amount) external onlyOwner {
        payable(owner()).transfer(amount);
    }

    receive() external payable {
    }
}
