import { Config, getStack, log, } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { MicroOSDesktop } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";

const config = new Config();
const domain = config.require('domain');

const hostname = config.get('media-player-hostname') ?? 'media-player';
const mediaPlayer = VirtualMachineFactory.createVM('media-player-vm', {
    hostname: `${hostname}-${getStack()}`,
    domain,
    cloud: 'proxmox',
    size: 'Small',
    image: new MicroOSDesktop(),
}, {
});

export const mediaPlayerIPv4 = mediaPlayer.ipv4;
export const mediaPlayerFQDN = mediaPlayer.fqdn;
