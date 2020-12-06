import { Injectable } from '@nestjs/common';

@Injectable()
export class CloudProvidersMetaData {
  private static readonly GOOGLE: string =
    'http://metadata.google.internal/computeMetadata/v1/';
  private static readonly AZURE: string =
    'http://169.254.169.254/metadata/instance';
  private static readonly DIGITAL_OCEAN: string =
    'http://169.254.169.254/metadata/v1/';
  private static readonly AWS: string =
    'http://169.254.169.254/latest/meta-data/';

  private providers: Map<string, string> = new Map<string, string>();

  constructor() {
    //TODO - set correct values
    this.providers.set(CloudProvidersMetaData.GOOGLE, 'google');
    this.providers.set(CloudProvidersMetaData.AZURE, 'azure');
    this.providers.set(CloudProvidersMetaData.AWS, 'aws');
    this.providers.set(CloudProvidersMetaData.DIGITAL_OCEAN, 'digital ocean');
  }

  get(providerUrl: string): string {
    return this.providers.get(providerUrl);
  }
}
