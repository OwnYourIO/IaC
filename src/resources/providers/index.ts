import { remote, types } from "@pulumi/command";
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

    createVM(): void {
        let args: any = {};
        //}

        const connection: types.input.remote.ConnectionArgs = {
            host: this.ipv4 || this.hostname,
            user: this.adminUser,
            privateKey: this.privateKey,
        };

        this.commandsDependsOn.push(
            this.finalizeVM(connection)
        );

        if (this.installDocker) {
            this.commandsDependsOn.push(
                this.installDocker(this.image, this.commandsDependsOn, connection)
            );
        }
    }

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

    finalizeVM(
        connection: types.input.remote.ConnectionArgs,
    ): any[] {
        this.image.finalize(this.commandsDependsOn, connection, this.adminUser);

        return this.commandsDependsOn;
    };

    installDocker(image: BaseVMImage, commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs): any[] {
        commandsDependsOn.push(image.installDocker(commandsDependsOn, connection));
        return commandsDependsOn;
    };
}
