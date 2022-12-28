import { ComponentResource, Output } from '@pulumi/pulumi';

import {
    Config,
    log, concat, interpolate, Input,
    output,
    StackReference, getStack,
} from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";
import * as cloudflare from "@pulumi/cloudflare";
import * as proxmox from "@muhlba91/pulumi-proxmoxve";
import { remote, types } from "@pulumi/command";

import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const config = new Config();

export class VirtualMachine extends ComponentResource {
    constructor(
        name: string,
        args: {
            dnsProvider?: 'cloudflare' | 'hetzner';
            cloud: 'proxmox' | 'hetzner';
            size: 'Small' | 'Medium' | 'Large';
            additionalSubdomains?: string[];
            name?: string;
            hostname: string;
            domain?: string;
            installDocker?: boolean;
            installNetmaker?: boolean;
            installNetclient?: boolean;
            debTemplate?: boolean;
            proxmoxTemplate?: boolean;
            tlsEmail?: string;
            adminUser?: string;
            image?: string;
            vmId?: Input<number>;
        },
        opts: {},
    ) {
        super('pkg:index:VirtualMachine', name, {}, opts);
        args.domain = args.domain ?? 'local';
        this.fqdn = `${args.hostname}.${args.domain}`;

        const image = args.image ?? config.get('default-image') ?? 'debian11';

        const adminUser = args.adminUser ?? config.get(`default-admin-user`) ?? 'admin';
        const publicKey = config.get(`${name}-publicKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa.pub")).toString("utf8");
        const privateKey = config.getSecret(`${name}-privateKey`) ?? readFileSync(join(homedir(), ".ssh", "id_rsa")).toString("utf8");

        const commandsDependsOn: any[] = [];

        let proxmoxConnection: types.input.remote.ConnectionArgs | undefined;

        switch (args.cloud) {
            case 'proxmox':

                const proxmoxEndpoint = config.require('proxmox_ve_endpoint');
                const provider = this.getProxmoxProvider(
                    proxmoxEndpoint,
                    true,
                    config.require('proxmox_ve_username'),
                    config.require('proxmox_ve_password')
                );

                let templateId: Output<any> | undefined;
                let templateImageURL: string;
                let predefinedHostname: 'debian.local' | 'microos.local' | undefined;
                const env = getStack();
                    case 'debian11':
                switch (image) {
                    case 'debian11': {
                        if (!args.proxmoxTemplate) {
                            templateId = templates.getOutput(`${image}${args.size}TemplateId`);
                        }
                        predefinedHostname = 'debian.local';
                        templateImageURL = 'https://cdimage.debian.org/images/cloud/bullseye/latest/debian-11-genericcloud-amd64.qcow2';
                    } break;
                    case 'microos': {
                        if (!args.proxmoxTemplate) {
                            templateId = templates.getOutput(`${image}${args.size}TemplateId`);
                        }
                        //predefinedHostname = undefine            d;
                        hasAgentEnbled = false;
                        templateImageURL = 'https://download.opensuse.org/tumbleweed/appliances/openSUSE-MicroOS.x86_64-ContainerHost-OpenStack-Cloud.qcow2';
                    } break;
                    default:
                        new Error(`image: ${image} not supported`);
                        // This makes the linter happy. It should never get called.
                        templateId = concat('');
                        templateImageURL = '';
                        break;
                }

                let templateVMSettings = {};
                if (args.proxmoxTemplate) {
                    switch (args.size) {
                        case 'Small':
                            templateVMSettings = {
                                ...templateVMSettings,
                                // Has to be off otherwise the commands to shuffle disks don't work.
                                started: false,
                                cpu: {
                                    cores: 2,
                                    sockets: 1,
                                },
                                memory: {
                                    dedicated: 2000,
                                },
                                agent: {
                                    enabled: false,
                                    trim: true,
                                    type: 'virtio',
                                },
                            }
                            break;
                        default:
                            new Error(`size: ${args.size} not supported`);
                            break;
                    }
                } else {
                    templateVMSettings = {
                        ...templateVMSettings,
                        started: true,
                        reboot: true,
                        clone: {
                            vmId: templateId,
                            datastoreId: 'local-lvm',
                            full: true,
                        },
                    }
                }

                let preConditions = [provider];
                const defaultVMSettings = {
                    name: args.name ?? args.hostname,
                    hostname: args.hostname,
                    initialization: {
                        type: 'nocloud',
                        dns: {
                            domain: args.domain ?? 'local',
                            server: '192.168.88.1',
                        },
                        datastoreId: 'local-lvm',
                        userAccount: {
                            username: adminUser,
                            keys: [publicKey],
                        }
                    },
                    agent: {
                        enabled: true, // allows checking for ip addresses through qemu-guest-agent
                        trim: true,
                        type: 'virtio',
                    },
                    cdrom: { enabled: true },
                    networkDevices: [
                        {
                            bridge: 'vmbr0',
                            model: 'virtio',
                        },
                    ],
                    onBoot: true,
                    started: true,
                    operatingSystem: { type: 'l26' },
                    timeoutShutdownVm: 45,
                    timeoutReboot: 45,
                };

                const proxmoxServer = new proxmox.vm.VirtualMachine(`${this.fqdn}`, {
                    ...defaultVMSettings,
                    ...templateVMSettings,
                }, { provider: provider, dependsOn: preConditions });
                this.cloudID = proxmoxServer.id;

                if (args.proxmoxTemplate) {
                    const proxmoxHostRegexMatches = proxmoxEndpoint?.match(/http.*:\/\/(.*):/);
                    const proxmoxHostname = proxmoxHostRegexMatches ? proxmoxHostRegexMatches[1] : '';

                    proxmoxConnection = {
                        host: proxmoxHostname,
                    };

                    // Images can be found at: https://docs.openstack.org/image-guide/obtain-images.html
                    const proxmoxTemplatePost = new remote.Command("Add debian image to template VM", {
                        connection: proxmoxConnection,
                        create: interpolate`
                                            | sha256sum --check  \
                                            || wget -O ${image}.qcow2 ${templateImageURL} 
                                            which expect || apt install -y expect
                                            qm importdisk ${this.cloudID} ${image}.qcow2 local-lvm
                                            qm set ${this.cloudID} --scsi0 local-lvm:vm-${this.cloudID}-disk-1
                                            # Have to turn the VM on so that the guest-agent can be installed.
                                            qm start ${this.cloudID}
                                            until qm status ${this.cloudID} | grep running; do 
                                                sleep 1;
                                            done; 
                                            sleep 60;
                                            qm shutdown ${this.cloudID}
                                            qm wait ${this.cloudID}
                                            qm start ${this.cloudID}
                                            until ping -c 1 ${args.hostname}.local; do 
                                                sleep 5;
                                            done; 
                                            `
                    }, { dependsOn: commandsDependsOn });
                    commandsDependsOn.push(proxmoxTemplatePost);
                }

                this.ipv4 = proxmoxServer.ipv4Addresses[1][0];
                this.ipv6 = proxmoxServer.ipv6Addresses[1][0];
                break;
            case 'hetzner':
                const serverType = config.get(`hetzner-vm-${args.size}`) ?? 'cpx11';
                const location = config.get('hetzner-default-location') ?? 'ash';

                const hcloudKey = new hcloud.SshKey(`ssh-${this.fqdn}`, {
                    publicKey: publicKey
                });
                const sshKeys = [hcloudKey.id];

                const server = new hcloud.Server(`${this.fqdn}`, {
                    serverType,
                    image,
                    location,
                    sshKeys,
                    userData: `
                        #cloud-config
                        users:
                            - 
                                name: ${adminUser}
                                #groups: 'users, admin'
                                sudo: 'ALL=(ALL) NOPASSWD:ALL'
                                shell: '/bin/bash'
                                ssh_authorized_keys:
                                    - ${publicKey}
                    `
                }, {});
                commandsDependsOn.push(server);

                this.cloudID = output<string>("-1");
                this.ipv4 = server.ipv4Address;
                this.ipv6 = server.ipv6Address;
                break;
        }

        if (args.dnsProvider) {
            new DNSRecord(this.fqdn, {
                dnsProvider: 'cloudflare',
                ipv4: this.ipv4,
                ipv6: this.ipv6,
            }, {});

            if (args.additionalSubdomains) {
                args.additionalSubdomains.forEach((record: string) => {
                    new DNSRecord(`${record}.${args.domain}`, {
                        dnsProvider: 'cloudflare',
                        ipv4: this.ipv4,
                        ipv6: this.ipv6,
                    }, {});
                });
            }
        }

        const connection: types.input.remote.ConnectionArgs = {
            host: this.ipv4 || args.hostname,
            user: adminUser,
            privateKey: privateKey,
        };

        if (args.proxmoxTemplate && proxmoxConnection) {
            switch (args.image) {
                case 'debian11':
                    const installGuestAgent = new remote.Command("Add guest-agent and update.", {
                        connection: connection,
                        create: `export DEBIAN_FRONTEND=noninteractive; 
                create: `export DEBIAN_FRONTEND=noninteractive; 
                        create: `export DEBIAN_FRONTEND=noninteractive; 
                            sudo apt-get update;
                            sudo apt-get upgrade -y;
                            sudo apt-get install -y qemu-guest-agent;
                            sudo systemctl enable qemu-guest-agent;
                            sudo sh -c 'cat /dev/null > /etc/machine-id';
                            sudo sh -c 'cat /dev/null > /var/lib/dbus/machine-id';
                            sudo cloud-init clean;
                        `
                    }, { dependsOn: commandsDependsOn });
                    commandsDependsOn.push(installGuestAgent);
                    const proxmoxTemplatePost = new remote.Command("Remove cloudinit drive", {
                        connection: proxmoxConnection,
                        create: interpolate`
                                qm stop ${this.cloudID};
                                qm set ${this.cloudID} --ide2 none;
                        `
                    }, { dependsOn: commandsDependsOn });
                    commandsDependsOn.push(proxmoxTemplatePost);
                    break;
                case 'microos': {
                    const proxmoxTemplatePost = new remote.Command("Remove cloudinit drive", {
                        connection: proxmoxConnection,
                        create: interpolate`
                                qm set ${this.cloudID} --ide2 none;
                                qm set ${this.cloudID} --agent 1;
                        `
                    }, { dependsOn: commandsDependsOn });
                    commandsDependsOn.push(proxmoxTemplatePost);
                    const installDockerAndGuestAgent = new remote.Command("Install docker and guest-agent", {
                        connection: args.proxmoxTemplate ? { ...connection, ...{ host: args.hostname, user: 'root' } } : connection,
                        create: interpolate`
                                    transactional-update pkg in -y docker docker-compose qemu-guest-agent system-group-wheel
                                    reboot&
                                    exit
                                `
                    }, { dependsOn: commandsDependsOn });
                    commandsDependsOn.push(installDockerAndGuestAgent);
                    const enableDocker = new remote.Command("Enable docker and guest-agent", {
                        connection: args.proxmoxTemplate ? { ...connection, ...{ host: args.hostname, user: 'root' } } : connection,
                        create: interpolate`
                                    systemctl enable docker
                                    sed '/%wheel ALL=(ALL:ALL) NOPASSWD: ALL/s/^# //' -i /etc/sudoers
                                    sed '/Defaults targetpw/s/^/#/g' -i /etc/sudoers
                                    sed '/ALL   ALL=(ALL) ALL/s/^/#/g' -i /etc/sudoers
                                    /usr/sbin/usermod -aG wheel ${adminUser}
                                    sh -c 'cat /dev/null > /etc/machine-id'
                                    sh -c 'cat /dev/null > /var/lib/dbus/machine-id'
                                    cloud-init clean
                                    shutdown 0&
                                    exit
                                `
                    }, { dependsOn: commandsDependsOn });
                    commandsDependsOn.push(enableDocker);
                } break
                default:
            }
        }

        // TODO: These needs to get abstracted out and exported/imported.
        if (args.installDocker) {
            const docker = new remote.Command(`${this.fqdn}: Install Docker`, {
                connection,
                create: `export DEBIAN_FRONTEND=noninteractive; 
                    sudo apt-get update;
                    sudo apt-get upgrade -y;
                    sudo apt install curl wget git -y;
                    curl -fsSL https://get.docker.com | sudo sh;
                    sudo apt-get install -y docker-compose;
                    sudo systemctl enable --now docker;
            `,
            }, { deleteBeforeReplace: true, dependsOn: commandsDependsOn });
            commandsDependsOn.push(docker);
        }

        if (args.installNetmaker) {
            const netmaker = new remote.Command("Install Netmaker", {
                connection,
                create: `export DEBIAN_FRONTEND=noninteractive; 
                    sudo apt-get install -y wireguard ufw;
                    sudo ufw allow ssh;
                    sudo ufw allow proto tcp from any to any port 443;
                    sudo ufw allow 51821:51830/udp;
                    sudo iptables --policy FORWARD ACCEPT;
                    sudo systemctl enable --now ufw; 
                `,
            }, { dependsOn: commandsDependsOn, deleteBeforeReplace: true });

            const dockerCompose = new remote.Command("Install Netmaker: Edit docker-compose.yml", {
                connection,
                // TODO: Need docker-compose.yml output. Or maybe just master key and mq admin password?
                create: `export DEBIAN_FRONTEND=noninteractive; 
                    wget -O docker-compose.yml https://raw.githubusercontent.com/gravitl/netmaker/master/compose/docker-compose.yml;
                    sed -i "s/NETMAKER_BASE_DOMAIN/${this.fqdn}/g" docker-compose.yml;
                    sed -i "s/SERVER_PUBLIC_IP/$(ip route get 1 | sed -n 's/^.*src ${String.raw`\([0-9.]*\) .*$/\1/p`}')/g" docker-compose.yml;
                    sed -i 's/YOUR_EMAIL/${args.tlsEmail}/g' docker-compose.yml;
                    sed -i "s/REPLACE_MASTER_KEY/$(tr -dc A-Za-z0-9 </dev/urandom | head -c 30 ; echo '')/g" docker-compose.yml
                    sed -i "s/REPLACE_MQ_ADMIN_PASSWORD/$(tr -dc A-Za-z0-9 </dev/urandom | head -c 30)/g" docker-compose.yml
                `,
            }, { dependsOn: commandsDependsOn, deleteBeforeReplace: true });

            const mosquitto = new remote.Command("Install Netmaker: Edit mosquitto config.", {
                connection,
                create: `export DEBIAN_FRONTEND=noninteractive; 
                sudo wget -O /root/mosquitto.conf https://raw.githubusercontent.com/gravitl/netmaker/master/docker/mosquitto.conf;
                sudo wget -q -O /root/wait.sh https://raw.githubusercontent.com/gravitl/netmaker/develop/docker/wait.sh;
                sudo chmod +x /root/wait.sh;
                `,
            }, { dependsOn: commandsDependsOn, deleteBeforeReplace: true });

            const netmakerFinished = new remote.Command("Install Netmaker: docker-compose up ", {
                connection,
                create: `export DEBIAN_FRONTEND=noninteractive; 
                sudo docker-compose up -d;
                `,
            }, { dependsOn: [dockerCompose, netmaker, mosquitto, ...commandsDependsOn], deleteBeforeReplace: true });
            commandsDependsOn.push(netmakerFinished);
        }

        if (args.installNetclient) {
            const netclient = new remote.Command(`${this.fqdn}: Install Netclient`, {
                connection,
                create: `export DEBIAN_FRONTEND=noninteractive; 
                    sudo curl -sL 'https://apt.netmaker.org/gpg.key' | sudo tee /etc/apt/trusted.gpg.d/netclient.asc; 
                    sudo curl -sL 'https://apt.netmaker.org/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/netclient.list;
                    sleep 1; # Dumb hack to make sure the files are saved before updating. Failed otherwise. 
                    sudo apt-get -o DPkg::Lock::Timeout=120 update -y;
                    sudo apt-get -o DPkg::Lock::Timeout=120 upgrade -y;
                    sudo apt-get -o DPkg::Lock::Timeout=120 install -y netclient;
                `,
            }, { dependsOn: commandsDependsOn, deleteBeforeReplace: true });
            commandsDependsOn.push(netclient);
        }
    }

    private static proxmoxProvider: proxmox.Provider | undefined;
    getProxmoxProvider(endpoint: string, insecure: boolean, username: string, password: string): proxmox.Provider {
        // Have to use a provider to work around a nested config issue
        // https://www.pulumi.com/registry/packages/proxmoxve/installation-configuration/
        if (!VirtualMachine.proxmoxProvider) {
            VirtualMachine.proxmoxProvider = new proxmox.Provider('proxmoxve', {
                virtualEnvironment: {
                    endpoint: endpoint,
                    insecure: insecure,
                    username: username,
                    password: password,
                }
            }, {});
        }
        return VirtualMachine.proxmoxProvider;
    }

    cloudID: Output<string>;
    getCloudID(): Output<string> {
        return this.cloudID;
    }

    fqdn: string;
    ipv4: Output<string>;
    ipv6: Output<string>;
}

export class Storage extends ComponentResource {
    constructor(
        name: string,
        args: {
            cloud: 'proxmox' | 'hetzner';
            size: 'small' | 'medium' | 'large';
        },
        opts: {},
    ) {
        super('pkg:index:VirtualMachine', name, {}, opts);
        switch (args.cloud) {
            case 'proxmox':
                this.name = concat(name, 'hi');
                break;
            case 'hetzner':
                this.name = concat(name, 'hi');
                break;
        }
    }
    name: Output<string>;
}

export class DNSRecord extends ComponentResource {
    constructor(
        name: string,
        args: {
            dnsProvider: 'cloudflare' | 'hetzner';
            ipv4: Output<string>;
            ipv6?: Output<string>;
            ttl?: number;
        },
        opts: {},
    ) {
        super('pkg:index:DNSRecord', name, {}, opts);
        const ttl = args.ttl ?? config.getNumber('defaultTTL') ?? 60;
        this.ipv4 = args.ipv4;
        this.ipv6 = args.ipv6;
        this.fqdn = name;

        switch (args.dnsProvider) {
            case 'cloudflare':
                const zoneId = config.require('cloudflare-zoneId');

                const ipv4Record = new cloudflare.Record(`${name}-ipv4`, {
                    name,
                    zoneId,
                    type: "A",
                    value: this.ipv4,
                    ttl: ttl
                });

                if (this.ipv6) {
                    const ipv6Record = new cloudflare.Record(`${name}-ipv6`, {
                        name,
                        zoneId,
                        type: "AAAA",
                        value: this.ipv6,
                        ttl: ttl
                    });
                }
                break;
            case 'hetzner':
                break;
        }
    }

    fqdn: string;
    ipv4: Output<string>;
    ipv6: Output<string> | undefined | null;
}
