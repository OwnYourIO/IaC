import * as pulumi from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import {remote, types} from "@pulumi/command";

// https://www.pulumi.com/registry/packages/cloudflare/
import * as cloudflare from "@pulumi/cloudflare";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";


const config = new pulumi.Config();
// TODO: Pretty sure I want to do this differently.
// Like I think these values should come in via BitWarden.
const keyName = config.get("keyName") ?? new aws.ec2.KeyPair("key", { publicKey: config.require("publicKey") }).keyName;
const privateKeyBase64 = config.get("privateKeyBase64");
const privateKey = privateKeyBase64 ? Buffer.from(privateKeyBase64, 'base64').toString('ascii') : fs.readFileSync(path.join(os.homedir(), ".ssh", "id_rsa")).toString("utf8");

// DNS Defaults
// TODO: Move this into the config?
const defaultTTL = 60;
const cloudflareProvider = new cloudflare.Provider('cloudflare-cloud', { apiToken: cloudflareToken });
function createDnsRecords(server: hcloud.Server, dnsName: pulumi.Input<string>) {
    const ipv4Record = new cloudflare.Record(`${dnsName}-ipv4`, {
        name: dnsName,
        zoneId,
        type: "A",
        value: server.ipv4Address,
        ttl: defaultTTL
    }, {provider: cloudflareProvider});

    const ipv6Record = new cloudflare.Record(`${dnsName}-ipv6`, {
        name: dnsName,
        zoneId,
        type: "AAAA",
        value: server.ipv6Address,
        ttl: defaultTTL
    }, {provider: cloudflareProvider});
    
    return {ipv4Record, ipv6Record};
}

// TODO: Move this into the config?
// VM Defaults
const serverType = 'cpx11';
const image = 'debian-11';
const location = 'ash';
const serverType = 'cx11';
const _default = new hcloud.SshKey("default", {publicKey: fs.readFileSync("~/.ssh/id_rsa.pub")});
const sshKeys = [_default.id];

const hcloudProvider = new hcloud.Provider('hetzner-cloud', { token: hcloudToken });
const server = new hcloud.Server(`vpn.${domain}`, {
    serverType,
    image,
    location,
    sshKeys
}, {provider: hcloudProvider});

const dnsRecords = ['dashboard.vpn', 'mx.vpn', 'vpn', 'api.vpn', 'broker.vpn'];
dnsRecords.forEach((record: pulumi.Input<string>) => {
    createDnsRecords(server, record);
});

const connection: types.input.remote.ConnectionArgs = {
    host: server.ipv4Address,
    user: "root",
    privateKey: privateKey,
};

export const ipv4 = server.ipv4Address;
