import {
    Config,
    interpolate,
} from "@pulumi/pulumi";
import { VirtualMachineFactory } from '../../resources';
import { MicroOS, } from '../../resources/images/microos';

const config = new Config();

const k3sVM = VirtualMachineFactory.createVM('auth', {
    cloud: config.get('vmCloud') ?? 'proxmox',
    size: 'Medium',
    image: new MicroOS(),
    dnsProvider: 'cloudflare',
    vLanId: config.getNumber('vmVLAN'),
    macAddress: config.get('vmMAC'),
    //additionalSubdomains: ['authentik',
    //    'git', 'forgejo',
    //],
}, {
});

k3sVM.run('install-k9s-and-helm', {
    waitForReboot: true,
    create: interpolate`
        # policycoreutils-python-utils is to support: 
        # semanage port -a -p tcp -t ssh_port_t 8096
        ${k3sVM.sudo} bash -c "
            ${k3sVM.install} helm policycoreutils-python-utils k9s git
            reboot&
        "
        exit
    `
});
// This has to be done separate because of transactions
k3sVM.run('install-k3s', {
    waitForReboot: true,
    create: interpolate`
        echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc
        source ~/.bashrc
        ${k3sVM.sudo} bash -c "
            curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC='server --cluster-init --write-kubeconfig-mode=644' sh -
            echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc
            chmod go-r $KUBECONFIG
            chown ${k3sVM.adminUser} $KUBECONFIG
            reboot&
        "
        exit
    `
});

const chartRepoName = config.get('helmChartRepoName') ?? 'OwnYourIO';
const chartRepo = config.get('helmChartRepo') ?? 'https://ownyourio.github.io/SpencersLab/';
const chartPath = config.get('helmChartPath') ?? 'charts';
const servicesRepo = config.get('helmServicesRepo') ?? 'https://github.com/OwnYourIO/SpencersLab.git';
const servicesPath = config.get('helmServicesPath') ?? 'services';
const valuesRepo = config.get('helmValuesRepo');
const valuesPath = config.get('helmValuesPath') ?? 'projects';
const helmStage = config.get('helmStage') ?? 'dev';
const helmServiceToDeploy = config.require('helmServiceToDeploy')
const namespace = config.get('helmServiceNamespace') ?? 'default';
k3sVM.run('install-argocd-and-configure-service', {
    waitForReboot: true,
    environment: {
        KUBECONFIG: '/etc/rancher/k3s/k3s.yaml',
        PULUMI_BITWARDEN_SECRET: config.requireSecret('bitwarden-cli-secret')
    },
    create: interpolate`
        helm repo add ${chartRepoName} "${chartRepo}"

        helm install --namespace ${namespace} base ${chartRepoName}/deploy
        # Give the resources a chance to be created otherwise it just fails right away.
        sleep 15
        kubectl wait --namespace ${namespace} --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-server --timeout=120s
        kubectl wait --namespace ${namespace} --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-application-controller --timeout=120s
        kubectl wait --namespace ${namespace} --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-repo-server --timeout=120s

        echo $PULUMI_BITWARDEN_SECRET | base64 -d - | kubectl create --namespace ${namespace} -f -

        echo y | kubectl exec -i svc/base-argocd-server --namespace ${namespace} -- argocd login 'localhost:8080'  --username=admin --password=$(kubectl exec svc/base-argocd-server -- argocd admin initial-password | head -n 1) --insecure
        kubectl exec svc/base-argocd-server --namespace ${namespace} -- argocd cluster set in-cluster --name ${k3sVM.hostname}
        
        kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'stage=${helmStage}'
        kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'chart.repo=${chartRepo}'
        kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'chart.repo.path=${chartPath}'
        kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'services.repo=${servicesRepo}'
        kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'services.repo.path=${servicesPath}'
        kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'values.repo=${valuesRepo}'
        kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'values.repo.path=${valuesPath}'
        kubectl patch clusterrole base-argocd-server --type='json' -p='[{"op": "add", "path": "/rules/0", "value":{ "apiGroups": ["argoproj.io"], "resources": ["applicationsets"], "verbs": ["create","patch"]}}]'

        helm install --namespace ${namespace} ${helmServiceToDeploy} ${chartRepoName}/${helmServiceToDeploy}
    `
});

export const authIPv4 = k3sVM.ipv4;
export const authFQDN = k3sVM.fqdn;
