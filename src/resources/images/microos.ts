import { remote, types } from "@pulumi/command";
import { BaseVMImage } from './';

export class MicroOS extends BaseVMImage {
    constructor() {
        super('microos', 'https://download.opensuse.org/tumbleweed/appliances/openSUSE-MicroOS.x86_64-OpenStack-Cloud.qcow2');
        this.initUser = 'root';
    }

    finalize(commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs, adminUser: string): any[] {

        return commandsDependsOn;
    }

    installDocker(commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs): any[] {
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