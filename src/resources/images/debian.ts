import { types } from "@pulumi/command";

import {
    interpolate,
} from "@pulumi/pulumi";

import { BaseVMImage } from '.';
import { VirtualMachine } from "../providers";

export class Debian extends BaseVMImage {
    install = ` DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=120 install -y `;
    updateRepo = ` DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=120 update `;
    constructor() {
        super();
        this.initUser = 'root';
        this.initHostname = 'debian.local';
    }


    finalize(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        return vm.commandsDependsOn;
    }

    installQemuGuestAgent(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): void {
        vm.run('install-qemu-guest-agent', {
            create: interpolate`
                ${vm.sudo} ${vm.updateRepo}
                ${vm.sudo} ${vm.install} qemu-guest-agent
                ${vm.sudo} systemctl enable --now qemu-guest-agent
            `
        });
    }

    installDocker(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        vm.run(`install-docker`, {
            create: interpolate`
                ${vm.sudo} ${this.updateRepo}
                #${vm.sudo} apt-get upgrade -y;
                ${vm.sudo} ${this.install} curl wget git;
                curl -fsSL https://get.docker.com | sh;
                ${vm.sudo} ${this.install} docker-compose apparmor-utils;
                ${vm.sudo} systemctl enable --now docker;
                
                # Seems like this shouldn't be needed, but it is.
                ${vm.sudo} ${this.install} apparmor --reinstall
                service apparmor restart
                service docker restart
            `
        });

        return vm.commandsDependsOn;
    }
}

export class Debian12 extends Debian {
    constructor() {
        super();
        this.imageURL = 'https://cdimage.debian.org/images/cloud/bullseye/latest/debian-12-genericcloud-amd64.qcow2';
        this.name = 'debian-12';
    }
}

export class Debian11 extends Debian {
    constructor() {
        super();
        this.imageURL = 'https://cdimage.debian.org/images/cloud/bullseye/latest/debian-11-genericcloud-amd64.qcow2';
        this.name = 'debian-11';
    }
}
