import { Config, getStack, interpolate, log, } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { MicroOS } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";

const config = new Config();
const domain = config.require('domain');

const mediaPlayer = VirtualMachineFactory.createVM('media-player', {
    cloud: config.get('vmCloud') ?? 'proxmox',
    size: 'Large',
    image: new MicroOS(),
    dnsProvider: 'cloudflare',
}, {});

mediaPlayer.run('installDesktop', {
    connection: mediaPlayer.vmConnection,
    waitForReboot: true,
    create: interpolate`
        ${mediaPlayer.sudo} transactional-update run bash -c '
            zypper -n install -t pattern \
                gnome_x11 \
                microos_gnome_desktop \
                microos_selinux \
                games
            zypper -n install \
                kernel-firmware-sound \
                tilix nautilus-extension-tilix
            systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
            systemctl set-default graphical.target
            exit
        '
        #${mediaPlayer.sudo} flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
        ${mediaPlayer.sudo} reboot&
        exit
    `
});

mediaPlayer.run(`configureUserspace`, {
    connection: mediaPlayer.vmConnection,
    waitForReboot: true,
    create: interpolate`
        ${mediaPlayer.sudo} transactional-update run bash -c '
            sed -i "s/DISPLAYMANAGER_AUTOLOGIN=.*\\"/DISPLAYMANAGER_AUTOLOGIN=\\"${mediaPlayer.adminUser}\\"/" /etc/sysconfig/displaymanager
            sed -i "s/DISPLAYMANAGER_PASSWORD_LESS_LOGIN=\\"no\\"/DISPLAYMANAGER_PASSWORD_LESS_LOGIN=\\"yes\\"/" /etc/sysconfig/displaymanager 
            # TODO: I don't think this is working.
            sed -i "s/#WaylandEnable=false/WaylandEnable=false/" /etc/gdm/custom.conf 
        '
        flatpak --user remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
        flatpak --user install -y org.mozilla.firefox \
            org.freedesktop.Platform.ffmpeg-full/x86_64/22.08 \
            com.valvesoftware.Steam \
            org.freedesktop.Platform.GL.nvidia-525-85-05  \
            org.freedesktop.Platform.GL32.nvidia-525-85-05  \
            io.github.arunsivaramanneo.GPUViewer \
            org.flameshot.Flameshot \
            org.gnome.Extensions \
            io.github.Pithos
        
        gsettings set org.gnome.desktop.session idle-delay 0
        gsettings set org.gnome.desktop.input-sources sources "[('xkb', 'us+dvorak'),('xkb', 'us')]"
        gsettings set org.gnome.desktop.input-sources sources "[('xkb', 'us+dvorak'),('xkb', 'us')]"
        gsettings set org.gnome.desktop.input-sources xkb-options "['terminate:ctrl_alt_bksp', 'caps:escape', 'lv3:ralt_switch', 'grp:rctrl_rshift_toggle']"
        gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
        gsettings set org.gnome.desktop.interface gtk-theme 'Adwaita-dark'
        gsettings set org.gnome.desktop.interface clock-format 12h
        gsettings set org.gnome.desktop.wm.keybindings switch-applications "[]"
        gsettings set org.gnome.desktop.wm.keybindings switch-applications-backward "[]"
        gsettings set org.gnome.desktop.wm.keybindings switch-windows "['<Alt>Tab']"
        gsettings set org.gnome.desktop.wm.keybindings switch-windows-backward "['<Shift><Alt>Tab']"

        # Shortcuts to restart gnome, bluetooth, networking, and audio.
        gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "['/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/', '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/', '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom2/', '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom3/', '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom4/']"
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/ binding '<Control><Alt>r'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/ command 'killall -3 gnome-shell'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/ name 'Restart Gnome'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/ binding '<Primary><Alt>b'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/ command 'systemctl restart bluetooth'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/ name 'Restart Bluetooth'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom2/ binding '<Primary><Alt>a'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom2/ command 'systemctl --user restart pipewire'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom2/ name 'Restart Audio'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom3/ binding '<Primary><Alt>n'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom3/ command 'systemctl restart NetworkManager'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom3/ name 'Restart NetworkManager'

        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom4/ binding 'Print'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom4/ command 'flatpak run org.flameshot.Flameshot gui'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom4/ name 'Flameshot'

        mkdir -p ~/.config/autostart/
        cp ~/.local/share/flatpak/exports/share/applications/org.mozilla.firefox.desktop ~/.config/autostart/
        #cp /usr/share/applications/com.gexperts.Tilix.desktop ~/.config/autostart/
        
        ${mediaPlayer.sudo} reboot&
        exit
    `
    // TODO: Timezone
    // Some kind of home assistant connection for muting/playing/pausing
    //      Use ssh into the media player to send play/unmute pause/mute
    //      But you know the answer is that damn mqtt service.
    // Install VNC/Some kind of desktop sharing, 
});

if (getStack() === 'main') {
    mediaPlayer.run(`passThroughDevices`, {
        connection: mediaPlayer.providerConnection,
        waitForReboot: true,
        create: interpolate`
            # NVIDIA
            qm set ${mediaPlayer.cloudID} -hostpci0 01:00
            qm set ${mediaPlayer.cloudID} --vga none;

            # Wifi (Bluetooth - controller)
            qm set ${mediaPlayer.cloudID} -hostpci1 70:00
            qm set ${mediaPlayer.cloudID} -usb1 host=8087:0029


            # USB logitek (Keyboard)
            qm set ${mediaPlayer.cloudID} -usb0 host=046d:c52b,usb3=1

            # Restart the VM to apply these configs.
            qm shutdown ${mediaPlayer.cloudID}&
            qm wait ${mediaPlayer.cloudID}
            qm start ${mediaPlayer.cloudID}
        `
    });
    mediaPlayer.run('installDrivers', {
        connection: mediaPlayer.vmConnection,
        waitForReboot: true,
        create: interpolate`
            ${mediaPlayer.sudo} transactional-update run bash -c ' zypper addrepo --refresh https://download.nvidia.com/opensuse/tumbleweed NVIDIA; 
                zypper --gpg-auto-import-keys ref;
                zypper -n install --auto-agree-with-licenses \
                    nvidia-glG06 nvidia-video-G06 nvidia-driver-G06-kmp-default kernel-firmware-nvidia-gsp-G06 \
                    kernel-firmware-iwlwifi kernel-firmware-bluetooth
                exit
            '
            ${mediaPlayer.sudo} reboot&
            exit
        `
    });
}

export const mediaPlayerIPv4 = mediaPlayer.ipv4;
export const mediaPlayerFQDN = mediaPlayer.fqdn;

// Final manual steps:

// Install Gnome Extensions
// TODO: Better program this. There just isn't a great way to get the latest/current version :/
// appindicatorsupport@rgcjonas.gmail.com  
// bluetooth-quick-connect@bjarosze.gmail.com 
// openweather-extension@jenslody.de
// bluetooth-battery@michalw.github.com 
// noannoyance@sindex.com 

// Install Mullvad
// TODO: Could do this better but I can't select a solution programmatically.
//      Everyone says to use rpm -i --nodeps but that doesn't play nice with transactional-update >_<
//  sudo transactional-update
// Then run 
//    wget -O mullvad.rpm --content-disposition https://mullvad.net/download/app/rpm/latest
//    zypper install -y mullvad.rpm
//    rm mullvad.rpm

// TODO: These feel like a backup that could be restored.
// Adjust resolution
// Login to Firefox Account
// Login to Pithos
// Login to Mullvad
// Login to Steam
// Pair remote control
// Set weather location
