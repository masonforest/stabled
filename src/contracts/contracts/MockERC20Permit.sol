// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20Permit is ERC20Permit, Ownable {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply
    )
        ERC20(name_, symbol_)
        ERC20Permit(name_) // Initializes EIP-2612 permit
        Ownable(msg.sender)
    {
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
