import { Config, } from "@pulumi/pulumi";
import { VirtualMachineFactory } from "../../resources";
import { HomeAssistantOS } from "../../resources/images/homeassistant";

const config = new Config();

const home = VirtualMachineFactory.createVM(`home`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new HomeAssistantOS(),
    dnsProvider: 'cloudflare',
}, {});
