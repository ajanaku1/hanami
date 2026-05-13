// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BouncerRegistry} from "../src/BouncerRegistry.sol";
import {CampaignFactory} from "../src/Campaign.sol";

contract Deploy is Script {
    function run() external returns (BouncerRegistry registry, CampaignFactory factory) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        registry = new BouncerRegistry();
        factory = new CampaignFactory(address(registry));
        vm.stopBroadcast();

        console2.log("BouncerRegistry:", address(registry));
        console2.log("CampaignFactory:", address(factory));
    }
}
