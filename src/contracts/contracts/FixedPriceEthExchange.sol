// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "hardhat/console.sol";

contract FixedPriceEthExchange is Ownable {
    IERC20 public token;
    uint256 public price;

    struct Call {
        address target;
        bytes data;
        uint256 value; 
     }

    constructor(IERC20 _token, uint256 _price) Ownable(msg.sender) {
        token = _token;
        price = _price;
    }
    
    function buyEthAndCall(
        uint256 ethAmount,
        Call[] calldata calls,
        bytes calldata encryptedMemo
    ) external {
        encryptedMemo;
        uint256 totalCallValue = 0;
        for (uint i = 0; i < calls.length; i++) {
            (bool success, ) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            require(success);
            totalCallValue += calls[i].value;
        }
        chargeToken(ethAmount + totalCallValue);
        payable(msg.sender).transfer(ethAmount);
    }
    
    function chargeToken(uint256 ethAmount) internal {
        token.transferFrom(
            msg.sender,
            address(this),
            ethAmount * price / 1 ether
        );
    }

    function setPrice(uint256 _price) external onlyOwner {
        price = _price;
    }
    
    function setToken(IERC20 _token) external onlyOwner {
        token = _token;
    }

    function withdrawAllEth() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    receive() external payable {}
}
