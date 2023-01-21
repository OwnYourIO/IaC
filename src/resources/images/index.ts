import { remote, types } from "@pulumi/command";

export abstract class BaseVMImage {
    name: string;
    imageURL: string;
    predefinedHostname: string | undefined;
    guestAgent: boolean = false;
    initUser: string | undefined;
    constructor(name: string, imageURL: string) {
        this.name = name;
        this.imageURL = imageURL;
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

    abstract finalize(commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs, adminUser: string): any[];

    abstract installDocker(commandsDependsOn: any[], connection: types.input.remote.ConnectionArgs): any[];

}