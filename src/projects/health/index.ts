import { Config, } from "@pulumi/pulumi";
import { remote, } from "@pulumi/command";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";
import { HomeAssistantOS } from "../../resources/images/homeassistant";

const config = new Config();


const documentsHA = VirtualMachineFactory.createVM(`health-tracking`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new HomeAssistantOS(),
    dnsProvider: 'cloudflare',
    childSubdomains: ['proxy', 'nginx'],
    siblingSubdomains: [
        'health',
        'activity-monitor',
        'health-research'
    ],
}, {});
