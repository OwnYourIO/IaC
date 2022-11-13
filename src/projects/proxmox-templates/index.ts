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

const debian11SmallTemplate = new VirtualMachine(`debian-11-small-template`, {
    hostname: `debian-11-small-template-${getStack()}`,
    domain: domain,
    cloud: 'proxmox',
    image: 'debian11',
    size: 'Small',
    debTemplate: true,
    proxmoxTemplate: true,
}, {
});

export const debian11SmallTemplateId = debian11SmallTemplate.getCloudID();
