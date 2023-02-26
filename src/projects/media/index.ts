import { Config, } from "@pulumi/pulumi";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";
import { HomeAssistantOS } from "../../resources/images/homeassistant";

const config = new Config();


const mediaHA = VirtualMachineFactory.createVM(`mediaHA`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new HomeAssistantOS(),
    dnsProvider: 'cloudflare',
}, {});
