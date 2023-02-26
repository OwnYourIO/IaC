import { Config } from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import { VirtualMachine, VirtualMachineArgs } from "..";
import { Sizes } from "..";


export class HCloudVM extends VirtualMachine {
    constructor(name: string, args: VirtualMachineArgs, opts: {}) {
        super(name, args, opts);
    }

    get providerConnection() {
        return this.vmConnection
    }

    createVM(): VirtualMachine {

        const hcloudKey = new hcloud.SshKey(`ssh-${this.fqdn}`, {
            publicKey: this.publicKey
        });
        const sshKeys = [hcloudKey.id];

        const server = new hcloud.Server(`${this.fqdn}`, {
            serverType,
            image: this.image.name,
            location,
            sshKeys,
            userData: `
                #cloud-config
                users:
                    - 
                        name: ${this.adminUser}
                        groups: [users, admin]
                        sudo: '${this.adminUser} ALL=(ALL) NOPASSWD:ALL'
                        shell: '/bin/bash'
                        ssh_authorized_keys:
                            - ${this.publicKey}
            `
        }, {});
        return this;
    }
}
