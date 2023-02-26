import { ComponentResource, Output, Config, concat } from '@pulumi/pulumi';

import { ProxmoxVM } from './providers/proxmox';
import { HCloudVM } from './providers/hcloud';
import { VirtualMachine, VirtualMachineArgs } from './providers';

import * as hcloud from "@pulumi/hcloud";
import * as cloudflare from "@pulumi/cloudflare";
import { DNSRecord, DNSArgs, } from './dns';
import { CloudflareDNSRecord } from './dns/cloudflare';

const providerMap = {
    proxmox: ProxmoxVM,
    hcloud: HCloudVM,
};
export type Keys = keyof typeof providerMap;
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
            // Create and start the VM object
            vm.createVM();

            // This gets the system to a generally usable state. 
            // Sets up adminUser's initial profile and permissions.
            // And makes sure the VM is accessible via IP or fqdn.
            vm.initVM();

            // For image specific configuration
            // Or vm options like installDocker.
            // And adding DNS records
            vm.finalizeVM(args);

            return vm;
        }
    }
}

type DNSProviders = 'cloudflare' | 'hetzner' | 'duckdns';
export const DNSProviderMap = {
    'cloudflare': CloudflareDNSRecord,
    'hetzner': CloudflareDNSRecord
};
export class DNSFactory {
    static createARecord(
        name: string,
        args: DNSArgs,
        opts: {},
    ): DNSRecord {
        const record = new DNSProviderMap[args.dnsProvider](name, args, opts);

        record.createARecord();
        return record;
    }
}
