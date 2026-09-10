// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CampaignFactoryV2} from "../src/CampaignV2.sol";
import {Ticket} from "../src/Ticket.sol";
import {TicketGate} from "../src/TicketGate.sol";

/// Deploys the feature 002 contracts beside the live V1 pair. It reads the existing
/// BouncerRegistry from the environment and never redeploys or touches it, so V1 campaigns keep
/// running against the same registry throughout.
///
/// The factory deploys its own Ticket in its constructor, which is why Ticket is read back rather
/// than deployed here: minting authority is then structural (Ticket's factory is immutable and only
/// campaigns this factory created are ever registered as minters) instead of a post-deploy wiring
/// step someone could get wrong or front-run.
///
/// TicketGate is the demo consumer and needs a campaign, so it is deployed only when
/// DEMO_CAMPAIGN_V2 is set; the first run leaves it out and a later run wires it to the campaign
/// the owner actually created.
///
/// Dry run (no broadcast):
///   forge script script/DeployV2.s.sol --rpc-url zerog
/// Broadcast is an operator action and is never run unattended.
contract DeployV2 is Script {
    function run() external returns (CampaignFactoryV2 factory, Ticket ticket, TicketGate gate) {
        address registry = vm.envAddress("BOUNCER_REGISTRY_ADDRESS");
        address demoCampaign = vm.envOr("DEMO_CAMPAIGN_V2", address(0));
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(pk);
        factory = new CampaignFactoryV2(registry);
        ticket = factory.ticket();
        if (demoCampaign != address(0)) gate = new TicketGate(demoCampaign);
        vm.stopBroadcast();

        console2.log("BouncerRegistry (existing, untouched):", registry);
        console2.log("CampaignFactoryV2:", address(factory));
        console2.log("Ticket:", address(ticket));
        console2.log("TicketGate:", address(gate));
    }
}
