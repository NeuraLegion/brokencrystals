import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class CloudProvidersMetaData {
  public static readonly GOOGLE: string =
    'http://metadata.google.internal/computeMetadata/v1/';
  public static readonly AZURE: string =
    'http://169.254.169.254/metadata/instance';
  public static readonly DIGITAL_OCEAN: string =
    'http://169.254.169.254/metadata/v1/';
  public static readonly AWS: string =
    'http://169.254.169.254/latest/meta-data/';

  private providers: Map<string, string> = new Map<string, string>();

  constructor() {
    //TODO - set correct values
    this.providers.set(
      CloudProvidersMetaData.GOOGLE,
      `
        attributes/
        cpu-platform
        description
        instance
        hostname
        project
        disks
        service-accounts
        tags
        guest-attributes
        maintenance-event
        network-interfaces/
    `.trim(),
    );
    this.providers.set(
      CloudProvidersMetaData.DIGITAL_OCEAN,
      `
      {
        "droplet_id":2756294,
        "hostname":"sample-droplet",
        "vendor_data":"#cloud-config\ndisable_root: false\nmanage_etc_hosts: true\n\ncloud_config_modules:\n - ssh\n - set_hostname\n - [ update_etc_hosts, once-per-instance ]\n\ncloud_final_modules:\n - scripts-vendor\n - scripts-per-once\n - scripts-per-boot\n - scripts-per-instance\n - scripts-user\n",
        "public_keys":["ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCcbi6cygCUmuNlB0KqzBpHXf7CFYb3VE4pDOf/RLJ8OFDjOM+fjF83a24QktSVIpQnHYpJJT2pQMBxD+ZmnhTbKv+OjwHSHwAfkBullAojgZKzz+oN35P4Ea4J78AvMrHw0zp5MknS+WKEDCA2c6iDRCq6/hZ13Mn64f6c372JK99X29lj/B4VQpKCQyG8PUSTFkb5DXTETGbzuiVft+vM6SF+0XZH9J6dQ7b4yD3sOder+M0Q7I7CJD4VpdVD/JFa2ycOS4A4dZhjKXzabLQXdkWHvYGgNPGA5lI73TcLUAueUYqdq3RrDRfaQ5Z0PEw0mDllCzhk5dQpkmmqNi0F sammy@digitalocean.com"],
        "region":"nyc3",
        "interfaces":{
          "private":[
            {
              "ipv4":{
                "ip_address":"10.132.255.113",
                "netmask":"255.255.0.0",
                "gateway":"0.0.0.0"
              },
              "mac":"04:01:2a:0f:2a:02",
              "type":"private"
            }
          ],
          "public":[
            {
              "ipv4":{
                "ip_address":"104.131.20.105",
                "netmask":"255.255.192.0",
                "gateway":"104.131.0.1"
              },
              "ipv6":{
                "ip_address":"2604:A880:0800:0010:0000:0000:017D:2001",
                "cidr":64,
                "gateway":"2604:A880:0800:0010:0000:0000:0000:0001"
              },
              "mac":"04:01:2a:0f:2a:01",
              "type":"public"}
          ]
        },
        "floating_ip": {
          "ipv4": {
            "active": false
          }
        },
        "dns":{
          "nameservers":[
            "2001:4860:4860::8844",
            "2001:4860:4860::8888",
            "8.8.8.8"
          ]
        },
        "features":{
          "dhcp_enabled": true
        }
      }
      `.trim(),
    );
    this.providers.set(
      CloudProvidersMetaData.AZURE,
      `
        {
          "compute": {
              "azEnvironment": "AZUREPUBLICCLOUD",
              "isHostCompatibilityLayerVm": "true",
              "licenseType":  "Windows_Client",
              "location": "westus",
              "name": "examplevmname",
              "offer": "Windows",
              "osProfile": {
                  "adminUsername": "admin",
                  "computerName": "examplevmname",
                  "disablePasswordAuthentication": "true"
              },
              "osType": "linux",
              "placementGroupId": "f67c14ab-e92c-408c-ae2d-da15866ec79a",
              "plan": {
                  "name": "planName",
                  "product": "planProduct",
                  "publisher": "planPublisher"
              },
              "platformFaultDomain": "36",
              "platformUpdateDomain": "42",
              "publicKeys": [{
                      "keyData": "ssh-rsa 0",
                      "path": "/home/user/.ssh/authorized_keys0"
                  },
                  {
                      "keyData": "ssh-rsa 1",
                      "path": "/home/user/.ssh/authorized_keys1"
                  }
              ],
              "publisher": "RDFE-Test-Microsoft-Windows-Server-Group",
              "resourceGroupName": "macikgo-test-may-23",
              "resourceId": "/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/virtualMachines/examplevmname",
              "securityProfile": {
                  "secureBootEnabled": "true",
                  "virtualTpmEnabled": "false"
              },
              "sku": "Windows-Server-2012-R2-Datacenter",
              "storageProfile": {
                  "dataDisks": [{
                      "caching": "None",
                      "createOption": "Empty",
                      "diskSizeGB": "1024",
                      "image": {
                          "uri": ""
                      },
                      "lun": "0",
                      "managedDisk": {
                          "id": "/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/disks/exampledatadiskname",
                          "storageAccountType": "Standard_LRS"
                      },
                      "name": "exampledatadiskname",
                      "vhd": {
                          "uri": ""
                      },
                      "writeAcceleratorEnabled": "false"
                  }],
                  "imageReference": {
                      "id": "",
                      "offer": "UbuntuServer",
                      "publisher": "Canonical",
                      "sku": "16.04.0-LTS",
                      "version": "latest"
                  },
                  "osDisk": {
                      "caching": "ReadWrite",
                      "createOption": "FromImage",
                      "diskSizeGB": "30",
                      "diffDiskSettings": {
                          "option": "Local"
                      },
                      "encryptionSettings": {
                          "enabled": "false"
                      },
                      "image": {
                          "uri": ""
                      },
                      "managedDisk": {
                          "id": "/subscriptions/xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx/resourceGroups/macikgo-test-may-23/providers/Microsoft.Compute/disks/exampleosdiskname",
                          "storageAccountType": "Standard_LRS"
                      },
                      "name": "exampleosdiskname",
                      "osType": "Linux",
                      "vhd": {
                          "uri": ""
                      },
                      "writeAcceleratorEnabled": "false"
                  }
              },
              "subscriptionId": "xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx",
              "tags": "baz:bash;foo:bar",
              "version": "15.05.22",
              "vmId": "02aab8a4-74ef-476e-8182-f6d2ba4166a6",
              "vmScaleSetName": "crpteste9vflji9",
              "vmSize": "Standard_A3",
              "zone": ""
          },
          "network": {
              "interface": [{
                  "ipv4": {
                    "ipAddress": [{
                          "privateIpAddress": "10.144.133.132",
                          "publicIpAddress": ""
                      }],
                      "subnet": [{
                          "address": "10.144.133.128",
                          "prefix": "26"
                      }]
                  },
                  "ipv6": {
                      "ipAddress": [
                      ]
                  },
                  "macAddress": "0011AAFFBB22"
              }]
          }
      }
    `.trim(),
    );
    this.providers.set(
      CloudProvidersMetaData.AWS,
      `
        ami-id
        ami-launch-index
        ami-manifest-path
        block-device-mapping/
        events/
        hostname
        iam/
        instance-action
        instance-id
        instance-life-cycle
        instance-type
        local-hostname
        local-ipv4
        mac
        metrics/
        network/
        placement/
        profile
        public-hostname
        public-ipv4
        public-keys/
        reservation-id
        security-groups
        services/
    `.trim(),
    );
    this.providers.set(
      CloudProvidersMetaData.DIGITAL_OCEAN,
      `
        id
        hostname
        user-data
        vendor-data
        public-keys
        region
        interfaces/
        dns/
        floating_ip/
        tags/
        features/
    `.trim(),
    );
  }

  async get(providerUrl: string): Promise<string> {
    if (providerUrl.startsWith(CloudProvidersMetaData.GOOGLE)) {
      return this.providers.get(CloudProvidersMetaData.GOOGLE);
    } else if (providerUrl.startsWith(CloudProvidersMetaData.DIGITAL_OCEAN)) {
      return this.providers.get(CloudProvidersMetaData.DIGITAL_OCEAN);
    } else if (providerUrl.startsWith(CloudProvidersMetaData.AWS)) {
      return this.providers.get(CloudProvidersMetaData.AWS);
    } else if (providerUrl.startsWith(CloudProvidersMetaData.AZURE)) {
      return this.providers.get(CloudProvidersMetaData.AZURE);
    } else {
      const { data } = await axios(providerUrl, {
        timeout: 5000,
        responseType: 'text',
      });
      return data;
    }
  }
}
