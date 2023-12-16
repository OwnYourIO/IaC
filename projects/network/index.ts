import { Config, } from "@pulumi/pulumi";
import { remote, } from "@pulumi/command";
import { OpnSenseInstaller } from '../../resources/images/bsd';
import { VirtualMachineFactory } from "../../resources";

const config = new Config();

const routerVM = VirtualMachineFactory.createVM(`router`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new OpnSenseInstaller(),
    //dnsProvider: 'cloudflare',
    //childSubdomains: [],

    siblingSubdomains: [
        'opnsense',
    ]
}, {});
// Need to do the following manual steps:
// pkg install py39-cloud-init
// echo "cloudinit_enable=\"YES\"" >> /etc/rc.conf
// echo "sshd_enable=\"YES\"" >> /etc/rc.conf
// sudo reboot
