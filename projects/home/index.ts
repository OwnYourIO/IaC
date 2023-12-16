import { Config, interpolate, getStack } from "@pulumi/pulumi";
import { VirtualMachineFactory } from "../../resources";
import { HomeAssistantOS } from "../../resources/images/homeassistant";

const config = new Config();

const home = VirtualMachineFactory.createVM(`home`, {
    cloud: 'proxmox',
    size: 'Medium',
    image: new HomeAssistantOS(),
    dnsProvider: 'cloudflare',
    childSubdomains: [
        'proxy', 'nginx', 'backup',
        'db', 'influxdb',
        'graph', 'grafana',
    ],
    siblingSubdomains: [
        'esphome',
        'gps', 'traccar',
    ],
}, {});

if (getStack() === 'main') {
    home.run(`passThroughDevices`, {
        connection: home.providerConnection,
        waitForReboot: true,
        // TODO: Confirm this is the right device to pass through.
        create: interpolate`
            qm set ${home.cloudID} -usb0 host=10c4:8a2a,usb3=1

            # Restart the VM to apply these configs.
            qm shutdown ${home.cloudID}&
            qm wait ${home.cloudID}
            qm start ${home.cloudID}
        `
    });
}