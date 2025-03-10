pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BbUSD is ERC20, Ownable {
    event newMagic(uint);
    mapping(address => uint) public magicReceivers;
    //mapping(address => bool) public addresses;
    //mapping(uint => uint) public magicAmounts;
    //uint public magicCount;



    uint256 public transferCost = 0.002 ether;

    constructor() ERC20("Bitcoin Backed USD", "BbUSD") Ownable(msg.sender) {
    }
    
    function createMagic(address to, uint256 value) external {
        require(magicReceivers[to] == 0);
        magicReceivers[to] = value;
        _burn(msg.sender, value);
    }

    function redeemMagic() external {
        _mint(msg.sender, magicReceivers[msg.sender]);
        magicReceivers[msg.sender] = 0 ;
    }

    function mint(address to, uint256 value) external onlyOwner {
        _mint(to, value);
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        super._update(from, to, value);
        if (from != address(0)) {
            payable(from).transfer(transferCost);
        }
        if (to != address(0) && to.balance < transferCost) {
            payable(to).transfer(transferCost);
        }
    }

    function setTransferCost(uint256 newCost) external onlyOwner {
        transferCost = newCost;
    }

    receive() external payable {
    }
}