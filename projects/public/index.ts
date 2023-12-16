import { Config, } from "@pulumi/pulumi";
import { remote, } from "@pulumi/command";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";
import { HomeAssistantOS } from "../../resources/images/homeassistant";

const config = new Config();

const mediaProxyVM = VirtualMachineFactory.createVM(`media-proxy`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new MicroOS(),
    installDocker: true,
    dnsProvider: 'cloudflare',
}, {});

const publicVM = VirtualMachineFactory.createVM(`public`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new MicroOS(),
    installDocker: true,
    dnsProvider: 'cloudflare',
}, {});
