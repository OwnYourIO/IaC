import {
    Input,
    Config,
    log
} from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { VirtualMachine } from '../../resources';

const config = new Config();
const domain = config.require('domain');

const templateProxmoxVM = new VirtualMachine(`debian-11-small-template`, {
    hostname: `debian-11-small-template`,
    domain: domain,
    cloud: 'proxmox',
    image: 'debian-11',
    size: 'small',
    debTemplate: true,
    proxmoxTemplate: true,
}, {
});

