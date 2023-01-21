import { ComponentResource, Output, Config, concat } from '@pulumi/pulumi';

import { ProxmoxVM } from './providers/proxmox';
import { VirtualMachine, VirtualMachineArgs } from './providers';

import * as hcloud from "@pulumi/hcloud";
import * as cloudflare from "@pulumi/cloudflare";

const providerMap = {
    proxmox: ProxmoxVM,
    // hcloud: HCloudVirtualMachine,
};
export type Keys = keyof typeof providerMap; // 'dev' | 'manager'
type providerTypes = typeof providerMap[Keys];
type ExtractInstanceType<T> = T extends new () => infer R ? R : VirtualMachine;

const config = new Config();

export class VirtualMachineFactory {
    static createVM(
        name: string,
        args: VirtualMachineArgs,
        opts: {},
    ): VirtualMachine {
        {

            const vm = new providerMap[args.cloud](name, args, opts);
            vm.createVM();
            vm.finalizeVM();

            return vm;
        }
    }
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
