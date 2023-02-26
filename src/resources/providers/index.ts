import { remote, types, local } from "@pulumi/command";
import { Output, Input, ComponentResource, Config, interpolate, getStack, Resource } from '@pulumi/pulumi';

import { BaseVMImage } from "../images";
import { Keys, DNSFactory } from "../";

//@ts-ignore
import { readFileSync } from "fs";
//@ts-ignore
import { join } from "path";
//@ts-ignore
import { homedir } from "os";
import { DNSKeys, DNSRecord } from "../dns";

const config = new Config();
type Connection = Input<types.input.remote.ConnectionArgs>;

export type Size = {
    commonName: string,
    cores: number,
    baseMemory: number,
    providerTag?: string,
};

const defaultSizes = {
    'Small': {
        commonName: 'Small',
        cores: 2,
        baseMemory: 2000,
        providerTag: ''
    },
    'Medium': {
        commonName: 'Medium',
        cores: 4,
        baseMemory: 4000,
        providerTag: ''
    },
    'Large': {
        commonName: 'Large',
        cores: 8,
        baseMemory: 16000,
        providerTag: ''
    }
};
type Sizes = keyof typeof defaultSizes;

export type VirtualMachineArgs = {
    dnsProvider?: 'cloudflare' | 'hetzner';
    cloud: Keys;
    size: Sizes;
    image: BaseVMImage;
    additionalSubdomains?: string[];
    name?: string;
    hostname?: string;
    domain?: string;
    installDocker?: boolean;
    tlsEmail?: string;
    adminUser?: string;
    adminPassword?: string;
}

export abstract class VirtualMachine extends ComponentResource {
    cloudID: Output<string>;
    getCloudID(): Output<string> {
        return this.cloudID;
    }

    fqdn: string;
    hostname: string;
    templateImageURL: string | undefined;
    ipv4: Output<string>;
    ipv6: Output<string>;
    sizes: { [key: string]: Size };
    size: Size;

    name: string;
    domain: string;
    image: BaseVMImage;
    adminUser: string;
    adminPassword: string;
    publicKey: string;
    privateKey: string | Output<string>;
    vmConnection: Connection;
    initConnection: Connection;
    waitForPingCount: number;

    abstract get providerConnection(): Connection;


    dnsProvider?: DNSKeys | undefined;
    additionalSubdomains: string[] | undefined;
    dnsRecords: DNSRecord[];

    commandsDependsOn: any[]
    instance: Resource;

    get sudo(): string {
        return this.image.sudo(this.adminPassword);
    }

    get updateRepo(): string {
        return this.image.updateRepo;
    }
    get install(): string {
        return this.image.install;
    }

    abstract createVM(): void;

