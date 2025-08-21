// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract HDWalletMessenger {
    mapping(address => uint) public messageIndecies;

    event Message(
        address indexed from,
        address indexed to,
        bytes toPublicKey,
        uint256 messageIndex
    );

    function send(
        bytes memory toPublicKey
    ) public {
        messageIndecies[tx.origin]++;
        emit Message(
            tx.origin,
            address(uint160(uint256(keccak256(toPublicKey)))),
            toPublicKey,
            messageIndecies[tx.origin]
        );
    }
    
    function sendWithCallData(
        bytes calldata toPublicKey,
        bytes calldata ephemeralPublicKeyAndMessage
    ) external {
        send(toPublicKey);
    }
}