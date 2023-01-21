import { remote, types } from "@pulumi/command";
import { BaseVMImage } from './';

export class MicroOS extends BaseVMImage {
    constructor() {
        super('microos', 'https://download.opensuse.org/tumbleweed/appliances/openSUSE-MicroOS.x86_64-OpenStack-Cloud.qcow2');
        this.initUser = 'root';
    }

}