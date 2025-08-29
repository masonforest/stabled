// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./HDWalletMessenger.sol";
import "hardhat/console.sol";

contract CheckBook is Ownable {
    uint public transactionCost = 0.01 ether;
    HDWalletMessenger public hdWalletMessenger;
    IERC20 public token;
    
    uint checkCount;
    event Feed(
        address indexed _address
    );
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

    mapping(address => bool) public preapprovedAddresses;
    struct Check {
        uint256 value;
        address from;
    }
    mapping(address => Check) public checks;

    constructor(IERC20 _token, HDWalletMessenger _hdWalletMessenger) Ownable(msg.sender) {
       hdWalletMessenger = _hdWalletMessenger;
       token = _token; 
    }

    function setHDWalletMessenger(address _hdWalletMessenger) external onlyOwner {
        hdWalletMessenger = HDWalletMessenger(_hdWalletMessenger);
    }

    function setToken(address _token) external onlyOwner {
        token = IERC20(_token);
    }

    function fundCheck(
        address payable checkAddress,
        uint256 value
    ) external payable {
        // require(msg.value == transactionCost * 2);
        // require(checks[checkAddress].value == 0);
        // token.transferFrom(msg.sender, address(this), value);
        checkAddress.transfer(transactionCost);
        checks[checkAddress] = Check({
            value: value,
            from: tx.origin
        });

        emit Feed(tx.origin);
        emit CheckFunded(
            tx.origin,
            checkAddress,
            value
        );
    }

    function redeemCheck(
        address payable to,
        bytes calldata toPublicKey,
        bytes calldata encryptedMemo
    ) external {
        require(checks[msg.sender].value != 0);
        uint value = checks[msg.sender].value;
        token.transfer(to, value);
        to.transfer(transactionCost);
        checks[msg.sender].value = 0;
        emit CheckRedeemed(
            checks[msg.sender].from,
            to,
            msg.sender,
            value
        );
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

    receive() external payable {}
}
