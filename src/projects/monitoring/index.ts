import { Config, } from "@pulumi/pulumi";
import { remote, } from "@pulumi/command";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";

const config = new Config();

const monitoringVM = VirtualMachineFactory.createVM(`monitoring`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new MicroOS(),
    installDocker: true,
    dnsProvider: 'cloudflare',
    //childSubdomains: ['proxy', 'nginx'],
    siblingSubdomains: [
        'alerts',
        'metrics', 'prometheus',
        'graphs', 'grafana',
        'logs', 'loki',
    ]
}, {});
