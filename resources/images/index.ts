import { remote, types } from "@pulumi/command";
import { Config, Input, Output, interpolate } from "@pulumi/pulumi";
import { VirtualMachine } from "../providers";

export type argoCdSetupArgs = {
    chartRepoName: string | undefined,
    chartRepo: string | undefined,
    chartPath: string | undefined,
    servicesRepo: string | undefined,
    servicesPath: string | undefined,
    valuesRepo: string | undefined,
    valuesPath: string | undefined,
    helmStage: string | undefined,
    helmServiceToDeploy: string | undefined,
    namespace: string | undefined,
    domain: string | undefined,
    clusterName: string | undefined
}
export abstract class BaseVMImage {
    // TODO: It's either ts-ignore or a constructor setting bogus attributes.
    //@ts-ignore
    name: string;
    //@ts-ignore
    imageURL: string;
    guestAgent: boolean = false;
    initUser: string | undefined;
    // TODO: It may make more sense to throw an error if this isn't implemented?
    // Or at least do | undefined?
    initHostname: string = 'localhost';
    vm: VirtualMachine | undefined;

    sudo(password: Output<string> | string): Output<string> {
        return interpolate` echo '${password}' | sudo -S `;
    }

    getName() {
        return this.name;
    }

    getImageURL() {
        return this.imageURL;
    }

    getSha256URL() {
        return `${this.imageURL}.sha256`;
    }

    getInitUser() {
        return this.initUser;
    }

    // Most VMs will go through a cloud-init process,
    // but some won't and will override this function to
    // configure the VM so that adminUser can login via the fqdn.
    initVM(connection: types.input.remote.ConnectionArgs, vm: VirtualMachine): any[] {
        return [];
    }

    abstract updateRepo: string;
    abstract install: string;

    // Some images won't need to do anything, so that should be the default.
    installQemuGuestAgent(vm: VirtualMachine): void { }
    abstract finalize(vm: VirtualMachine): any[];
    abstract installDocker(connection: Input<types.input.remote.ConnectionArgs>, vm: VirtualMachine): any[];

    k3s(): void {
        throw new Error('Unimplemented function');
    };

    argoCD(params: argoCdSetupArgs): void {
        if (this.vm === undefined) {
            throw new Error('vm is undefined');
        }
        const config = new Config();

        const chartRepoName = params.chartRepoName ?? config.get('helmChartRepoName') ?? 'OwnYourIO';
        const chartRepo = params.chartRepo ?? config.get('helmChartRepo') ?? 'https://ownyourio.github.io/SpencersLab/';
        const chartPath = params.chartPath ?? config.get('helmChartPath') ?? 'charts';
        const servicesRepo = params.servicesRepo ?? config.get('helmServicesRepo') ?? 'https://github.com/OwnYourIO/SpencersLab.git';
        const servicesPath = params.servicesPath ?? config.get('helmServicesPath') ?? 'services';
        const valuesRepo = params.valuesRepo ?? config.get('helmValuesRepo');
        const valuesPath = params.valuesPath ?? config.get('helmValuesPath') ?? 'projects';
        const helmStage = params.helmStage ?? config.get('helmStage') ?? 'dev';
        const helmServiceToDeploy = params.helmServiceToDeploy ?? config.require('helmServiceToDeploy')
        const namespace = params.namespace ?? config.get('helmServiceNamespace') ?? 'default';
        const domain = params.domain ?? config.get('domain') ?? 'local';
        const clusterName = params.clusterName ?? config.get('clusterName') ?? this.vm.hostname;

        this.vm.run('install-argocd-and-configure-service', {
            environment: {
                PULUMI_BITWARDEN_SECRET: config.requireSecret('bitwarden-cli-secret')
            },
            create: interpolate`
                helm repo add ${chartRepoName} "${chartRepo}"

                # Give the resources a chance for the cluster to come up, otherwise it fails right away.
                if ! $(which helm > /dev/null); then
                    until helm install --namespace ${namespace} base ${chartRepoName}/deploy; do
                        sleep 5
                    done
                    until kubectl wait --namespace ${namespace} --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-server --timeout=120s; do
                        sleep 5
                    done
                fi
                kubectl wait --namespace ${namespace} --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-application-controller --timeout=120s
                kubectl wait --namespace ${namespace} --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-repo-server --timeout=120s

                echo $PULUMI_BITWARDEN_SECRET | base64 -d - | kubectl apply --namespace ${namespace} -f -

                echo y | kubectl exec -i svc/base-argocd-server --namespace ${namespace} -- argocd login 'localhost:8080'  --username=admin --password=$(kubectl exec svc/base-argocd-server -- argocd admin initial-password | head -n 1) --insecure
                
                #kubectl exec svc/base-argocd-server --namespace ${namespace} -- argocd cluster set in-cluster --name ${this.vm.hostname}
                
                kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'stage=${helmStage}'
                kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'chart.repo=${chartRepo}'
                kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'chart.repo.path=${chartPath}'
                kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'services.repo=${servicesRepo}'
                kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'services.repo.path=${servicesPath}'
                kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'values.repo=${valuesRepo}'
                kubectl annotate secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'values.repo.path=${valuesPath}'
                kubectl patch clusterrole base-argocd-server --type='json' -p='[{"op": "add", "path": "/rules/0", "value":{ "apiGroups": ["argoproj.io"], "resources": ["applicationsets"], "verbs": ["create","patch"]}}]'

            `
        });
        this.vm.run('set-clusterName-and-domain', {
            create: interpolate`
                kubectl annotate --overwrite secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'domain=${domain}'
                kubectl annotate --overwrite secret --namespace ${namespace} -l argocd.argoproj.io/secret-type=cluster 'clusterName=${clusterName}'
            `
        });
    };
}
