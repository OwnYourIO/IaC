import { remote, types, local } from "@pulumi/command";
import { Output, Input, ComponentResource, Config, interpolate, getStack, Resource, log } from '@pulumi/pulumi';

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
        baseMemory: 8000,
        providerTag: ''
    },
    'Large': {
        commonName: 'Large',
        cores: 8,
        baseMemory: 16000,
        providerTag: ''
    }
};
// It's a little subtle how defaultSizes gets translated into a type. 
// For more info checkout:
// https://steveholgado.com/typescript-types-from-arrays/#arrays-of-objects
//type Sizes = typeof defaultSizes[string]['commonName'];
type Sizes = keyof typeof defaultSizes;

export type VirtualMachineArgs = {
    dnsProvider?: 'cloudflare' | 'hetzner';
    cloud: Keys;
    size: Sizes;
    image: BaseVMImage;
    extraStorageGB?: number | undefined;
    siblingSubdomains?: string[];
    childSubdomains?: string[];
    name?: string;
    hostname?: string;
    domain?: string;
    vLanId?: number | undefined;
    macAddress?: string | undefined;
    installDocker?: boolean;
    tlsEmail?: string;
    adminUser?: string;
    adminPassword?: Output<string>;
    commandsDependsOn?: any[];
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
    adminPassword: Output<string>;
    publicKey: string;
    privateKey: string | Output<string>;
    vmConnection: Connection;
    initConnection: Connection;
    waitForPingCount: number;
    waitForStopCount: number;

    abstract get providerConnection(): Connection;


    dnsProvider?: DNSKeys | undefined;
    siblingSubdomains: string[] | undefined;
    childSubdomains: string[] | undefined;
    dnsRecords: DNSRecord[];
    vLanID?: number | undefined;
    macAddress?: string | undefined;
    extraStorageGB?: number | undefined;

    commandsDependsOn: any[]
    instance: Resource;

    get sudo(): Output<string> {
        return this.image.sudo(this.adminPassword);
    }

    get updateRepo(): string {
        return this.image.updateRepo;
    }
    get install(): string {
        return this.image.install;
    }

    // Setup is for generically getting the install/configure code based on the image.
    get setup(): BaseVMImage {
        this.image.vm = this;
        return this.image
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
        // TODO: Validate that name can be a hostname?
        const hostname = args.hostname ?? vmName;
        const domain = args.domain ?? config.get('domain') ?? 'local';
        const fqdn = `${hostname}.${domain}`;
        super('pkg:index:VirtualMachine', fqdn, {}, opts);

        this.name = vmName;
        this.domain = domain;
        this.hostname = hostname;
        this.fqdn = fqdn;
        this.vLanID = args.vLanId;
        this.macAddress = args.macAddress;
        this.extraStorageGB = args.extraStorageGB;

        this.dnsProvider = args.dnsProvider;
        this.siblingSubdomains = args.siblingSubdomains;
        this.childSubdomains = args.childSubdomains;

        this.image = args.image;

        this.adminUser = args.adminUser ?? config.get(`default-admin-user`) ?? 'admin';
        // TODO: This should be generated and saved if not set initially.
        this.adminPassword = args.adminPassword ?? config.requireSecret<string>(`default-admin-password`);
        // TODO: This should be generated and saved if not set initially. Either in the user's file system or pulumi config.
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
        this.waitForStopCount = 0;

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
        waitForStop?: boolean,
        doNotDependOn?: boolean,
        delete?: Output<string>,
        environment?: Input<{
            [key: string]: Input<string>;
        }>
    }): Resource {
        if (args.waitForStart) {
            this.waitForPing({ parent: this.instance });
        }
        if (!args.connection) {
            args.connection = this.vmConnection;
        }

        let cmdArgs: remote.CommandArgs = {
            connection: args.connection,
            environment: { ...(args.environment), ...{ SUDO_PASSWORD: this.adminPassword } },
            create: args.create,
            // This works around needing to use exactOptionalPropertyTypes
            ...(args.delete ? { delete: args.delete } : {}),
        }
        const cmd = new remote.Command(`${this.fqdn}:${name}`, cmdArgs, {
            dependsOn: this.commandsDependsOn,
            parent: this.instance,
        });

        if (!args.doNotDependOn) {
            this.commandsDependsOn.push(cmd);
        }

        if (args.waitForReboot) {
            this.waitForStop({ parent: cmd, name: `${this.fqdn}:${name}` });
            return this.commandsDependsOn.slice(-1)[0];
        }
        return cmd;
    }

    copy(name: string, args: {
        connection?: Connection,
        //localPath: Output<string>,
        //remotePath: Output<string>
        localPath: string,
        remotePath: string,
        doNotDependOn?: boolean,
    }): Resource {
        if (!args.connection) {
            args.connection = this.vmConnection;
        }

        let cmdArgs: remote.CopyFileArgs = {
            connection: args.connection,
            localPath: args.localPath,
            remotePath: args.remotePath
        }
        const cmd = new remote.CopyFile(`${this.fqdn}:${name}`, cmdArgs, {
            dependsOn: this.commandsDependsOn,
            parent: this.instance,
        });

        if (!args.doNotDependOn) {
            this.commandsDependsOn.push(cmd);
        }

        return cmd;
    }

    waitForPing(args: { parent: Resource, name?: string }): void {
        this.waitForPingCount++;
        const waitForStart = new local.Command(`${this.fqdn}:waitForPing(${this.waitForPingCount})`, {
            create: interpolate`
                # Getting the IP via dig works around issues with caching the DNS name.
                # Perhaps I should just use ip, or failing that then DNS?
                until ping -c 1 $(dig +short ${this.fqdn} | tail -n1); do 
                    sleep 5;
                done; 
            `
        }, {
            dependsOn: this.commandsDependsOn,
            parent: args.parent ?? this.commandsDependsOn.slice(-1)[0]
        });
        this.commandsDependsOn.push(waitForStart);
    }

    waitForStop(args: { parent: Resource, name?: string }): void {
        this.waitForStopCount++;
        const waitForStop = new local.Command(`${this.fqdn}:waitForStop(${this.waitForStopCount})`, {
            create: interpolate`
                # Getting the IP via dig works around issues with caching the DNS name.
                # Perhaps I should just use ip, or failing that then DNS?
                until ! ping -c 1 $(dig +short ${this.fqdn} | tail -n1); do 
                    sleep 3;
                done; 
            `
        }, {
            dependsOn: this.commandsDependsOn,
            parent: args.parent ?? this.commandsDependsOn.slice(-1)[0]
        });
        this.commandsDependsOn.push(waitForStop);
    }
    finalizeVM(args: VirtualMachineArgs): void {
        this.image.installQemuGuestAgent(this);
        this.image.finalize(this);

        if (this.dnsProvider) {
            DNSFactory.createARecord(`${this.fqdn}`, {
                domain: this.domain,
                hostname: this.hostname,
                dnsProvider: this.dnsProvider,
                value: interpolate`${this.ipv4}`,
            }, { dependsOn: this.commandsDependsOn });

            if (this.siblingSubdomains) {
                this.siblingSubdomains.forEach((record: string) => {
                    // This check has to be repeated in the loop because the context changes 
                    // enough from even just outside the loop.
                    if (this.dnsProvider) {
                        DNSFactory.createCNameRecord(`${record}.${this.domain}`, {
                            domain: this.domain,
                            hostname: record,
                            dnsProvider: this.dnsProvider,
                            value: interpolate`${this.fqdn}`,
                        }, { dependsOn: this.commandsDependsOn });
                    }
                }, this);
            }
            if (this.childSubdomains) {
                this.childSubdomains.forEach((record: string) => {
                    // This check has to be repeated in the loop because the context changes 
                    // enough from even just outside the loop.
                    if (this.dnsProvider) {
                        DNSFactory.createCNameRecord(`${record}.${this.domain}`, {
                            domain: this.domain,
                            hostname: `${record}.${this.hostname}`,
                            dnsProvider: this.dnsProvider,
                            value: interpolate`${this.fqdn}`,
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
