import { remote, local, types } from "@pulumi/command";
import { interpolate } from "@pulumi/pulumi";
import { BaseVMImage } from './';
import { VirtualMachine } from "../providers";

export class MicroOS extends BaseVMImage {
    constructor() {
        super('microos', 'https://download.opensuse.org/tumbleweed/appliances/openSUSE-MicroOS.x86_64-OpenStack-Cloud.qcow2');
        this.initUser = 'root';
    }

    initVM(commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        const waitForInitialConnection = new local.Command(`${vm.fqdn}:waitForInitialConnection`, {
            create: interpolate`
                until ping -c 1 ${vm.fqdn}; do 
                    sleep 5;
                done; 
            `
        }, { dependsOn: vm.commandsDependsOn });
        vm.commandsDependsOn.push(waitForInitialConnection);

        const secureVM = new remote.Command(`${vm.fqdn}:secureVM`, {

            connection: connection,
            create: interpolate`
                sudo transactional-update run bash -c 'systemctl enable qemu-guest-agent ; 
                    sed -i "s/^\(Defaults targetpw\)/# \1/" /etc/sudoers ; \
                    sed -i "s/^\(ALL\s\+ALL=(ALL)\s\+ALL\)/# \1/" /etc/sudoers; ; \
                    sed -i "s/# \(%wheel\s\+ALL=(ALL:ALL)\s\+NOPASSWD:\s\+ALL\)/\1/" /etc/sudoers ; \
                '
                sudo reboot
            `
        }, { dependsOn: commandsDependsOn });

        return [secureVM];
    }

    finalize(commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs, adminUser: string): any[] {

        return commandsDependsOn;
    }

    installDocker(commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs): any[] {
            connection,
            create: `
                transactional-update pkg in -y docker docker-compose 
                reboot&
                exit
            `
        }, { dependsOn: commandsDependsOn });
        commandsDependsOn.push(installDockerAndGuestAgent);

        const enableDocker = new remote.Command("Enable docker", {
            connection,
            create: `
                systemctl enable --now docker
                #reboot&
                exit
            `
        }, { dependsOn: commandsDependsOn });
        commandsDependsOn.push(enableDocker);

        return commandsDependsOn;
    }
}

export class MicroOSDesktop extends BaseVMImage {
    constructor() {
        super('microos-dvd', 'https://download.opensuse.org/tumbleweed/iso/openSUSE-MicroOS-DVD-x86_64-Current.iso');
    }

    finalize(commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs, adminUser: string): any[] {

        return commandsDependsOn;
    }

    installDocker(commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs): any[] {
        return commandsDependsOn;
    }
}