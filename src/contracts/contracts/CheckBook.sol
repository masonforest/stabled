// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./HDWalletMessenger.sol";

contract CheckBook is Ownable {
    uint public transactionCost = 0.008 ether;
    HDWalletMessenger public hdWalletMessenger;
    
    mapping(IERC20 token => uint) checkCounts;
    event CheckFunded(
        IERC20 token,
        uint checkGlobalId,
        uint checkAccountId,
        address indexed _from,
        address indexed _checkAddress,
        uint256 _value
    );
    event CheckRedeemed(IERC20 token, address indexed _to, uint256 _value);

    mapping(IERC20 token => mapping(address => bool))
        public preapprovedAddresses;
    mapping(IERC20 token => mapping(address => uint)) public checkAmounts;
    mapping(IERC20 token => mapping(address => uint)) public accountCheckIds;
    mapping(IERC20 token => mapping(uint => address)) public globalCheckIds;

    constructor() Ownable(msg.sender) {
       hdWalletMessenger = HDWalletMessenger(0x6F39c7c97e5A095A595774e2D773fD253d1eD1a7);
    }

    function setHDWalletMessenger(address _hdWalletMessenger) external onlyOwner {
        hdWalletMessenger = HDWalletMessenger(_hdWalletMessenger);
    }

    function fundCheck(
        IERC20 token,
        address payable checkAddress,
        uint256 value
    ) external payable {
        require(msg.value == transactionCost * 2, "invalid tx cost");
        require(checkAmounts[token][checkAddress] == 0, "already funded");
        token.transferFrom(msg.sender, address(this), value);
        checkAddress.transfer(transactionCost);
        checkAmounts[token][checkAddress] = value;
        checkCounts[token]++;
        globalCheckIds[token][checkCounts[token]] = checkAddress;
        accountCheckIds[token][msg.sender]++;

        emit CheckFunded(
            token,
            checkCounts[token],
            accountCheckIds[token][msg.sender],
            tx.origin,
            checkAddress,
            value
        );
    }

    function redeemCheck(
        IERC20 token,
        address payable to,
        bytes calldata toPublicKey,
        bytes calldata encryptedMemo
    ) external {
        require(checkAmounts[token][msg.sender] != 0);
        uint value = checkAmounts[token][msg.sender];
        token.transfer(to, value);
        to.transfer(transactionCost);
        checkAmounts[token][msg.sender] = 0;
        emit CheckRedeemed(token, to, value);
        hdWalletMessenger.send(toPublicKey);
    }

    function setTransactionCost(uint256 newTransactionCost) external onlyOwner {
        transactionCost = newTransactionCost;
    }

    function withdrawAllEth() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function getCheckAmount(
        IERC20 token,
        uint globalCheckId
    ) public view returns (uint) {
        address checkAddress = globalCheckIds[token][globalCheckId];
        return checkAmounts[token][checkAddress];
    }

    receive() external payable {}
}
