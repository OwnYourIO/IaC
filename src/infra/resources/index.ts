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
        },
        opts: {},
    ) {
        super('pkg:index:VirtualMachine', name, {}, opts);
        this.fqdn = `${args.hostname}.${args.domain}`;

        switch (args.cloud) {
            case 'proxmox':
                this.ipv4 = concat('');
                this.ipv6 = concat('');
                break;
            case 'hetzner':
                const serverType = config.get(`hetzner-vm-${args.size}`) ?? 'cpx11';
                const image = config.get('hetzner-default-image') ?? 'debian-11';
                const location = config.get('hetzner-default-location') ?? 'ash';

                const publicKey = config.get(`${name}-publicKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa.pub")).toString("utf8");
                const privateKey = config.getSecret(`${name}-privateKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa")).toString("utf8");

                const server = new hcloud.Server(`${args.hostname}.${args.domain}`, {
                    serverType,
                    image,
                    location,
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
