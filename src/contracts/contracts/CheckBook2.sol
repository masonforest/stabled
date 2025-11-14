// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./HDWalletMessenger.sol";
import "hardhat/console.sol";

contract CheckBook2 is Ownable {
    uint256 public price;
    uint public transactionCost = 0.00001 ether;
    HDWalletMessenger public hdWalletMessenger;
    IERC20 public token;
    

    constructor(
        IERC20 _token,
        uint256 _price
    ) Ownable(msg.sender) {
       token = _token;
       price = _price;
    }


    function permitAndTransferTokensAndEth(
        address payable checkAddress,
        uint256 value,
        uint256 permitValue,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        IERC20Permit(address(token)).permit(msg.sender, address(this), permitValue, deadline, v, r, s);
        transferTokensAndEth(
            checkAddress,
            value
        );
    }

    function transferTokensAndEth(
        address payable checkAddress,
        uint256 value
    )  public payable {
        token.transferFrom(msg.sender, checkAddress, value);
        chargeToken(transactionCost * 2);
        checkAddress.transfer(transactionCost);
        payable(msg.sender).transfer(transactionCost);
    }
    
    // function fundCheck(
    //     address payable checkAddress,
    //     uint256 value
    // ) external payable {
    //     require(msg.value == transactionCost * 2);
    //     require(checks[checkAddress].value == 0);
    //     token.transferFrom(msg.sender, address(this), value);
    //     checkAddress.transfer(transactionCost);
    //     checks[checkAddress] = Check({
    //         value: value,
    //         from: tx.origin
    //     });


    //     emit Feed(tx.origin);
    //     emit CheckFunded(
    //         tx.origin,
    //         checkAddress,
    //         value
    //     );
    // }

    // function redeemCheck(
    //     address payable to,
    //     bytes calldata toPublicKey,
    //     bytes calldata encryptedMemo
    // ) external {
    //     encryptedMemo;
    //     require(checks[msg.sender].value != 0);
    //     uint value = checks[msg.sender].value;
    //     token.transfer(to, value);
    //     to.transfer(transactionCost);
    //     checks[msg.sender].value = 0;
    //     emit CheckRedeemed(
    //         checks[msg.sender].from,
    //         to,
    //         msg.sender,
    //         value
    //     );
    //     emit Feed(to);
    //     emit Feed(checks[msg.sender].from);
    //     hdWalletMessenger.send(toPublicKey);
    // }

    function chargeToken(uint256 ethAmount) internal {
        token.transferFrom(
            msg.sender,
            address(this),
            ethAmount * price / 1 ether
        );
    }

    function setTransactionCost(uint256 newTransactionCost) external onlyOwner {
        transactionCost = newTransactionCost;
    }

    function withdrawAllEth() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    receive() external payable {}
}
