import { remote, local, types } from "@pulumi/command";
import { interpolate } from "@pulumi/pulumi";
import { BaseVMImage } from './';
import { VirtualMachine } from "../providers";

export class MicroOS extends BaseVMImage {
    constructor() {
        super();
        this.name = 'microos';
        this.imageURL = 'https://download.opensuse.org/tumbleweed/appliances/openSUSE-MicroOS.x86_64-OpenStack-Cloud.qcow2';
        this.initUser = 'root';
    }

    initVM(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        const waitForInitialConnection = new local.Command(`${vm.fqdn}:waitForInitialConnection`, {
            create: interpolate`
                until ping -c 1 ${vm.fqdn}; do 
                    sleep 5;
                done; 
            `
        }, { dependsOn: vm.commandsDependsOn });
        vm.commandsDependsOn.push(waitForInitialConnection);

        const secureVM = new remote.Command(`${vm.fqdn}:secureVM`, {
            connection: vm.initConnection,
            create: interpolate`${this.sudo(vm.adminPassword)} transactional-update run bash -c 'zypper install -y qemu-guest-agent system-group-wheel; 
                systemctl enable qemu-guest-agent;
                sed -i "s/^\\(Defaults targetpw\\)/# \\1/" /etc/sudoers ; 
                sed -i "s/^\\(ALL\\s\\+ALL=(ALL)\\s\\+ALL\\)/# \\1/" /etc/sudoers; 
                sed -i "s/# \\(.wheel\\s\\+ALL=(ALL:ALL)\\s\\+NOPASSWD:\\s\\+ALL\\)/\\1/" /etc/sudoers ; 
                '
                ${this.sudo(vm.adminPassword)} reboot&
                exit`
        }, { dependsOn: vm.commandsDependsOn });

        return [secureVM];
    }

    finalize(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {

        return vm.commandsDependsOn;
    }

    installDocker(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        const installDockerAndGuestAgent = new remote.Command(`${vm.fqdn}-install-docker`, {
            connection,
            create: `${this.sudo(vm.adminPassword)} transactional-update run bash -c 'zypper install -y docker docker-compose; 
                    systemctl enable --now docker
                '
                ${this.sudo(vm.adminPassword)} reboot&
                exit
            `
        }, { dependsOn: vm.commandsDependsOn });
        vm.commandsDependsOn.push(installDockerAndGuestAgent);

        return vm.commandsDependsOn;
    }
}

export class MicroOSDesktop extends MicroOS {
    constructor() {
        super();
        this.name = 'microos-dvd';
        this.imageURL = 'https://download.opensuse.org/tumbleweed/iso/openSUSE-MicroOS-DVD-x86_64-Current.iso';
    }

}
