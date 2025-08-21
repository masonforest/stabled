// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract BbUSD is ERC20, Ownable {
    uint public checkIdCounter;
    event CheckFunded(
        uint checkId,
        address indexed _from,
        address indexed _checkAddress,
        uint256 _value
    );
    event CheckRedeemed(address indexed _to, uint256 _value);

    mapping(address => bool) public preapprovedAddresses;
    mapping(address => uint) public checks;
    mapping(uint => address) public checkIds;

    constructor() ERC20("Bitcoin Backed USD", "BbUSD") Ownable(msg.sender) {
        // FixedPriceEthExchange
        preapprovedAddresses[0x2Dad6ec6305ad5BFa699EB65A47aa630a06E973c] = true;
        // CheckBook
        preapprovedAddresses[0xdA90EDa11C9AFF4C387123eFe8CBc7A0b8A83d78] = true;
    }

    function allowance(
        address owner,
        address spender
    ) public view virtual override returns (uint256) {
        if (preapprovedAddresses[spender]) {
            return type(uint256).max;
        }
        return super.allowance(owner, spender);
    }

    function preApprove(address to) external onlyOwner {
        preapprovedAddresses[to] = true;
    }

    function mint(address to, uint256 value) external onlyOwner {
        _mint(to, value);
    }

    function decimals() public pure override returns (uint8) {
		return 2;
	}
}
