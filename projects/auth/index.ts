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

k3sVM.setup.k3s();

k3sVM.setup.argoCD({
    chartRepoName: config.get('helmChartRepoName') ?? 'OwnYourIO',
    chartRepo: config.get('helmChartRepo') ?? 'https://ownyourio.github.io/SpencersLab/',
    chartPath: config.get('helmChartPath') ?? 'charts',
    servicesRepo: config.get('helmServicesRepo') ?? 'https://github.com/OwnYourIO/SpencersLab.git',
    servicesPath: config.get('helmServicesPath') ?? 'services',
    valuesRepo: config.get('helmValuesRepo'),
    valuesPath: config.get('helmValuesPath') ?? 'projects',
    helmStage: config.get('helmStage') ?? 'dev',
    helmServiceToDeploy: config.require('helmServiceToDeploy'),
    namespace: config.get('helmServiceNamespace') ?? 'default',
    domain: config.get('domain') ?? 'local',
    clusterName: config.get('clusterName') ?? k3sVM.hostname,
});

export const authIPv4 = k3sVM.ipv4;
export const authFQDN = k3sVM.fqdn;
