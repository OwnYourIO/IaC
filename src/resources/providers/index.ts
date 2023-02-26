import { remote, types, local } from "@pulumi/command";
import { Output, Input, ComponentResource, Config, interpolate, getStack } from '@pulumi/pulumi';

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

export type Size = {
    cores: number,
    baseMemory: number
};
const sizes = {
    'Small': {
        cores: 2,
        baseMemory: 2000
    }, 'Medium': {
        cores: 4,
        baseMemory: 4000
    }, 'Large': {
        cores: 8,
        baseMemory: 16000
    }
};

export type VirtualMachineArgs = {
    dnsProvider?: 'cloudflare' | 'hetzner';
    cloud: Keys;
    size: keyof typeof sizes;
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

    size: Size;

    name: string;
    domain: string;
    image: BaseVMImage;
    adminUser: string;
    adminPassword: string;
    publicKey: string;
    privateKey: string | Output<string>;
    vmConnection: Input<types.input.remote.ConnectionArgs>;
    initConnection: Input<types.input.remote.ConnectionArgs>;
    waitForPingCount: number;

    abstract get providerConnection(): Input<types.input.remote.ConnectionArgs>;


    dnsProvider?: DNSKeys | undefined;
    additionalSubdomains: string[] | undefined;
    dnsRecords: DNSRecord[];

    commandsDependsOn: any[]

    get sudo(): string {
        return this.image.sudo(this.adminPassword);
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

        this.size = sizes[args.size];

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

        this.commandsDependsOn = [];

        this.ipv4 = interpolate``;
        this.ipv6 = interpolate``;
        this.cloudID = interpolate``;
        this.dnsRecords = [];
    }

    waitForInitConnection(): void {
    }

    // Some paths won't need initVM (like anything using cloud-init), but it still will be called.
    // This takes care of getting the VM to be useable by adminUser
    initVM(): void {
        const conn = {
            host: this.fqdn,
            user: this.image.initUser,
            password: this.adminPassword,
            privateKey: this.privateKey,
        };

        this.commandsDependsOn.push(
            this.image.initVM(conn, this)
        );
    }

    run(name: string, args: {
        connection: Connection,
        create: Output<string>,
        waitForReboot?: boolean,
        waitForStart?: boolean,
        doNotDependOn?: boolean,
        delete?: Output<string>
    }): void {
        if (args.waitForStart) {
            this.waitForPing(undefined, undefined);
        }
        const cmd = new remote.Command(`${this.fqdn}:${name}`, {
            connection: args.connection,
            create: args.create,
            delete: args.delete,
        }, {
            dependsOn: this.commandsDependsOn,
        });

        if (args.waitForReboot) {
            this.waitForPing(cmd, `${this.fqdn}:${name}`);
            return;
        }

        if (!args.doNotDependOn) {
            this.commandsDependsOn.push(cmd);
        }
    }

    waitForPing(parent?: remote.Command | undefined, name?: string | undefined): void {
        this.waitForPingCount++;
        const waitForStart = new local.Command(`${this.fqdn}:waitForPing(${this.waitForPingCount})`, {
            create: interpolate`
                sleep 10; # Make sure the VM has stopped it's network before checking if it's up.
                until ping -c 1 ${this.fqdn}; do 
                    sleep 5;
                done; 
            `
        }, {
            dependsOn: this.commandsDependsOn,
            parent: parent,
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

    };

    installDocker(): void {
        this.commandsDependsOn.push(
            this.image.installDocker(this.vmConnection, this)
        );
    };
}
