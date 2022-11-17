import {
    Config,
    getStack,
    log,
    Input,
} from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { VirtualMachine } from '../../resources';

const config = new Config();
const domain = config.require('domain');

// Netmaker Server
const vpnServerHostname = config.get('vpn-hostname') ?? 'vpn';
const vpnServer = new VirtualMachine('VPN Server', {
    hostname: vpnServerHostname,
    domain,
    additionalSubdomains: ['dashboard.vpn', 'mx.vpn', 'api.vpn', 'broker.vpn'],
    cloud: 'hetzner',
    size: 'Small',
    dnsProvider: 'cloudflare',
    installDocker: true,
    installNetmaker: true,
    tlsEmail: 'tms@spencerslab.com',
}, {
});

// Netmaker ingress
const vpnIngressHostname = config.get('vpn-ingress-hostname') ?? 'vpn-ingress';
const vpnIngress = new VirtualMachine('VPN Ingress', {
    hostname: `${vpnIngressHostname}-${getStack()}`,
    domain,
    cloud: 'proxmox',
    size: 'Small',
    image: 'debian11',
    //dnsProvider: 'cloudflare',
    installNetclient: true,
    tlsEmail: 'tms@spencerslab.com',
}, {
});

export const vpnIngressIPv4 = vpnIngress.ipv4;
export const vpnIngressFQDN = vpnIngress.fqdn;

export const vpnIPv4 = vpnServer.ipv4;
export const vpnFQDN = vpnServer.fqdn;
