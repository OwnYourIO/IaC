import {
    Config,
    interpolate,
} from "@pulumi/pulumi";
import { VirtualMachineFactory } from '../../resources';
import { MicroOS, } from '../../resources/images/microos';
import { Debian11 } from '../../resources/images/debian';

const config = new Config();
const subdomain = 'vpn';
const vpnServerHostname = config.get('vpn-hostname') ?? subdomain;
// TODO: Better import this from the config. Do it based on the domain.
const tlsEmail = 'tms@spencerslab.com';

// Netmaker Server
const netmakerServer = VirtualMachineFactory.createVM('vpn', {
    hostname: vpnServerHostname,
    //childSubdomains: ['proxy', 'nginx'],
    // Does this work? If so, remove ^^^
    siblingSubdomains: [`netmaker-server`],
    childSubdomains: [
        `dashboard`, `mx`, `api`, `broker`],
    cloud: 'hcloud',
    size: 'Small',
    image: new Debian11(),
    installDocker: true,
    dnsProvider: 'cloudflare',
    tlsEmail: tlsEmail,
}, {
    //dependsOn: []
});

netmakerServer.run('install-netmaker:dependancies', {
    create: interpolate`
        ${netmakerServer.sudo} bash -c '
            ${netmakerServer.updateRepo}
            ${netmakerServer.install}
            DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
            ${netmakerServer.install} wireguard ufw
            ufw allow ssh
            ufw allow proto tcp from any to any port 443
            ufw allow 51821:51830/udp
            iptables --policy FORWARD ACCEPT
            systemctl enable --now ufw
        '
    `,
});

netmakerServer.run('install-netmaker:edit-docker-compose.yml', {
    // TODO: Need docker-compose.yml output. Or maybe just master key and mq admin password?
    create: interpolate`
        wget -O docker-compose.yml https://raw.githubusercontent.com/gravitl/netmaker/master/compose/docker-compose.yml;
        wget -O Caddyfile https://raw.githubusercontent.com/gravitl/netmaker/master/docker/Caddyfile;
        sed -i 's/YOUR_EMAIL/${tlsEmail}/g' Caddyfile
        sed -i "s/NETMAKER_BASE_DOMAIN/${netmakerServer.fqdn}/g" Caddyfile;
        sed -i "s/NETMAKER_BASE_DOMAIN/${netmakerServer.fqdn}/g" docker-compose.yml;
        sed -i "s/SERVER_PUBLIC_IP/$(ip route get 1 | sed -n 's/^.*src ${String.raw`\([0-9.]*\) .*$/\1/p`}')/g" docker-compose.yml;
        sed -i 's/YOUR_EMAIL/${tlsEmail}/g' docker-compose.yml;
        sed -i "s/REPLACE_MASTER_KEY/$(tr -dc A-Za-z0-9 </dev/urandom | head -c 30 ; echo '')/g" docker-compose.yml
        sed -i "s/REPLACE_MQ_ADMIN_PASSWORD/$(tr -dc A-Za-z0-9 </dev/urandom | head -c 30)/g" docker-compose.yml
    `,
});

netmakerServer.run('install-netmaker:edit-mqtt-config', {
    create: interpolate`
        ${netmakerServer.sudo} wget -O /root/mosquitto.conf https://raw.githubusercontent.com/gravitl/netmaker/master/docker/mosquitto.conf;
        ${netmakerServer.sudo} wget -q -O /root/wait.sh https://raw.githubusercontent.com/gravitl/netmaker/develop/docker/wait.sh;
        ${netmakerServer.sudo} chmod +x /root/wait.sh;
    `,
});

netmakerServer.run('install-netmaker:start-docker-containers', {
    create: interpolate`
        ${netmakerServer.sudo} docker-compose up -d;
        echo hi 
    `,
});

const netmakerServerToken = config.get('netmakerServerToken');
if (netmakerServerToken) {
    netmakerServer.run('configure-netmaker-client', {
        waitForReboot: true,
        create: interpolate`${netmakerServer.sudo} bash -c '
                curl -sL 'https://apt.netmaker.org/gpg.key' | sudo tee /etc/apt/trusted.gpg.d/netclient.asc; 
                curl -sL 'https://apt.netmaker.org/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/netclient.list;
                sleep 1; # Dumb hack to make sure the files are saved before updating.Failed otherwise. 
                apt-get -o DPkg::Lock::Timeout=120 update -y;
                apt-get -o DPkg::Lock::Timeout=120 upgrade -y;
                ${netmakerServer.install} wireguard netclient;
                systemctl enable --now netclient;
                netclient join -t "${netmakerServerToken}"
                exit
            '
        `,
    });
}


// Netmaker media ingress
const netmakerMediaIngressVM = VirtualMachineFactory.createVM('netmaker-media-ingress', {
    cloud: 'proxmox',
    size: 'Small',
    image: new MicroOS(),
}, {
    //dependsOn: netmakerServer.commandsDependsOn
});
//
netmakerMediaIngressVM.run('install-netmaker-client', {
    waitForReboot: true,
    create: interpolate`
        ${netmakerMediaIngressVM.sudo} transactional-update run bash -c '
            zypper addrepo -g -f -r https://rpm.netmaker.org/netclient-repo
            zypper --gpg-auto-import-keys refresh
            zypper -n install netclient
            exit
        '
        ${netmakerMediaIngressVM.sudo} reboot&
        exit
    `
});

const netmakerMediaIngressToken = config.get('netmakerMediaIngressToken');
if (netmakerMediaIngressToken) {
    netmakerMediaIngressVM.run('configure-netmaker-client', {
        waitForReboot: true,
        create: interpolate`${netmakerMediaIngressVM.sudo} transactional-update run bash -c '
                netclient join -t "${netmakerMediaIngressToken}"
                systemctl enable --now netclient
                
                exit
            '
            ${netmakerMediaIngressVM.sudo} reboot&
            exit
        `,
    });
}

// Also need to take the following manual steps:
// Create admin account
// Create Network (Point to site)
// Create Access Key for ingress
// Configure ingress VM with access key.

// Configure ingress status on server
// Configure relay status on server, setting to all nodes.
// Configure egress status on engress, setting local network
//      The interface has to match what's on the VM. EX: enp6s18

// Join network with personal laptop

//export const vpnIngressIPv4 = netmakerMediaIngressVM.ipv4;
//export const vpnIngressFQDN = netmakerMediaIngressVM.fqdn;
//
export const vpnIPv4 = netmakerServer.ipv4;
export const vpnFQDN = netmakerServer.fqdn;
