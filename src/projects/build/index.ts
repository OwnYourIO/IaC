import { Config, } from "@pulumi/pulumi";
import { remote, } from "@pulumi/command";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";

const config = new Config();

const buildVM = VirtualMachineFactory.createVM(`build`, {
    cloud: 'proxmox',
    size: 'Small',
    image: new MicroOS(),
    installDocker: true,
    dnsProvider: 'cloudflare',
    additionalSubdomains: ['build',
        'artifacts', 'artifactory',
        'cicd', 'drone',
        'git', 'forgejo',
    ],
}, {});
