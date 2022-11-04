import { ComponentResource, Output } from '@pulumi/pulumi';

import {
    Config,
    log, concat
} from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import * as cloudflare from "@pulumi/cloudflare";
import { remote, types } from "@pulumi/command";

import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const config = new Config();

export class VirtualMachine extends ComponentResource {
    constructor(
        name: string,
        args: {
            dnsProvider: 'cloudflare' | 'hetzner';
            cloud: 'proxmox' | 'hetzner';
            size: 'small' | 'medium' | 'large';
            additionalSubdomains?: string[];
            hostname: string;
            domain?: string;
            installDocker?: boolean;
            installNetMaker?: boolean;
            tlsEmail?: string;
        },
        opts: {},
    ) {
        super('pkg:index:VirtualMachine', name, {}, opts);
        this.fqdn = `${args.hostname}.${args.domain}`;

        const publicKey = config.get(`${name}-publicKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa.pub")).toString("utf8");
        const privateKey = config.getSecret(`${name}-privateKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa")).toString("utf8");
        switch (args.cloud) {
            case 'proxmox':
                this.ipv4 = concat('');
                this.ipv6 = concat('');
                break;
            case 'hetzner':
                const serverType = config.get(`hetzner-vm-${args.size}`) ?? 'cpx11';
                const image = config.get('hetzner-default-image') ?? 'debian-11';
                const location = config.get('hetzner-default-location') ?? 'ash';

                const hcloudKey = new hcloud.SshKey(`ssh-${this.fqdn}`, {
                    publicKey: publicKey
                });
                const sshKeys = [hcloudKey.id];

                const server = new hcloud.Server(`${args.hostname}.${args.domain}`, {
                    serverType,
                    image,
                    location,
                    sshKeys,
                }, {});
                this.ipv4 = server.ipv4Address;
                this.ipv6 = server.ipv6Address;

                new DNSRecord(this.fqdn, {
                    dnsProvider: 'cloudflare',
                    ipv4: this.ipv4,
                    ipv6: this.ipv6,
                }, {});

                if (args.additionalSubdomains) {
                    args.additionalSubdomains.forEach((record: string) => {
                        new DNSRecord(`${record}.${args.domain}`, {
                            dnsProvider: 'cloudflare',
                            ipv4: this.ipv4,
                            ipv6: this.ipv6,
                        }, {});
                    });
                }

                break;
        }

        const connection: types.input.remote.ConnectionArgs = {
            host: this.ipv4,
            user: "root",
            privateKey: privateKey,
        };

        if (args.installNetMaker) {
            const docker = new remote.Command("Install Docker", {
                connection,
                create: `export DEBIAN_FRONTEND=noninteractive; 
                    apt-get update;
                    apt-get upgrade -y;
                    apt install curl wget git -y;
                    curl -fsSL https://get.docker.com | sh;
                    apt-get install -y docker-compose;
                    systemctl enable --now docker;
            `,
            }, { deleteBeforeReplace: true });

            const netmaker = new remote.Command("Install Netmaker", {
                connection,
                create: `export DEBIAN_FRONTEND=noninteractive; 
                    apt-get install -y wireguard ufw;
                    ufw allow ssh;
                    ufw allow proto tcp from any to any port 443;
                    ufw allow 51821:51830/udp;
                    iptables --policy FORWARD ACCEPT;
                    systemctl enable --now ufw; 
                `,
            }, { dependsOn: docker, deleteBeforeReplace: true });

            const dockerCompose = new remote.Command("Install Netmaker: Edit docker-compose.yml", {
                connection,
                // TODO: Need docker-compose.yml output. Or maybe just master key and mq admin password?
                create: `export DEBIAN_FRONTEND=noninteractive; 
                    wget -O docker-compose.yml https://raw.githubusercontent.com/gravitl/netmaker/master/compose/docker-compose.yml;
                    sed -i "s/NETMAKER_BASE_DOMAIN/${this.fqdn}/g" docker-compose.yml;
                    sed -i "s/SERVER_PUBLIC_IP/$(ip route get 1 | sed -n 's/^.*src ${String.raw`\([0-9.]*\) .*$/\1/p`}')/g" docker-compose.yml;
                    sed -i 's/YOUR_EMAIL/${args.tlsEmail}/g' docker-compose.yml;
                    sed -i "s/REPLACE_MASTER_KEY/$(tr -dc A-Za-z0-9 </dev/urandom | head -c 30 ; echo '')/g" docker-compose.yml
                    sed -i "s/REPLACE_MQ_ADMIN_PASSWORD/$(tr -dc A-Za-z0-9 </dev/urandom | head -c 30)/g" docker-compose.yml
                `,
            }, { deleteBeforeReplace: true });

            const mosquitto = new remote.Command("Install Netmaker: Edit mosquitto config.", {
                connection,
                create: `export DEBIAN_FRONTEND=noninteractive; 
                wget -O mosquitto.conf https://raw.githubusercontent.com/gravitl/netmaker/master/docker/mosquitto.conf;
                wget -q -O wait.sh https://raw.githubusercontent.com/gravitl/netmaker/develop/docker/wait.sh;
                chmod +x wait.sh;
                `,
            }, { deleteBeforeReplace: true });

            new remote.Command("Install Netmaker: docker-compose up ", {
                connection,
                create: `export DEBIAN_FRONTEND=noninteractive; 
                sudo docker-compose up -d;
                `,
            }, { dependsOn: [dockerCompose, netmaker, mosquitto], deleteBeforeReplace: true });
        }
    }
    fqdn: string;
    ipv4: Output<string>;
    ipv6: Output<string>;
}

export class Storage extends ComponentResource {
    constructor(
        name: string,
        args: {
            cloud: 'proxmox' | 'hetzner';
            size: 'small' | 'medium' | 'large';
        },
        opts: {},
    ) {
        super('pkg:index:VirtualMachine', name, {}, opts);
        switch (args.cloud) {
            case 'proxmox':
                this.name = concat(name, 'hi');
                break;
            case 'hetzner':
                this.name = concat(name, 'hi');
                break;
        }
    }
    name: Output<string>;
}

export class DNSRecord extends ComponentResource {
    constructor(
        name: string,
        args: {
            dnsProvider: 'cloudflare' | 'hetzner';
            ipv4: Output<string>;
            ipv6?: Output<string>;
            ttl?: number;
        },
        opts: {},
    ) {
        super('pkg:index:DNSRecord', name, {}, opts);
        const ttl = args.ttl ?? config.getNumber('defaultTTL') ?? 60;
        this.ipv4 = args.ipv4;
        this.ipv6 = args.ipv6;
        this.fqdn = name;

        switch (args.dnsProvider) {
            case 'cloudflare':
                const zoneId = config.require('cloudflare-zoneId');

                const ipv4Record = new cloudflare.Record(`${name}-ipv4`, {
                    name,
                    zoneId,
                    type: "A",
                    value: this.ipv4,
                    ttl: ttl
                });

                if (this.ipv6) {
                    const ipv6Record = new cloudflare.Record(`${name}-ipv6`, {
                        name,
                        zoneId,
                        type: "AAAA",
                        value: this.ipv6,
                        ttl: ttl
                    });
                }
                break;
            case 'hetzner':
                break;
        }
    }

    fqdn: string;
    ipv4: Output<string>;
    ipv6: Output<string> | undefined | null;
}
