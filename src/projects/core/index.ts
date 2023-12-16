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
    // TODO: Pass this in from config instead.
    vLanId: 99,
    //additionalSubdomains: ['build',
    //    'artifacts', 'artifactory',
    //    'cicd', 'drone',
    //    'git', 'forgejo',
    //],
}, {
});

k3sVM.run('install-helm', {
    waitForReboot: true,
    create: interpolate`
        # policycoreutils-python-utils is to support: 
        # semanage port -a -p tcp -t ssh_port_t 8096
        ${k3sVM.sudo} ${k3sVM.install} helm policycoreutils-python-utils k9s git
        ${k3sVM.sudo} reboot&
        exit
    `
});
k3sVM.run('install-k3s', {
    waitForReboot: true,
    create: interpolate`
        ${k3sVM.sudo} bash -c "
            curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC='server --cluster-init --write-kubeconfig-mode=644' sh -
            reboot&
        "
        exit
    `
});

const chartPath = 'https://github.com/OwnYourIO/SpencersLab.git'
const appSetPath = 'https://raw.githubusercontent.com/OwnYourIO/SpencersLab/main/default-application-set.yaml'
k3sVM.run('install-argocd', {
    waitForReboot: true,
    create: interpolate`
        export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
        ${k3sVM.sudo} -E helm repo add OwnYourIO "https://ownyourio.github.io/SpencersLab/"
        #helm repo add jetstack https://charts.jetstack.io

        ${k3sVM.sudo} -E helm install base OwnYourIO/deploy
        ${k3sVM.sudo} -E $(which kubectl) wait --namespace default --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-server --timeout=120s
        ${k3sVM.sudo} -E $(which kubectl) wait --namespace default --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-application-controller --timeout=120s
        ${k3sVM.sudo} -E $(which kubectl) wait --namespace default --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-repo-server --timeout=120s
    `
});

k3sVM.run('configure-argocd', {
    waitForReboot: true,
    // To get the sealed-secret-key, 
    // kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml | base64 
    // https://github.com/bitnami-labs/sealed-secrets#how-can-i-do-a-backup-of-my-sealedsecrets
    create: interpolate`
        export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

        ${k3sVM.sudo} -E bash -c "
            echo ${config.get('sealed-secret-key')} | base64 -d - | $(which kubectl) create --namespace default -f -

            echo y | $(which kubectl) exec -i svc/base-argocd-server -- argocd login 'localhost:8080'  --username=admin --password=$($(which kubectl) exec svc/base-argocd-server -- argocd admin initial-password | head -n 1) --insecure
            $(which kubectl) exec svc/base-argocd-server -- argocd cluster set in-cluster --name ${k3sVM.hostname}
            
            $(which kubectl) label secret -l argocd.argoproj.io/secret-type=cluster  stage=dev
            $(which kubectl) annotate secret -l argocd.argoproj.io/secret-type=cluster 'repo.chart=${chartPath}'
            $(which kubectl) annotate secret -l argocd.argoproj.io/secret-type=cluster repo.chart.path=charts/
            $(which kubectl) annotate secret -l argocd.argoproj.io/secret-type=cluster repo.values=https://github.com/OwnYourIO/IaC.git
            $(which kubectl) annotate secret -l argocd.argoproj.io/secret-type=cluster repo.values.path=src/projects/
            $(which kubectl) patch clusterrole base-argocd-server --type='json' -p='[{\\"op\\": \\"add\\", \\"path\\": \\"/rules/0\\", \\"value\\":{ \\"apiGroups\\": [\\"\\"], \\"resources\\": [\\"applicationsets\\"], \\"verbs\\": [\\"create\\",\\"patch\\"]}}]'

            $(which kubectl) exec svc/base-argocd-server -- argocd appset create '${appSetPath}'
        "
    `
});

export const coreIPv4 = k3sVM.ipv4;
export const coreFQDN = k3sVM.fqdn;
