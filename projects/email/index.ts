import {
    Config,
    interpolate,
} from "@pulumi/pulumi";
import { VirtualMachineFactory } from '../../resources';
import { Debian12 } from '../../resources/images/debian';
import { MicroOS } from '../../resources/images/microos';

const config = new Config();

const k3sVM = VirtualMachineFactory.createVM('email', {
    cloud: config.get('vmCloud') ?? 'proxmox',
    size: 'Medium',
    image: new MicroOS(),
    //image: config.get('vmCloud') === 'proxmox' ? new MicroOS() : new Debian12(),
    dnsProvider: 'cloudflare',
    vLanId: config.getNumber('vmVLAN'),
    macAddress: config.get('vmMAC'),
    //additionalSubdomains: ['build',
    //    'artifacts', 'artifactory',
    //    'cicd', 'drone',
    //    'git', 'forgejo',
    //],
}, {
});

k3sVM.run('install-k3s', {
    waitForReboot: true,
    create: interpolate`
        ${k3sVM.sudo} bash -c "
            curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC='server --cluster-init --write-kubeconfig-mode=600' sh -
            echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> /root/.bashrc
            reboot&
        "
        exit
    `
});
// This has to be done separate because of transactions
k3sVM.run('install-k9s-and-helm', {
    waitForReboot: true,
    create: interpolate`
        # policycoreutils-python-utils is to support: 
        # semanage port -a -p tcp -t ssh_port_t 8096
        echo 'export KUBECONFIG=~/.kube/config' >>~/.bashrc
        THE_USER=$USER
        THE_USER_HOME=$HOME
        ${k3sVM.sudo} bash -c "
            ${k3sVM.install} helm policycoreutils-python-utils k9s git

            # Configure k3s access for admin user.
            mkdir $THE_USER_HOME/.kube/
            cp /etc/rancher/k3s/k3s.yaml $THE_USER_HOME/.kube/config
            chown -R $THE_USER $THE_USER_HOME/.kube/
            chmod 600 $THE_USER_HOME/.kube/config

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
    environment: {
        PULUMI_BITWARDEN_SECRET: config.requireSecret('bitwarden-cli-secret')
    },
    create: interpolate`
        helm repo add ${chartRepoName} "${chartRepo}"

        # Give the resources a chance for the cluster to come up, otherwise it fails right away.
        until helm install --namespace ${namespace} base ${chartRepoName}/deploy; do
            sleep 5
        done
        until kubectl wait --namespace ${namespace} --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-server --timeout=120s; do
            sleep 5
        done
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

export const emailIPv4 = k3sVM.ipv4;
export const emailFQDN = k3sVM.fqdn;
