import { types } from "@pulumi/command";

import {
    interpolate,
} from "@pulumi/pulumi";

import { BaseVMImage } from '.';
import { VirtualMachine } from "../providers";

export class BSD extends BaseVMImage {
    // TODO: Update these
    install = ` UPDATE ME IN THE IMAGE `;
    updateRepo = ` UPDATE ME IN THE IMAGE `;
    constructor() {
        super();
        //this.initUser = ;
        //this.initHostname = 'debian.local';
    }


    finalize(vm: VirtualMachine): any[] {
        return vm.commandsDependsOn;
    }

    installQemuGuestAgent(vm: VirtualMachine): void {
        vm.run(`install-qemu-guest-agent`, {
            waitForReboot: true,
            create: interpolate`${vm.sudo} sh -c 'pkg upgrade -y ; \
                    pkg install -y qemu-guest-agent ; \
                    echo "qemu_guest_agent_enable=\\"YES\\"" >> /etc/rc.conf ; \
                    echo "qemu_guest_agent_flags=\\"-d -v -l /var/log/qemu-ga.log\\"" >> /etc/rc.conf ; \
                    service qemu-guest-agent stop ; \
                    service qemu-guest-agent start ; \
                '
            `,
        })
    }

    // TODO: Implement this.
    installDocker(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        //vm.run(`install-docker`, {
        //    create: interpolate`
        //    `
        //});

        return vm.commandsDependsOn;
    }
}

export class FreeBSD extends BSD {
    constructor() {
        super();
        this.imageURL = 'https://object-storage.public.mtl1.vexxhost.net/swift/v1/1dbafeefbd4f4c80864414a441e72dd2/bsd-cloud-image.org/images/freebsd/13.0/freebsd-13.0-ufs.qcow2';
        this.name = 'freebsd';
    }

    finalize(vm: VirtualMachine): any[] {
        //vm.run(`update-to-13.1`, {
        //    waitForReboot: true,
        //    // TODO: Figure out why this results in:
        //    // /usr/sbin/freebsd-update: cannot open /dev/tty: Device not configured
        //    // Could potentially try the 13.1 image instead?
        //    // Or maybe utilize expect
        //    create: interpolate`${vm.sudo} sh -c 'export nonInteractive="YES"; \
        //            freebsd-update fetch ; \
        //            freebsd-update install -y ; \
        //            freebsd-update upgrade -r 13.1-RELEASE ; \
        //            #freebsd-update install; \
        //            #freebsd-update install -y ; \
        //            #shutdown -r now; \
        //        '
        //    `,
        //})
        return vm.commandsDependsOn;
    }
}

export class OpnSenseInstaller extends FreeBSD {
    constructor() {
        super();
        this.imageURL = 'https://mirrors.nycbug.org/pub/opnsense/releases/23.1/OPNsense-23.1-OpenSSL-dvd-amd64.iso.bz2';
        this.name = 'opnsense-installer';
    }
    getSha256URL() {
        return `https://mirrors.nycbug.org/pub/opnsense/releases/23.1/OPNsense-23.1-OpenSSL-dvd-amd64.iso.bz2.sig`;
    }

    finalize(vm: VirtualMachine): any[] {
        super.finalize(vm);
        return vm.commandsDependsOn;
    }
}

export class OPNsense extends FreeBSD {
    constructor() {
        super();
        this.imageURL = 'https://download.freebsd.org/ftp/releases/VM-IMAGES/13.1-RELEASE/amd64/Latest/FreeBSD-13.1-RELEASE-amd64.qcow2.xz';
        this.name = 'opnsense';
    }

    finalize(vm: VirtualMachine): any[] {
        super.finalize(vm);
        vm.run(`install-opnsense`, {
            waitForReboot: true,
            create: interpolate`
                ${vm.sudo} sh -c 'pkg install -y ca_root_nss; \
                    fetch https://raw.githubusercontent.com/opnsense/update/master/src/bootstrap/opnsense-bootstrap.sh.in; \
                    sh ./opnsense-bootstrap.sh.in -y -r 23.1  ;\
                    #-r 22.7; \
                '
            `,
        })
        return vm.commandsDependsOn;
    }
}
