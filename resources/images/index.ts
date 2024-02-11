import { remote, types } from "@pulumi/command";
import { Input, Output, interpolate } from "@pulumi/pulumi";
import { VirtualMachine } from "../providers";

export abstract class BaseVMImage {
    // TODO: It's either ts-ignore or a constructor setting bogus attributes.
    //@ts-ignore
    name: string;
    //@ts-ignore
    imageURL: string;
    guestAgent: boolean = false;
    initUser: string | undefined;
    // TODO: It may make more sense to throw an error if this isn't implemented?
    // Or at least do | undefined?
    initHostname: string = 'localhost';

    sudo(password: Output<string> | string): Output<string> {
        return interpolate` echo '${password}' | sudo -S `;
    }

    getName() {
        return this.name;
    }

    getImageURL() {
        return this.imageURL;
    }

    getSha256URL() {
        return `${this.imageURL}.sha256`;
    }

    getInitUser() {
        return this.initUser;
    }

    // Most VMs will go through a cloud-init process,
    // but some won't and will override this function to
    // configure the VM so that adminUser can login via the fqdn.
    initVM(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        return [];
    }

    abstract updateRepo: string;
    abstract install: string;

    // Some images won't need to do anything, so that should be the default.
    installQemuGuestAgent(vm: VirtualMachine): void { }
    abstract finalize(vm: VirtualMachine): any[];
    abstract installDocker(connection: Input<types.input.remote.ConnectionArgs>, vm: VirtualMachine): any[];
}
