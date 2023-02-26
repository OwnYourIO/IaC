import { Config, } from "@pulumi/pulumi";
import { remote, } from "@pulumi/command";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";

const config = new Config();

const routerVM = VirtualMachineFactory.createVM(`router`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new MicroOS(),
    installDocker: true,
    dnsProvider: 'cloudflare',
    additionalSubdomains: [
        'opnsense',
    ]
}, {});
