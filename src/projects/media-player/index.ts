import { Config, getStack, interpolate, log, } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { MicroOSDesktop } from '../../resources/images/microos';
import { VirtualMachineFactory } from "../../resources";

const config = new Config();
const domain = config.require('domain');

const hostname = config.get('media-player-hostname') ?? 'media-player';
const mediaPlayer = VirtualMachineFactory.createVM('media-player', {
    domain,
    cloud: 'proxmox',
    size: 'Large',
    image: new MicroOSDesktop(),
}, {
});

const installMediaPlayerDependencies = new remote.Command(`${mediaPlayer.fqdn}:installMediaPlayerDependencies`, {
    connection: mediaPlayer.vmConnection,
    create: interpolate`
        ${mediaPlayer.sudo} transactional-update run bash -c ' zypper addrepo --refresh https://download.nvidia.com/opensuse/tumbleweed NVIDIA; 
            zypper --gpg-auto-import-keys ref;
            zypper -n install --auto-agree-with-licenses \
                nvidia-glG05 x11-video-nvidiaG05 nvidia-driver-G06-kmp-default \
                kernel-firmware-iwlwifi kernel-firmware-bluetooth \
                tilix nautilus-extension-tilix
            systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
            exit
        '
        ${mediaPlayer.sudo} reboot&
        exit
    `
}, { dependsOn: mediaPlayer.commandsDependsOn });
mediaPlayer.commandsDependsOn.push(installMediaPlayerDependencies);

mediaPlayer.waitForConnection();

const configureUser = new remote.Command(`${mediaPlayer.fqdn}:configureUser`, {
    connection: mediaPlayer.vmConnection,
    create: interpolate`
        ${mediaPlayer.sudo}transactional-update run bash -c '
            sed -i "s/DISPLAYMANAGER_AUTOLOGIN=.*\\"/DISPLAYMANAGER_AUTOLOGIN=\\"${mediaPlayer.adminUser}\\"/" /etc/sysconfig/displaymanager
            sed -i "s/DISPLAYMANAGER_PASSWORD_LESS_LOGIN=\\"no\\"/DISPLAYMANAGER_PASSWORD_LESS_LOGIN=\\"yes\\"/" /etc/sysconfig/displaymanager 
        '
        flatpak install -y flathub org.freedesktop.Platform.ffmpeg-full/x86_64/22.08 \
            com.valvesoftware.Steam \
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
        
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/ binding '<Control><Alt>r'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/ command 'killall -3 gnome-shell'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/ name 'Restart Gnome'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/ binding '<Primary><Alt>b'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/ command 'systemctl restart bluetooth'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/ name 'Restart Bluetooth'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom2/ binding '<Primary><Alt>a'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom2/ command 'systemctl --user restart pipewire'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom2/ name 'Restart Audio'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-custom3 binding '<Primary><Alt>n'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-custom3 command 'systemctl restart NetworkManager'
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-custom3 name 'Restart NetworkManager'

        
        cp ~/.local/share/flatpak/exports/share/applications/org.mozilla.firefox.desktop ~/.config/autostart/
        
        ${mediaPlayer.sudo} reboot&
        exit
    `
}, { dependsOn: mediaPlayer.commandsDependsOn });
mediaPlayer.commandsDependsOn.push(configureUser);

mediaPlayer.waitForConnection();

if (getStack() === 'main') {
    const passThroughDevices = new remote.Command(`${mediaPlayer.fqdn}:passThroughDevices`, {
        connection: mediaPlayer.providerConnection,
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
    }, { dependsOn: mediaPlayer.commandsDependsOn });
    mediaPlayer.commandsDependsOn.push(passThroughDevices);
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

// Login to Firefox Account
// Login to Pithos
// Login to Mullvad
// Login to Steam
// Pair remote control 
// Set weather location
