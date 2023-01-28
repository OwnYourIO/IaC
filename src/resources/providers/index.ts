import { remote, types, local } from "@pulumi/command";
import { Output, Input, ComponentResource, Config, interpolate, getStack } from '@pulumi/pulumi';

import { BaseVMImage } from "../images";
import { Keys } from "../";

//@ts-ignore
import { readFileSync } from "fs";
//@ts-ignore
import { join } from "path";
//@ts-ignore
import { homedir } from "os";

const config = new Config();

export type VirtualMachineArgs = {
    dnsProvider?: 'cloudflare' | 'hetzner';
    cloud: Keys;
    size: 'Small' | 'Medium' | 'Large';
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

    name: string;
    domain: string;
    image: BaseVMImage;
    adminUser: string;
    adminPassword: string;
    publicKey: string;
    privateKey: string | Output<string>;
    vmConnection: Input<types.input.remote.ConnectionArgs>;

    dnsProvider: string | undefined;
    additionalSubdomains: string[] | undefined;

    commandsDependsOn: any[]

    get sudo(): string {
        return this.image.sudo(this.adminPassword);
    }

    abstract createVM(): void;

    constructor(
        name: string,
        args: VirtualMachineArgs,
        opts: {},
    ) {
        let stackStr;
        if (getStack() !== "main") {
            stackStr = `-${getStack()}`;
        }
        const vmName = `${name}${stackStr ?? ''}`;
        const hostname = args.hostname ?? vmName;
        const domain = args.domain ?? 'local';
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

        this.commandsDependsOn = [];

        this.ipv4 = interpolate``;
        this.ipv6 = interpolate``;
        this.cloudID = interpolate``;
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

    waitForConnection(): void {
        const waitForStart = new local.Command(`${this.fqdn}:waitForConnection`, {
            create: interpolate`
                sleep 5; # Make sure the VM has stopped it's network before checking if it's up.
                until ping -c 1 ${this.fqdn}; do 
                    sleep 5;
                done; 
            `
        }, { dependsOn: this.commandsDependsOn });
        this.commandsDependsOn.push(waitForStart);
    }

    };

    installDocker(): void {
        this.commandsDependsOn.push(
            this.image.installDocker(this.vmConnection, this)
        );
    };
}
