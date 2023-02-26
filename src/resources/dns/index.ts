import { Output, ComponentResource, Config, interpolate } from '@pulumi/pulumi';
import { DNSProviderMap } from '..';

const config = new Config();

export type DNSKeys = keyof typeof DNSProviderMap;
export type DNSArgs = {
    dnsProvider: DNSKeys;
    hostname: string;
    domain: string;
    additionalSubdomains?: string[];
    value: Output<string>;
    ttl?: number;
    tlsEmail?: string;
}

export class DNSRecord extends ComponentResource {
    record: any;

    cloudID: Output<string>;
    getCloudID(): Output<string> {
        return this.cloudID;
    }

    dnsProvider: DNSKeys;
    fqdn: string;
    hostname: string;
    domain: string;
    additionalSubdomains: string[] | undefined;
    value: Output<string>;
    tlsEmail: string;

    ttl: number;
    recordType?: 'A' | 'AAAA' | 'MX' | 'CNAME';

    opts: {};
    commandsDependsOn: any[]

    config: Config;

    createARecord(): void {
        throw new Error(`Unimplemented`);
    }
    createAAAARecord(): void {
        throw new Error(`Unimplemented`);
    }
    createMXRecord(): void {
        throw new Error(`Unimplemented`);
    }
    createCNAMERecord(): void {
        throw new Error(`Unimplemented`);
    }

    constructor(
        name: string,
        args: DNSArgs,
        opts: {},
    ) {
        const fqdn = `${args.hostname}.${args.domain}`;
        super('pkg:index:DNSRecord', fqdn, {}, opts);

        this.hostname = args.hostname;
        this.domain = args.domain;
        this.fqdn = fqdn;
        this.dnsProvider = args.dnsProvider;
        this.additionalSubdomains = args.additionalSubdomains;
        this.value = args.value;
        this.tlsEmail = args.tlsEmail ?? config.require('lets-encrypt-email');

        this.ttl = args.ttl ?? config.getNumber('dns-ttl') ?? 60;

        this.cloudID = interpolate``;
        this.commandsDependsOn = [];
        this.config = new Config();
        this.opts = opts;
        return this;
    }
}