    constructor(
        name: string,
        args: VirtualMachineArgs,
        opts: { dependsOn?: any[] },
    ) {
        let stackStr;
        if (getStack() !== "main") {
            stackStr = `-${getStack()}`;
        }
        const vmName = `${name}${stackStr ?? ''}`;
        const hostname = args.hostname ?? vmName;
        const domain = args.domain ?? config.get('domain') ?? 'local';
        const fqdn = `${hostname}.${domain}`;
        super('pkg:index:VirtualMachine', fqdn, {}, opts);

        this.name = vmName;
        this.domain = domain;
        this.hostname = hostname;
        this.fqdn = fqdn;

        this.dnsProvider = args.dnsProvider;
        this.additionalSubdomains = args.additionalSubdomains;

        this.image = args.image ?? config.get('default-image');

        this.adminUser = args.adminUser ?? config.get(`default-admin-user`) ?? 'admin';
        this.adminPassword = args.adminPassword ?? config.require(`default-admin-password`);
        this.publicKey = config.get(`${this.name}-publicKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa.pub")).toString("utf8");
        this.privateKey = config.getSecret(`${this.name}-privateKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa")).toString("utf8");

        this.vmConnection = {
            host: this.fqdn,
            user: this.adminUser,
            password: this.adminPassword,
            privateKey: this.privateKey,
        };

        this.initConnection = this.vmConnection;
        this.waitForPingCount = 0;

        this.commandsDependsOn = opts?.dependsOn ?? [];

        this.ipv4 = interpolate``;
        this.ipv6 = interpolate``;
        this.cloudID = interpolate``;
        this.dnsRecords = [];

        this.sizes = { ...defaultSizes };
        this.size = this.sizes[args.size];
        this.instance = this;
    }

    setSizeOverrides(sizeOverrides: { [key: string]: Partial<Size> }) {
        Object.entries(sizeOverrides).forEach(
            ([commonName, overrides]) => {
                this.sizes[commonName] = {
                    ...this.sizes[commonName],
                    ...(typeof overrides === 'object' ? overrides : {})
                } as Size
            }
        );

        this.size = this.sizes[this.size.commonName];
    }

    waitForInitConnection(): void {
    }

    // Some paths won't need initVM (like anything using cloud-init), but it still will be called.
    // This takes care of getting the VM to be useable by adminUser
    initVM(): void {
        const conn = {
            host: this.fqdn,
            user: this.image.initUser ?? this.adminUser,
            password: this.adminPassword,
            privateKey: this.privateKey,
        };

        this.commandsDependsOn.push(
            this.image.initVM(conn, this)
        );
    }

    run(name: string, args: {
        connection?: Connection,
        create: Output<string>,
        waitForReboot?: boolean,
        waitForStart?: boolean,
        doNotDependOn?: boolean,
        delete?: Output<string>
    }): void {
        if (args.waitForStart) {
            this.waitForPing();
        }
        if (!args.connection) {
            args.connection = this.vmConnection;
        }

        let cmdArgs: remote.CommandArgs = {
            connection: args.connection,
            create: args.create,
            // This works around needing to use exactOptionalPropertyTypes
            ...(args.delete ? { delete: args.delete } : {}),
        }
        const cmd = new remote.Command(`${this.fqdn}:${name}`, cmdArgs, {
            dependsOn: this.commandsDependsOn,
            deleteBeforeReplace: true,
            parent: this.instance,
        });

        if (!args.doNotDependOn) {
            this.commandsDependsOn.push(cmd);
        }

        if (args.waitForReboot) {
            this.waitForPing({ parent: cmd, name: `${this.fqdn}:${name}` });
        }
    }

    waitForPing(args: { parent?: remote.Command, name?: string } = {}): void {
        this.waitForPingCount++;
        const waitForStart = new local.Command(`${this.fqdn}:waitForPing(${this.waitForPingCount})`, {
            create: interpolate`
                sleep 10; # Make sure the VM has stopped it's network before checking if it's up.
                # Getting the IP via dig works around issues with caching the DNS name.
                # Perhaps I should just use ip, or failing that then DNS?
                until ping -c 1 $(dig +short ${this.fqdn} | tail -n1); do 
                    sleep 5;
                done; 
            `
        }, {
            dependsOn: this.commandsDependsOn,
            deleteBeforeReplace: true,
        });
        this.commandsDependsOn.push(waitForStart);
    }

    finalizeVM(args: VirtualMachineArgs): void {
        if (this.dnsProvider) {
            DNSFactory.createARecord(`${this.fqdn}`, {
                domain: this.domain,
                hostname: this.hostname,
                dnsProvider: this.dnsProvider,
                value: interpolate`${this.ipv4}`,
            }, { dependsOn: this.commandsDependsOn });

            if (this.additionalSubdomains) {
                this.additionalSubdomains.forEach((record: string) => {
                    // This check has to be repeated in the loop because the context changes 
                    // enough from even just outside the loop.
                    if (this.dnsProvider) {
                        DNSFactory.createARecord(`${record}.${this.domain}`, {
                            domain: this.domain,
                            hostname: record,
                            dnsProvider: this.dnsProvider,
                            value: interpolate`${this.ipv4}`,
                        }, { dependsOn: this.commandsDependsOn });
                    }
                }, this);
            }
        }

        if (args.installDocker) {
            this.installDocker();
        }
    };

    installDocker(): void {
        this.image.installDocker(this.vmConnection, this)
    };
}
