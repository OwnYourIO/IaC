import { Config, } from "@pulumi/pulumi";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";
import { HomeAssistantOS } from "../../resources/images/homeassistant";

const config = new Config();


const mediaHA = VirtualMachineFactory.createVM(`mediaHA`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new HomeAssistantOS(),
    dnsProvider: 'cloudflare',
    additionalSubdomains: [
        'watch', 'jellyfin',
        'shows', 'sonarr',
        'movies', 'redarr',
        'music', 'lidarr',
        'books', 'readarr',
        'torrent', 'transmission', 'torrent-redirect',
        'trackers', 'jackett', 'prowlarr',
        'transcoding', 'tdarr',
        'media-backups',
    ],
}, {});
