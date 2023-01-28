import { remote, local, types } from "@pulumi/command";
import * as proxmox from "@muhlba91/pulumi-proxmoxve";

import { Config, log, concat, interpolate, Input, Output, StackReference, getStack, } from "@pulumi/pulumi";

import { VirtualMachine, VirtualMachineArgs, } from "..";
import { MicroOS, MicroOSDesktop } from '../../images/microos';
import { Debian11 } from '../../images/debian11';
import { HomeAssistantOS } from '../../images/homeassistant';

const config = new Config();

export class ProxmoxVM extends VirtualMachine {
    private static ProxmoxProvider: proxmox.Provider | undefined;

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
                memory: 512,
                type: 'virtio',
            },
            agent: {
                enabled: false,
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
                userAccount: {
                    username: this.image.initUser ?? this.adminUser,
                    password: this.adminPassword,
                    keys: [this.publicKey],
                }
            },
            // This is needed for at least MicroOS. Maybe others?
            cdrom: { enabled: true },
            networkDevices: [
                {
                    bridge: 'vmbr0',
                    model: 'virtio',
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

        let preConditions = [ProxmoxVM.getProvider()];
        const proxmoxServer = new proxmox.vm.VirtualMachine(`${this.hostname}`, {
            ...vmSettings,
        }, {
            provider: ProxmoxVM.getProvider(),
            dependsOn: preConditions,
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
        });
        this.commandsDependsOn.push(proxmoxServer);

        this.ipv4 = proxmoxServer.ipv4Addresses[1][0];
        this.ipv6 = proxmoxServer.ipv6Addresses[1][0];
        this.cloudID = proxmoxServer.id;
        switch (this.image.name) {
            case 'microos':
                this.microosProxmoxSetup(this.image);
                break;
            case 'microos-dvd':
                this.microosDesktopSetup(this.image);
                break;
            case 'debain11':
                this.debian11ProxmoxSetup(this.image);
                break;
            case 'homeassistant':
                this.homeassistantProxmoxSetup(this.image);
                break;

            default:
                break;
        }
        return this;
    };

    get proxmoxConnection() {
        const proxmoxHostRegexMatches = config.require('proxmox_ve_endpoint')?.match(/http.*:\/\/(.*):/);
        const proxmoxHostname = proxmoxHostRegexMatches ? proxmoxHostRegexMatches[1] : '';

        let proxmoxConnection = {
            host: proxmoxHostname,
        };
        return proxmoxConnection;
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

    microosDesktopSetup(image: MicroOSDesktop): any[] {
        const setupVM = new remote.Command(`${this.fqdn}:setupVm`, {
            connection: this.proxmoxConnection,
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
        this.commandsDependsOn.push(setupVM);

        const finalizeVM = new remote.Command(`${this.fqdn}:finalizeVM`, {
            connection: this.proxmoxConnection,
            create: interpolate`
                qm set ${this.cloudID} --ide2 none;
                qm set ${this.cloudID} --ide3 none;
                qm set ${this.cloudID} --agent 1;
                # Have to set it this way because it just doesn't work via pulumi... Pretty sure it's because of all the IDE drives.
                qm set ${this.cloudID} --machine q35;
            `
        }, { dependsOn: this.commandsDependsOn });
        this.commandsDependsOn.push(finalizeVM);

        return this.commandsDependsOn;
    }

    microosProxmoxSetup(image: MicroOS): any[] {
        const setupVM = new remote.Command(`${this.fqdn}:setup-vm`, {
            connection: this.proxmoxConnection,
            create: interpolate`
                echo "$(curl ${image.getSha256URL()} | cut -f 1 -d ' ')  microos.qcow2" \
                | sha256sum --check || \
                wget -O ${image.getName()}.qcow2 ${image.getImageURL()} 
                which expect || apt install -y expect
                qm importdisk ${this.cloudID} ${image.getName()}.qcow2 local-lvm
                qm set ${this.cloudID} --scsi0 local-lvm:vm-${this.cloudID}-disk-1

                # Have to turn the VM on so that the guest - agent can be installed.
                qm start ${this.cloudID}
                until qm status ${this.cloudID} | grep running; do 
                    sleep 1;
                done; 

                echo "Pre sleep"
                sleep 60;
                echo "post sleep"
                qm shutdown ${this.cloudID}

                qm wait ${this.cloudID}
                qm start ${this.cloudID}
                until ping -c 1 ${this.hostname}; do 
                    sleep 5;
                done; 
            `
        }, { dependsOn: this.commandsDependsOn });
        this.commandsDependsOn.push(setupVM);

        const finalizeVM = new remote.Command(`${this.fqdn}:finalizeVM`, {
            connection: this.proxmoxConnection,
            create: interpolate`
                qm set ${this.cloudID} --ide2 none;
                qm set ${this.cloudID} --ide3 none;
                qm set ${this.cloudID} --agent 1;

                # Have to set it this way because it just doesn't work via pulumi.
                # Or the interface. I think it had something to do with all the IDE drives attached. 
                # Once I removed those, I think this worked?
                qm set ${this.cloudID} --machine q35;
                qm set ${this.cloudID} --vga none;
            `
        }, { dependsOn: this.commandsDependsOn });
        this.commandsDependsOn.push(finalizeVM);

        return this.commandsDependsOn;
    }

    debian11ProxmoxSetup(image: Debian11): any[] {
        const proxmoxSetup = new remote.Command("Remove cloudinit drive", {
            connection: this.proxmoxConnection,
            create: interpolate`
                qm stop ${this.cloudID};
                qm set ${this.cloudID} --ide2 none;
            `
        }, { dependsOn: this.commandsDependsOn });
        this.commandsDependsOn.push(proxmoxSetup);

        return this.commandsDependsOn;
    }

    homeassistantProxmoxSetup(image: HomeAssistantOS): any[] {
        const proxmoxSetup = new remote.Command("Remove cloudinit drive", {
            connection: this.proxmoxConnection,
            create: interpolate`
                qm wait ${this.cloudID}
                qm start ${this.cloudID}
                until ping -c 1 ${this.hostname}; do 
                    sleep 5;
                done; 
            `
        }, { dependsOn: this.commandsDependsOn });
        this.commandsDependsOn.push(proxmoxSetup);

        return this.commandsDependsOn;
    }
}
