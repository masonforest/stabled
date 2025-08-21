// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
        chargeToken(token, ethAmount + calls[0].value);
        payable(msg.sender).transfer(ethAmount);
 
        for (uint i = 0; i < calls.length; i++) {
            calls[i].target.call{value: calls[i].value}(calls[i].data);
        }
    }

    function chargeToken(IERC20 token, uint256 ethAmount) internal {
        token.transferFrom(
            msg.sender,
            address(this),
            ((ethAmount * prices[token]) / 1000000 / 1 ether)
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
