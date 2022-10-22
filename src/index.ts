import * as pulumi from "@pulumi/pulumi";

// TODO: Integrate this into TechnoCore so that these env vars can be handled reasonably.
// Or does a drone.io job make more sense?

// https://www.pulumi.com/registry/packages/hcloud/
// export HCLOUD_TOKEN=XXXXXXXXXXXXXX
import * as hcloud from "@pulumi/hcloud";
import {remote, types} from "@pulumi/command";

// https://www.pulumi.com/registry/packages/cloudflare/
// export CLOUDFLARE_API_TOKEN=YYYYYY
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
const domain = 'ownyour.io'
const ttl = 3600
function createDnsRecords(server: hcloud.Server, dnsName: pulumi.Input<string>) {
    const ipv4Record = new cloudflare.Record(`${dnsName}-ipv4`, {
        name: dnsName,
        zoneId: domain,
        type: "A",
        value: server.ipv4Address,
        ttl: 3600
    });

    const ipv6Record = new cloudflare.Record(`${dnsName}-ipv6`, {
        name: dnsName,
        zoneId: domain,
        type: "AAAA",
        value: server.ipv6Address,
        ttl: 3600
    });
    
    return {ipv4Record, ipv6Record};
}

// TODO: Move this into the config?
// VM Defaults
const image = 'debian-11';
const location = 'us-east';
const serverType = 'cx11';
const _default = new hcloud.SshKey("default", {publicKey: fs.readFileSync("~/.ssh/id_rsa.pub")});
const sshKeys = [_default.id];

const server = new hcloud.Server(`vpn.${domain}`, {
    serverType,
    image,
    location,
    sshKeys
});

const dnsRecords = ['dashboard', 'mx', 'vpn', 'api', 'broker'];
dnsRecords.forEach((record: pulumi.Input<string>) => {
    createDnsRecords(server, record);
});

const connection: types.input.remote.ConnectionArgs = {
    host: server.ipv4Address,
    user: "root",
    privateKey: privateKey,
};

new remote.Command("Install Docker", {
    connection,
    create: `
    sudo apt-get update;
    sudo apt-get install -y docker.io docker-compose wireguard
    `,
    // Might eventually want
    // Something to do with TechnoCore: Install, configure, deploy
    // Some kind of init process that adds the ./tc script to /usr/local/bin or something. Needs to stay up to date, maybe with ./tc update to update docker image(s)?
        // Want to be able to run docker run  [--mount-docker-socket-options] scififarms/technocore:latest install data/ stack_template[Optional]
        // edit data/.env
        // tc deploy
    // Configure TC backups.
    // Auto Update nightly.
    // Fail2ban
    // lock down SSH
    //sudo ufw allow proto tcp from any to any port 443 && sudo ufw allow 51821:51830/udp
    //iptables --policy FORWARD ACCEPT
    //delete: `rm private_ip.txt`,
}, { deleteBeforeReplace: true });
