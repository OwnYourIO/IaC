import { remote, local, types } from "@pulumi/command";
import { interpolate } from "@pulumi/pulumi";
import { BaseVMImage } from './';
import { VirtualMachine } from "../providers";

export class MicroOS extends BaseVMImage {
    install = ` transactional-update pkg install -y `;
    updateRepo = ` transaction-update pkg update `;

    constructor() {
        super();
        this.name = 'microos';
        this.imageURL = 'https://download.opensuse.org/tumbleweed/appliances/openSUSE-MicroOS.x86_64-OpenStack-Cloud.qcow2';
        this.initUser = 'root';
    }

    initVM(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        // This sets the password if one is provided. 
        const setPasswordCommand = vm.adminPassword ?
            ` echo -e '${vm.adminPassword}'"\n"'${vm.adminPassword}' | passwd ${vm.adminUser}`
            : '';
        const secureVM = vm.run('secureVM', {
            connection: vm.initConnection,
            waitForStart: true,
            waitForReboot: true,
            create: interpolate`transactional-update run bash -c 'zypper install -y qemu-guest-agent system-group-wheel; 
                    systemctl enable qemu-guest-agent
                    sed -i "s/^\\(Defaults targetpw\\)/# \\1/" /etc/sudoers
                    sed -i "s/^\\(ALL\\s\\+ALL=(ALL)\\s\\+ALL\\)/# \\1/" /etc/sudoers
                    sed -i "s/# \\(.wheel\\s\\+ALL=(ALL:ALL)\\s\\+NOPASSWD:\\s\\+ALL\\)/\\1/" /etc/sudoers
                    #sed -i "s/^\\(.*\\/home\\)/# \\1/" /etc/fstab
                    #umount /home
                    #rm -r /home
                    #ln -s /var/home/ /home/
                    #growpart /dev/sda 4
                '
                #rm -rf /var/home/
                #btrfs subvolume create /var/home
                reboot&
                exit
            `
        });

        vm.run('addAdminUser', {
            connection: vm.initConnection,
            waitForReboot: true,
            create: interpolate`
                useradd -m ${vm.adminUser} -d /var/home/${vm.adminUser}
                usermod -aG wheel ${vm.adminUser}
                ${setPasswordCommand}
                mkdir /var/home/${vm.adminUser}/.ssh/
                echo -e "${vm.publicKey}" >> /var/home/${vm.adminUser}/.ssh/authorized_keys
                chown -R ${vm.adminUser}:${vm.adminUser} /var/home/${vm.adminUser}/.ssh/
                ${this.sudo(vm.adminPassword)} reboot&
                exit
            `
        });
        return [secureVM];
    }

    finalize(vm: VirtualMachine): any[] {
        return vm.commandsDependsOn;
    }

    installDocker(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        const installDockerAndGuestAgent = new remote.Command(`${vm.fqdn}-install-docker`, {
            connection,
            // TODO: Add adminUser to docker group.
            create: `${this.sudo(vm.adminPassword)} transactional-update run bash -c 'zypper install -y docker docker-compose; 
                    systemctl enable --now docker
                '
                ${this.sudo(vm.adminPassword)} reboot&
                exit
            `
        }, { dependsOn: vm.commandsDependsOn });
        vm.commandsDependsOn.push(installDockerAndGuestAgent);

        return vm.commandsDependsOn;
    }
}

export class MicroOSDesktop extends MicroOS {
    constructor() {
        super();
        this.name = 'microos-dvd';
        this.imageURL = 'https://download.opensuse.org/tumbleweed/iso/openSUSE-MicroOS-DVD-x86_64-Current.iso';
    }

}
