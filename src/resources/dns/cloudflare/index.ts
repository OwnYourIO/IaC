import { Record } from "@pulumi/cloudflare";
import { DNSRecord, DNSArgs } from "..";

export class CloudflareDNSRecord extends DNSRecord {
    createARecord(): DNSRecord {
        this.recordType = 'A';
        const zoneId = this.config.require(`cloudflare-zoneId-${this.domain}`);

        this.record = new Record(`${this.fqdn}|${this.recordType}Record`, {
            name: this.hostname,
            zoneId,
            type: this.recordType,
            value: this.value,
            ttl: this.ttl
        }, this.opts);

        this.commandsDependsOn.push(this.record);
        return this;
    }
}
