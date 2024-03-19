import { remote, local, types } from "@pulumi/command";
import { Config, interpolate } from "@pulumi/pulumi";
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
            interpolate` echo -e '${vm.adminPassword}'"\n"'${vm.adminPassword}' | passwd ${vm.adminUser}`
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
                echo 'AcceptEnv SUDO_PASSWORD PULUMI_* KUBECONFIG' >> /etc/ssh/sshd_config.d/allowed_envs.conf
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
            create: interpolate`${this.sudo(vm.adminPassword)} transactional-update run bash -c 'zypper install -y docker docker-compose; 
                    systemctl enable --now docker
                '
                ${this.sudo(vm.adminPassword)} reboot&
                exit
            `
        }, { dependsOn: vm.commandsDependsOn });
        vm.commandsDependsOn.push(installDockerAndGuestAgent);

        return vm.commandsDependsOn;
    }

    k3s(): void {
        if (this.vm === undefined) {
            throw new Error('vm is undefined');
        }
        this.vm.run('install-k3s', {
            waitForReboot: true,
            create: interpolate`
            ${this.vm.sudo} bash -c "
                curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC='server --cluster-init --write-kubeconfig-mode=600' sh -
                echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> /root/.bashrc
                reboot&
            "
            exit
        `
        });
        // This has to be done separate because of transactions
        this.vm.run('install-k9s-and-helm', {
            waitForReboot: true,
            create: interpolate`
                # policycoreutils-python-utils is to support: 
                # semanage port -a -p tcp -t ssh_port_t 8096
                echo 'export KUBECONFIG=~/.kube/config' >>~/.bashrc
                THE_USER=$USER
                THE_USER_HOME=$HOME
                ${this.vm.sudo} bash -c "
                    ${this.vm.install} helm policycoreutils-python-utils k9s git

                    # Configure k3s access for admin user.
                    mkdir -p $THE_USER_HOME/.kube/
                    cp /etc/rancher/k3s/k3s.yaml $THE_USER_HOME/.kube/config
                    chown -R $THE_USER $THE_USER_HOME/.kube/
                    chmod 600 $THE_USER_HOME/.kube/config

                    reboot&
                "
                exit
            `
        });
    };

}

export class MicroOSDesktop extends MicroOS {
    constructor() {
        super();
        this.name = 'microos-dvd';
        this.imageURL = 'https://download.opensuse.org/tumbleweed/iso/openSUSE-MicroOS-DVD-x86_64-Current.iso';
    }

}
