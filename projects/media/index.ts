import { Config, interpolate, getStack } from "@pulumi/pulumi";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";
import { HomeAssistantOS } from "../../resources/images/homeassistant";

const config = new Config();


const mediaHA = VirtualMachineFactory.createVM(`media-ha`, {
    cloud: config.get('vmCloud') ?? 'proxmox',
    size: 'Medium',
    image: new HomeAssistantOS(),
    dnsProvider: 'cloudflare',
    childSubdomains: ['proxy', 'nginx', 'backups'],
    siblingSubdomains: [
        'watch', 'jellyfin',
        'shows', 'sonarr',
        'movies', 'radarr',
        'music', 'lidarr',
        'books', 'readarr',
        'torrent', 'transmission', 'torrent-redirect',
        'trackers', 'jackett', 'prowlarr',
        'transcoding', 'tdarr',
    ],
}, {});
if (getStack() === 'main') {
    mediaHA.run(`passThroughDevices`, {
        connection: mediaHA.providerConnection,
        waitForReboot: true,
        create: interpolate`
            qm set ${mediaHA.cloudID} -usb0 host=174c:55aa,usb3=1

            # Restart the VM to apply these configs.
            qm shutdown ${mediaHA.cloudID}&
            qm wait ${mediaHA.cloudID}
            qm start ${mediaHA.cloudID}
        `
    });
}
