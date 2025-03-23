// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FixedPriceEthExchange is Ownable {
    mapping(IERC20 token => uint) public prices;

    constructor() Ownable(msg.sender) {}

    function buyEthAndCallWithTokens(
        IERC20 token,
        IERC20 tokenToTransfer,
        uint256 tokenAmount,
        uint256 ethAmount,
        address contractAddress,
        bytes calldata callData,
        uint256 callValue
    ) external returns (bool, bytes memory) {
        tokenToTransfer.transferFrom(
            msg.sender,
            address(this),
            tokenAmount
        );
        chargeToken(token, ethAmount + callValue);
        payable(msg.sender).transfer(ethAmount);
        return contractAddress.call{value: callValue}(callData);
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
