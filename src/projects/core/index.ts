import {
    Config,
    interpolate,
} from "@pulumi/pulumi";
import { VirtualMachineFactory } from '../../resources';
import { MicroOS, } from '../../resources/images/microos';

const config = new Config();

const k3sVM = VirtualMachineFactory.createVM('core', {
    cloud: 'proxmox',
    size: 'Medium',
    image: new MicroOS(),
    dnsProvider: 'cloudflare',
    vLanId: 99,
}, {
});
//
k3sVM.run('install-helm', {
    waitForReboot: true,
    create: interpolate`
        # policycoreutils-python-utils is to support: 
        # semanage port -a -p tcp -t ssh_port_t 8096
        ${k3sVM.sudo} ${k3sVM.install} helm   policycoreutils-python-utils
        ${k3sVM.sudo} reboot&
        exit
    `
});
k3sVM.run('install-k3s', {
    waitForReboot: true,
    create: interpolate`
        curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --cluster-init --write-kubeconfig-mode=644" ${k3sVM.sudo} sh -
        ${k3sVM.sudo} reboot&
        exit
    `
});

k3sVM.run('install-argocd', {
    waitForReboot: true,
    create: interpolate`
        export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
        ${k3sVM.sudo} -E helm repo add OwnYourIO https://ownyourio.github.io/SpencersLab/

        ${k3sVM.sudo} -E helm install argo-cd OwnYourIO/argo-cd
        ${k3sVM.sudo} -E $(which kubectl) wait --namespace default --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-server --timeout=120s
        ${k3sVM.sudo} -E $(which kubectl) wait --namespace default --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-application-controller --timeout=120s
        ${k3sVM.sudo} -E $(which kubectl) wait --namespace default --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-repo-server --timeout=120s

        ${k3sVM.sudo} -E helm install core OwnYourIO/core
    `
});

export const coreIPv4 = k3sVM.ipv4;
export const coreFQDN = k3sVM.fqdn;
