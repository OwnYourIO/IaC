import { Config, } from "@pulumi/pulumi";
import { remote, } from "@pulumi/command";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";
import { HomeAssistantOS } from "../../resources/images/homeassistant";

const config = new Config();


const documentsHA = VirtualMachineFactory.createVM(`documents-ha`, {
    cloud: config.get('vmCloud') ?? 'proxmox',
    size: 'Medium',
    image: new HomeAssistantOS(),
    dnsProvider: 'cloudflare',
    childSubdomains: ['proxy', 'nginx'],
    siblingSubdomains: [
        'documents', 'paperless',
        'pictures', 'immich',
        'kanban', 'wekan',
    ],
}, {});
