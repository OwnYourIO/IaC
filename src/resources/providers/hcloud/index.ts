import { Config } from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import { VirtualMachine, VirtualMachineArgs } from "..";
const config = new Config();


export class HCloudVM extends VirtualMachine {
    constructor(name: string, args: VirtualMachineArgs, opts: {}) {
        super(name, args, opts);
        this.setSizeOverrides({
            'Small': { providerTag: 'cpx11' },
            'Medium': { providerTag: '' },
            'Large': { providerTag: '' },
        });
    }

    get providerConnection() {
        return this.vmConnection
    }

    createVM(): VirtualMachine {
        const serverType = config.get(`hetzner-vm-${this.size.commonName}`) ?? this.size.providerTag ?? 'cpx11';
        const location = config.get('hetzner-default-location') ?? 'ash';

        const hcloudKey = new hcloud.SshKey(`ssh-${this.fqdn}`, {
            publicKey: this.publicKey
        });
        const sshKeys = [hcloudKey.id];

        const server = new hcloud.Server(`${this.fqdn}`, {
            serverType: serverType,
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
        }, { dependsOn: [hcloudKey] });
        this.commandsDependsOn.push(server);
        this.ipv4 = server.ipv4Address;
        this.vmConnection = {
            host: this.ipv4,
            user: 'root',
            password: this.adminPassword,
            privateKey: this.privateKey
        }
        return this;
    }
}
