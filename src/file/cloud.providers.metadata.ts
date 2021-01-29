import { Injectable } from '@nestjs/common';

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
        [{"deviceName":"boot","index":0,"mode":"READ_WRITE","type":"PERSISTENT"},
        {"deviceName":"persistent-disk-1","index":1,"mode":"READ_WRITE","type":"PERSISTENT"},
        {"deviceName":"persistent-disk-2","index":2,"mode":"READ_ONLY","type":"PERSISTENT"}]    
    `,
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
    `,
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
    `,
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
    `,
    );
  }

  get(providerUrl: string): string {
    if (providerUrl.startsWith(CloudProvidersMetaData.GOOGLE)) {
      return this.providers.get(CloudProvidersMetaData.GOOGLE);
    } else if (providerUrl.startsWith(CloudProvidersMetaData.DIGITAL_OCEAN)) {
      return this.providers.get(CloudProvidersMetaData.DIGITAL_OCEAN);
    } else if (providerUrl.startsWith(CloudProvidersMetaData.AWS)) {
      return this.providers.get(CloudProvidersMetaData.AWS);
    } else if (providerUrl.startsWith(CloudProvidersMetaData.AZURE)) {
      return this.providers.get(CloudProvidersMetaData.AZURE);
    } else {
      return null;
    }
  }
}
