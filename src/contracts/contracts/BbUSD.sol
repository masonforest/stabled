// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract BbUSD is ERC20, Ownable {
    uint public checkIdCounter;
    event CheckFunded(uint checkId, address indexed _from, address indexed _checkAddress, uint256 _value);
    event CheckRedeemed(address indexed _to, uint256 _value);

    mapping(address => bool) public preapprovedAddresses;
    mapping(address => uint) public checks;
    mapping(uint => address) public checkIds;

    constructor() ERC20("Bitcoin Backed USD", "BbUSD") Ownable(msg.sender) {
        // FixedPriceEthExchange
        preapprovedAddresses[0xc4434F019De43Cd83Bb8a3bC1b3Bb7D9be4cAf2f] = true;
    }


    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        if (preapprovedAddresses[spender]) {
            return type(uint256).max;
        }
        return super.allowance(owner, spender);
    }
    
    function fundCheck(address checkAddress, uint256 value) external {
        require(checks[checkAddress] == 0);
        _burn(msg.sender, value);
        checks[checkAddress] = value;
        checkIdCounter++;
        emit CheckFunded(checkIdCounter, msg.sender, checkAddress, value);
    }

    function redeemCheck(address to) external {
        require(checks[msg.sender] != 0);
        uint value = checks[msg.sender];
        _mint(to, value);
        checks[msg.sender] = 0 ;
        emit CheckRedeemed(to, value);
    }

    function mint(address to, uint256 value) external onlyOwner {
        _mint(to, value);
    }
}