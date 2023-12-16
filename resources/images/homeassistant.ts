import { types } from "@pulumi/command";

import { BaseVMImage } from './';
import { VirtualMachine } from "../providers";

export class HomeAssistantOS extends BaseVMImage {
    install = ``;
    updateRepo = ``;

    constructor() {
        super();
        this.name = 'homeassistant';
        // Would be nice to do something like: $(curl -s https://raw.githubusercontent.com/home-assistant/version/master/stable.json | grep "ova" | awk '{print substr($2, 2, length($2)-3) }')
        const version = '9.5'
        this.imageURL = `https://github.com/home-assistant/operating-system/releases/download/${version}/haos_ova-${version}.qcow2.xz`;
        this.initUser = 'root';
        this.initHostname = 'homeassistant';
        this.guestAgent = true;
    }

    finalize(vm: VirtualMachine): any[] {
        // Nothing to do for HomeAssistant.
        return vm.commandsDependsOn;
    }

    installDocker(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        // Nothing to do for HomeAssistant.
        return vm.commandsDependsOn;
    }
}
