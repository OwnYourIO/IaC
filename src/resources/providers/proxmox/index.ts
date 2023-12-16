import { remote, local, types } from "@pulumi/command";
import * as proxmox from "@muhlba91/pulumi-proxmoxve";

import { Config, log, concat, interpolate, Input, Output, StackReference, getStack, } from "@pulumi/pulumi";

import { VirtualMachine, VirtualMachineArgs, } from "..";
import { MicroOS, MicroOSDesktop } from '../../images/microos';
import { Debian11 } from '../../images/debian';
import { HomeAssistantOS } from '../../images/homeassistant';
import { OpnSenseInstaller } from "../../images/bsd";

// TODO: Config should be made static on the base class? Or maybe here so it can be used by more than 1 resource type.
const config = new Config();

export class ProxmoxVM extends VirtualMachine {
    private static ProxmoxProvider: proxmox.Provider | undefined;

    constructor(name: string, args: VirtualMachineArgs, opts: {}) {
        super(name, args, opts);
        this.initConnection = { ...this.initConnection, ...{ user: 'root' } };
    }

    createVM(): VirtualMachine {
        let vmSettings = {
            started: false,
            cpu: {
                cores: this.size.cores,
                sockets: 1,
            },
            memory: {
                dedicated: this.size.baseMemory,
            },
            vga: {
                enabled: true,
                // TODO: This should be a provider call getVideoMemory(size)
                memory: 512,
                type: 'virtio',
            },
            agent: {
                enabled: this.image.guestAgent,
                trim: true,
                type: 'virtio',
            },
            name: this.name,
            hostname: this.hostname,
            initialization: {
                type: 'nocloud',
                dns: {
                    domain: this.domain ?? 'local',
                    server: '192.168.88.1',
                },
                ipConfigs: [{ ipv4: { address: 'dhcp' } }],
                datastoreId: config.get('proxmox-storage') ?? 'local-lvm',
                userAccount: {
                    username: this.image.initUser ?? this.adminUser,
                    password: this.adminPassword,
                    keys: [this.publicKey],
                },
            },
            // This is needed for at least MicroOS. Maybe others?
            cdrom: { enabled: true },
            // TODO: This should be a setting
            nodeName: 'pve-main',
            networkDevices: [
                {
                    bridge: 'vmbr0',
                    model: 'virtio',
                    vlanId: this.vLanID ?? null,
                },
            ],
            onBoot: true,
            bios: 'ovmf',
            machine: 'q35',
            operatingSystem: { type: 'l26' },
            timeoutShutdownVm: 45,
            timeoutStopVm: 45,
            timeoutReboot: 45,
            disks: [{
                interface: 'scsi0',
            ]
        };

        this.commandsDependsOn.push(ProxmoxVM.getProvider());

        // TODO: This should get set on the instance, but isn't currently because 
        // I can't deal with the type. Once this moves to a generic that'll be easy.
        const proxmoxServer = new proxmox.vm.VirtualMachine(`${this.hostname}`, {
            ...vmSettings,
            //...overrideVMSettings,
        }, {
            provider: ProxmoxVM.getProvider(),
            dependsOn: this.commandsDependsOn,
            // Currently the parameters that are assigned to the resource in pulumi
            // seem like they are the initial values, not what I set... But then cdrom: enabled did so IDK.
            ignoreChanges: [
                'started',
                'bios',
                'networkDevices',
                'vga',
                'cpu',
                'disks',
                'keyboardLayout',
                'memory',
                'name',
                'NetworkDevices',
                'operatingSystem',
                'serialDevices',
                'cdrom',
                'initialization',
                'agent'
            ],
            parent: this,
        });
        this.commandsDependsOn.push(proxmoxServer);
        this.instance = proxmoxServer;

        this.ipv4 = proxmoxServer.ipv4Addresses[1][0];
        this.ipv6 = proxmoxServer.ipv6Addresses[1][0];
        this.cloudID = proxmoxServer.id;
        // TODO: This could be refactored into a key/value pair and called like
        // images[this.image.name].setup(this.image);
        switch (this.image.name) {
            case 'microos':
                this.microosProxmoxSetup();
                break;
            case 'microos-dvd':
                this.microosDesktopSetup(this.image);
                break;
            case 'debain-11':
                this.debianProxmoxSetup();
                break;
            case 'debain-12':
                this.debianProxmoxSetup();
                break;
            case 'homeassistant':
                this.homeassistantProxmoxSetup(this.image);
                break;
            case 'opnsense-installer':
                this.opnSenseInstaller();
                break;
            case 'freebsd':
            case 'opnsense':
                this.bsdSetup();
                break;

            default:
                break;
        }
        // Set this after the VMs have been started. 
        this.ipv4 = proxmox.vm.VirtualMachine.get(`${this.fqdn}-ip-update`,
            this.cloudID, { nodeName: 'pve-main', },
            { provider: ProxmoxVM.getProvider(), dependsOn: this.commandsDependsOn })
            .ipv4Addresses[1][0];
        return this;
    };

    get providerConnection() {
        const proxmoxHostRegexMatches = config.require('proxmox_ve_endpoint')?.match(/http.*:\/\/(.*):/);
        const proxmoxHostname = proxmoxHostRegexMatches ? proxmoxHostRegexMatches[1] : '';

        let providerConnection = {
            host: proxmoxHostname,
            password: config.require('proxmox_ve_password'),
        };
        return providerConnection;
    }

    private static getProvider(): proxmox.Provider {
        // Have to use a provider to work around a nested config issue
        // https://www.pulumi.com/registry/packages/proxmoxve/installation-configuration/
        if (!ProxmoxVM.ProxmoxProvider) {
            ProxmoxVM.ProxmoxProvider = new proxmox.Provider('proxmoxve', {
                virtualEnvironment: {
                    endpoint: config.require('proxmox_ve_endpoint'),
                    insecure: true,
                    username: config.require('proxmox_ve_username'),
                    password: config.require('proxmox_ve_password')
                }
            }, {});
        }
        return ProxmoxVM.ProxmoxProvider;
    }

    opnSenseInstaller(): any[] {
        const image = new OpnSenseInstaller();
        const startVM = new remote.Command(`${this.fqdn}:startVm`, {
            connection: this.providerConnection,
            create: interpolate`
                wget -O /var/lib/vz/template/iso/${image.getName()}.iso.bz2 ${image.getImageURL()} 
                bunzip2 /var/lib/vz/template/iso/${image.getName()}.iso.bz2 
                mv /var/lib/vz/template/iso/${image.getName()}.img /var/lib/vz/template/iso/${image.getName()}.iso
                
                qm set ${this.cloudID} --ide1 local:iso/${this.image.getName()}.iso
                qm set ${this.cloudID} --boot order='scsi0;ide1'
                qm start ${this.cloudID}
                until qm status ${this.cloudID} | grep running; do 
                    sleep 1;
                done;
            `
        }, { dependsOn: this.commandsDependsOn, parent: this.instance });
        this.commandsDependsOn.push(startVM);

        const cleanupInit = new remote.Command(`${this.fqdn}:cleanupInit`, {
            connection: this.providerConnection,
            create: interpolate`
                qm set ${this.cloudID} --delete ide1;
                qm set ${this.cloudID} --delete ide2;
                qm set ${this.cloudID} --delete ide3;
                qm set ${this.cloudID} --agent 1;
                # Have to set it this way because it just doesn't work via pulumi... Pretty sure it's because of all the IDE drives.
                qm set ${this.cloudID} --machine q35;
            `
        }, { dependsOn: this.commandsDependsOn, parent: this.instance });
        this.commandsDependsOn.push(cleanupInit);

        return this.commandsDependsOn;
    }

    microosDesktopSetup(image: MicroOSDesktop): any[] {
        const startVM = new remote.Command(`${this.fqdn}:startVm`, {
            connection: this.providerConnection,
            create: interpolate`
                echo "$(curl ${image.getSha256URL()} | cut -f 1 -d ' ')  /var/lib/vz/template/iso/${image.getName()}.iso" \
                | sha256sum --check || \
                wget -O /var/lib/vz/template/iso/${image.getName()}.iso ${image.getImageURL()} 
                qm set ${this.cloudID} --ide1 local:iso/${this.image.getName()}.iso
                qm set ${this.cloudID} --boot order='scsi0;ide1'
                qm start ${this.cloudID}
                until qm status ${this.cloudID} | grep running; do 
                    sleep 1;
                done;
            `
        }, { dependsOn: this.commandsDependsOn });
        this.commandsDependsOn.push(startVM);

        const cleanupInit = new remote.Command(`${this.fqdn}:cleanupInit`, {
            connection: this.providerConnection,
            create: interpolate`
                qm set ${this.cloudID} --delete ide1;
                qm set ${this.cloudID} --delete ide2;
                qm set ${this.cloudID} --delete ide3;
                qm set ${this.cloudID} --agent 1;
                # Have to set it this way because it just doesn't work via pulumi... Pretty sure it's because of all the IDE drives.
                qm set ${this.cloudID} --machine q35;
            `
        }, { dependsOn: this.commandsDependsOn });
        this.commandsDependsOn.push(cleanupInit);

        return this.commandsDependsOn;
    }

    microosProxmoxSetup(): void {
        const image = new MicroOS();
        this.run('startVM', {
            connection: this.providerConnection,
            waitForReboot: true,
            create: interpolate`
                echo "$(curl ${image.getSha256URL()} | cut -f 1 -d ' ')  microos.qcow2" \
                | sha256sum --check || \
                wget -O ${image.getName()}.qcow2 ${image.getImageURL()} 
                qm importdisk ${this.cloudID} ${image.getName()}.qcow2 local-lvm
                qm set ${this.cloudID} --scsi0 local-lvm:vm-${this.cloudID}-disk-0
                qm resize ${this.cloudID} scsi0 +75G

                # Have to turn the VM on so that the guest-agent can be installed.
                qm start ${this.cloudID}
                until qm status ${this.cloudID} | grep running; do 
                    sleep 1;
                done; 

                echo "Pre sleep"
                sleep 60;
                echo "post sleep"
                qm shutdown ${this.cloudID}
                qm set ${this.cloudID} --agent 1

                qm wait ${this.cloudID}
                qm start ${this.cloudID}
            `
        });

        this.run('cleanupInit', {
            connection: this.providerConnection,
            create: interpolate`
                qm set ${this.cloudID} --delete ide2
                qm set ${this.cloudID} --delete ide3

                # Have to set it this way because it just doesn't work via pulumi.
                # Or the interface.I think it had something to do with all the IDE drives attached. 
                # Once I removed those, I think this worked ?
                qm set ${this.cloudID} --machine q35;
            `
        });
    }

    debianProxmoxSetup(): void {
        this.run('remove-cloud-init-drive', {
            connection: this.providerConnection,
            create: interpolate`
                qm stop ${this.cloudID};
                qm set ${this.cloudID} --ide2 none;
        `
        });
    }

    homeassistantProxmoxSetup(image: HomeAssistantOS): void {
        const proxmoxSetup = this.run(`startVM`, {
            connection: this.providerConnection,
            create: interpolate`
                sleep 2
                if [ ! -f ${image.name}.qcow2 ]; then
                    wget -O ${image.name}.qcow2.xz ${image.getImageURL()}
                    unxz -f ${image.name}.qcow2.xz
                fi 
                qm importdisk ${this.cloudID} ${image.name}.qcow2 local-lvm
                qm set ${this.cloudID} --scsi0 local-lvm:vm-${this.cloudID}-disk-0
                qm start ${this.cloudID}
                until qm status ${this.cloudID} | grep running; do 
                    sleep 1;
                done; 
                until ping -c 1 homeassistant; do 
                    sleep 5;
                done;
            `
        });
    }

    bsdSetup(): void {
        const proxmoxSetup = this.run(`startVM`, {
            connection: this.providerConnection,
            waitForReboot: true,
            create: interpolate`
                sleep 2
                if [ ! -f ${this.image.name}.qcow2 ]; then
                    wget -O ${this.image.name}.qcow2.xz ${this.image.getImageURL()}
                    unxz -f ${this.image.name}.qcow2.xz
                fi 
                qm importdisk ${this.cloudID} ${this.image.name}.qcow2 local-lvm
                qm set ${this.cloudID} --scsi0 local-lvm:vm-${this.cloudID}-disk-0
                qm resize ${this.cloudID} scsi0 +10G

                # Have to turn the VM on so that the guest-agent can be installed.
                qm start ${this.cloudID}
                until qm status ${this.cloudID} | grep running; do 
                    sleep 1;
                done; 

                echo "Pre sleep"
                sleep 60;
                echo "post sleep"
                qm shutdown ${this.cloudID}

                qm wait ${this.cloudID}
                qm set ${this.cloudID} --agent 1
                qm start ${this.cloudID}
                until qm status ${this.cloudID} | grep running; do 
                    sleep 1;
                done; 
            `
        });
    }
}
