import * as pulumi from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import {remote, types} from "@pulumi/command";

// https://www.pulumi.com/registry/packages/cloudflare/
import * as cloudflare from "@pulumi/cloudflare";

import {
    Input,
    Config,
    log
} from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { VirtualMachine, DNSRecord } from './resources';


const config = new Config();
const domain = config.require('domain');
const hostname = config.get('vpn-hostname') ?? 'vpn';

const vpnServer = new VirtualMachine('VPN Server', {
    hostname,
    domain,
    additionalSubdomains: ['dashboard.vpn', 'mx.vpn', 'api.vpn', 'broker.vpn'],
    cloud: 'hetzner',
    size: 'small',
    dnsProvider: 'cloudflare'
}, {

});

const connection: types.input.remote.ConnectionArgs = {
    host: server.ipv4Address,
    user: "root",
    privateKey: privateKey,
};

export const vpnIPv4 = vpnServer.ipv4;
export const vpnFQDN = vpnServer.fqdn;
