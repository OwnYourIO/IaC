import { remote, types } from "@pulumi/command";

import {
    interpolate,
} from "@pulumi/pulumi";

import { BaseVMImage } from '.';
import { VirtualMachine } from "../providers";

export class Debian11 extends BaseVMImage {
    constructor() {
        super();
        this.imageURL = 'https://cdimage.debian.org/images/cloud/bullseye/latest/debian-12-genericcloud-amd64.qcow2';
        this.name = 'debian11';
        this.initUser = 'root';
        this.initHostname = 'debian.local';
    }


    finalize(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        const installGuestAgent = new remote.Command("Install guest-agent", {
            connection,
            create: interpolate`
                export DEBIAN_FRONTEND=noninteractive; 
                sudo apt-get update;
                sudo apt-get upgrade -y;
                sudo apt-get install -y qemu-guest-agent;
                sudo systemctl enable --now qemu-guest-agent;
            `
        }, { dependsOn: vm.commandsDependsOn });
        vm.commandsDependsOn.push(installGuestAgent);

        return vm.commandsDependsOn;
    }

    installDocker(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        const installDockerAndGuestAgent = new remote.Command("Install docker", {
            connection,
            create: interpolate`
                export DEBIAN_FRONTEND=noninteractive; 
                sudo apt-get update;
                sudo apt-get upgrade -y;
                sudo apt install curl wget git -y;
                curl -fsSL https://get.docker.com | sudo sh;
                sudo apt-get install -y docker-compose;
                sudo systemctl enable --now docker;
            `
        }, { dependsOn: vm.commandsDependsOn });
        vm.commandsDependsOn.push(installDockerAndGuestAgent);

        return vm.commandsDependsOn;
    }
}
