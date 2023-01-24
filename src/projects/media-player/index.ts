import { Config, getStack, interpolate, log, } from "@pulumi/pulumi";
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

const installMediaPlayerDependencies = new remote.Command(`${mediaPlayer.fqdn}:installMediaPlayerDependencies`, {
    connection: mediaPlayer.vmConnection,
    create: interpolate`
        sudo transactional-update run bash -c '
            zypper addrepo --refresh https://download.nvidia.com/opensuse/tumbleweed NVIDIA
            zypper install nvidia-glG06 x11-video-nvidiaG06 tilix nautilus-extension-tilix
        '
        sudo reboot
    `
}, { dependsOn: mediaPlayer.commandsDependsOn });
mediaPlayer.commandsDependsOn.push(installMediaPlayerDependencies);

const configureUser = new remote.Command(`${mediaPlayer.fqdn}:configureUser`, {
    connection: mediaPlayer.vmConnection,
    create: interpolate`
        sudo transactional-update run bash -c '
            sed -i "s/DISPLAYMANAGER_AUTOLOGIN=\"\"/DISPLAYMANAGER_AUTOLOGIN=\"${mediaPlayer.adminUser}\"/" /etc/sysconfig/displaymanager
            sed -i "s/DISPLAYMANAGER_PASSWORD_LESS_LOGIN=\"no\"/DISPLAYMANAGER_PASSWORD_LESS_LOGIN=\"yes\"/" /etc/sysconfig/displaymanager 
        '
        flatpak install -y flathub org.freedesktop.Platform.ffmpeg-full/x86_64/22.08 \
            com.valvesoftware.Steam \
            io.github.arunsivaramanneo.GPUViewer
        gsettings set org.gnome.desktop.session idle-delay 0
        sudo reboot
    `
}, { dependsOn: mediaPlayer.commandsDependsOn });
mediaPlayer.commandsDependsOn.push(configureUser);

export const mediaPlayerIPv4 = mediaPlayer.ipv4;
export const mediaPlayerFQDN = mediaPlayer.fqdn;
