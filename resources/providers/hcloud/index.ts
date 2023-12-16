import { Config } from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import { VirtualMachine, VirtualMachineArgs } from "..";

// TODO: Config should be made static on the base class? Or maybe here so it can be used by more than 1 resource type.
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
            // TODO: Some possible additions:
            //#packages:
            //#- fail2ban
            //#- ufw
            //#package_update: true
            //#package_upgrade: true
            //#runcmd:
            //#- printf "[sshd]\nenabled = true\nbanaction = iptables-multiport" > /etc/fail2ban/jail.local
            //#- systemctl enable fail2ban
            //#- ufw allow OpenSSH
            //#- ufw enable
            //#- sed -i -e '/^PermitRootLogin/s/^.*$/PermitRootLogin no/' /etc/ssh/sshd_config
            //#- sed -i -e '/^PasswordAuthentication/s/^.*$/PasswordAuthentication no/' /etc/ssh/sshd_config
            //#- sed -i -e '/^X11Forwarding/s/^.*$/X11Forwarding no/' /etc/ssh/sshd_config
            //#- sed -i -e '/^#MaxAuthTries/s/^.*$/MaxAuthTries 2/' /etc/ssh/sshd_config
            //#- sed -i -e '/^#AllowTcpForwarding/s/^.*$/AllowTcpForwarding no/' /etc/ssh/sshd_config
            //#- sed -i -e '/^#AllowAgentForwarding/s/^.*$/AllowAgentForwarding no/' /etc/ssh/sshd_config
            //#- sed -i -e '/^#AuthorizedKeysFile/s/^.*$/AuthorizedKeysFile .ssh\/authorized_keys/' /etc/ssh/sshd_config
            //#- sed -i '$a AllowUsers holu' /etc/ssh/sshd_config
            //#- reboot`
            //}, {});
            //TODO: It seems like this should depend on something passed in
        }, { dependsOn: [] });
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
