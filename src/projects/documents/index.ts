import { Config, getStack, log, } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";

const config = new Config();
const domain = config.require('domain');
const subdomain = 'paperless';

const paperlessHostname = config.get('paperless-hostname') ?? 'paperless';
const paperless = VirtualMachineFactory.createVM('VPN Ingress', {
    hostname: `${paperlessHostname}-${getStack()}`,
    domain,
    cloud: 'proxmox',
    size: 'Small',
    image: new MicroOS(),
}, {
});

export const paperlessIPv4 = paperless.ipv4;
export const paperlessFQDN = paperless.fqdn;
