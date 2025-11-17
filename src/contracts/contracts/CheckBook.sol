// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./HDWalletMessenger.sol";
import "hardhat/console.sol";

contract CheckBook is Ownable {
    uint public price;
    uint public transactionCost = 0.001 ether;
    HDWalletMessenger public hdWalletMessenger;
    IERC20 public token;

    uint checkCount;
    event Feed(address indexed _address);
    event CheckFunded(
        address _from,
        address indexed _checkAddress,
        uint256 _value
    );
    event CheckRedeemed(
        address _from,
        address _to,
        address _checkAddress,
        uint256 _value
    );

    struct Check {
        uint256 value;
        address from;
    }
    mapping(address => Check) public checks;

    constructor(
        IERC20 _token,
        uint256 _price,
        uint256 _transactionCost,
        HDWalletMessenger _hdWalletMessenger
    ) Ownable(msg.sender) {
        token = _token;
        price = _price;
        transactionCost = _transactionCost;
        hdWalletMessenger = _hdWalletMessenger;
    }

    // function setHDWalletMessenger(address _hdWalletMessenger) external onlyOwner {
    //     hdWalletMessenger = HDWalletMessenger(_hdWalletMessenger);
    // }

    function permitAndFundCheck(
        address payable checkAddress,
        uint256 value,
        uint256 permitValue,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        IERC20Permit(address(token)).permit(
            msg.sender,
            address(this),
            permitValue,
            deadline,
            v,
            r,
            s
        );
        fundCheck(checkAddress, value);
    }

    function fundCheck(address payable checkAddress, uint256 value) public {
        require(checks[checkAddress].value == 0);
        uint gasCostInToken = ((transactionCost * 2) * price) / 1 ether;
        token.transferFrom(msg.sender, address(this), value + gasCostInToken);
        checkAddress.transfer(transactionCost);
        payable(msg.sender).transfer(transactionCost);
        checks[checkAddress] = Check({value: value, from: tx.origin});

        emit Feed(tx.origin);
        emit CheckFunded(tx.origin, checkAddress, value);
    }

    function redeemCheck(
        address payable to,
        bytes calldata toPublicKey,
        bytes calldata encryptedMemo
    ) external {
        encryptedMemo;
        require(checks[msg.sender].value != 0);
        uint value = checks[msg.sender].value;
        token.transfer(to, value);
        to.transfer(transactionCost);
        checks[msg.sender].value = 0;
        emit CheckRedeemed(checks[msg.sender].from, to, msg.sender, value);
        emit Feed(to);
        emit Feed(checks[msg.sender].from);
        hdWalletMessenger.send(toPublicKey);
    }

    function setTransactionCost(uint256 newTransactionCost) external onlyOwner {
        transactionCost = newTransactionCost;
    }

    function withdrawAllEth() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function withdrawAllToken() external onlyOwner {
        token.transfer(owner(), token.balanceOf(address(this)));
    }

    receive() external payable {}
}
