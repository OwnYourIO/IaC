import {
    Input,
    Config,
    log,
    getStack
} from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { VirtualMachine } from '../../resources';

const config = new Config();
const domain = config.require('domain');

const microOSSmallTemplate = new VirtualMachine(`microos-small-template`, {
    hostname: `microos-small-template-${getStack()}`,
    cloud: 'proxmox',
    image: 'microos',
    size: 'Small',
    proxmoxTemplate: true,
}, {
});
export const microosSmallTemplateId = microOSSmallTemplate.getCloudID();

export const debian11SmallTemplateId = debian11SmallTemplate.getCloudID();
