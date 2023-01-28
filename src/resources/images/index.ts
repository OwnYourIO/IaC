import { remote, types } from "@pulumi/command";
import { Input } from "@pulumi/pulumi";
import { VirtualMachine } from "../providers";

export abstract class BaseVMImage {
    // TODO: It's either ts-ignore or a constructor setting bogus attributes.
    //@ts-ignore
    name: string;
    //@ts-ignore
    imageURL: string;
    guestAgent: boolean = false;
    initUser: string | undefined;
    initHostname: string = 'localhost';

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

    abstract finalize(connection: Input<types.input.remote.ConnectionArgs>, vm: VirtualMachine): any[];

    abstract installDocker(connection: Input<types.input.remote.ConnectionArgs>, vm: VirtualMachine): any[];
}
