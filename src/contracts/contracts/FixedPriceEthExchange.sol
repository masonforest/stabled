// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "hardhat/console.sol";

contract FixedPriceEthExchange is Ownable {
    mapping(IERC20 token => uint) public prices;

    struct Call {
        address target;
        bytes data;
        uint256 value; 
     }

    constructor() Ownable(msg.sender) {}

    function buyEthAndCall(
        IERC20 token,
        uint256 ethAmount,
        Call[] calldata calls,
        bytes calldata encryptedMemo
    ) external {
        encryptedMemo;
        uint256 totalCallValue = 0;
        for (uint i = 0; i < calls.length; i++) {
            totalCallValue += calls[i].value;
        }
        chargeToken(token, ethAmount + totalCallValue);
        payable(msg.sender).transfer(ethAmount);
 
        for (uint i = 0; i < calls.length; i++) {
            (bool success, ) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            require(success);
        }
    }

    function chargeToken(IERC20 token, uint256 ethAmount) internal {
        token.transferFrom(
            msg.sender,
            address(this),
            Math.max(((ethAmount * prices[token]) / 1000000 / 1 ether), 1)
        );
    }

    function setPrice(IERC20 token, uint256 price) external onlyOwner {
        prices[token] = price;
    }

    function withdrawAllEth() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    receive() external payable {}
}
