import {
    Config,
    getStack,
    log,
} from "@pulumi/pulumi";
import { VirtualMachine } from '../../resources';

const config = new Config();
const domain = config.require('domain');
const subdomain = 'paperless';

const paperlessHostname = config.get('paperless-hostname') ?? 'paperless';
const paperless = new VirtualMachine('VPN Ingress', {
    hostname: `${paperlessHostname}-${getStack()}`,
    domain,
    cloud: 'proxmox',
    size: 'Small',
    image: 'microos',

export const paperlessIPv4 = paperless.ipv4;
export const paperlessFQDN = paperless.fqdn;
