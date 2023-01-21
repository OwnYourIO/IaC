import { remote, types } from "@pulumi/command";
import { Output, ComponentResource, Config, interpolate } from '@pulumi/pulumi';

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
    hostname: string;
    domain?: string;
    installDocker?: boolean;
    tlsEmail?: string;
    adminUser?: string;
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
    publicKey: string;
    privateKey: string | Output<string>;

    dnsProvider: string | undefined;
    additionalSubdomains: string[] | undefined;

    commandsDependsOn: any[]

    createVM(): void {
        let args: any = {};
        //}

        const connection: types.input.remote.ConnectionArgs = {
            host: this.ipv4 || this.hostname,
            privateKey: this.privateKey,
        };

        this.commandsDependsOn.push(
            this.finalizeVM(connection)
        );

    }

    constructor(
        name: string,
        args: VirtualMachineArgs,
        opts: {},
    ) {
        super('pkg:index:VirtualMachine', name, {}, opts);
        this.name = args.hostname;
        this.domain = args.domain = args.domain ?? 'local';
        this.fqdn = `${args.hostname}.${args.domain}`;
        this.hostname = args.hostname;

        this.dnsProvider = args.dnsProvider;
        this.additionalSubdomains = args.additionalSubdomains;

        this.image = args.image ?? config.get('default-image');

        this.adminUser = args.adminUser ?? config.get(`default-admin-user`) ?? 'admin';
        this.publicKey = config.get(`${name}-publicKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa.pub")).toString("utf8");
        this.privateKey = config.getSecret(`${name}-privateKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa")).toString("utf8");

        this.commandsDependsOn = [];

        this.ipv4 = interpolate``;
        this.ipv6 = interpolate``;
        this.cloudID = interpolate``;

    finalizeVM(
        connection: types.input.remote.ConnectionArgs,
    ): any[] {

        return this.commandsDependsOn;
    };

}
