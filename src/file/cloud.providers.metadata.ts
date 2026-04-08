import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class CloudProvidersMetaData {
  public static readonly GOOGLE: string =
    'http://metadata.google.internal/computeMetadata/v1/';
  public static readonly AZURE: string =
    'http://169.254.169.254/metadata/instance';
  public static readonly DIGITAL_OCEAN: string =
    'http://169.254.169.254/metadata/v1';
  public static readonly DIGITAL_OCEAN_JSON: string =
    'http://169.254.169.254/metadata/v1.json';
  public static readonly AWS: string =
    'http://169.254.169.254/latest/meta-data/';

  private readonly providers: Map<string, Set<string>> = new Map<string, Set<string>>();

  constructor() {
    this.providers.set(
      CloudProvidersMetaData.GOOGLE,
      new Set<string>(['instance', 'oslogin', 'project'])
    );
    this.providers.set(
      CloudProvidersMetaData.DIGITAL_OCEAN,
      new Set<string>([
        'id',
        'hostname',
        'user-data',
        'vendor-data',
        'public-keys',
        'region',
        'interfaces',
        'interfaces/public',
        'interfaces/private',
        'dns',
        'floating_ip',
        'reserved_ip',
        'tags',
        'features'
      ])
    );
    this.providers.set(
      CloudProvidersMetaData.AZURE,
      new Set<string>(['compute', 'network'])
    );
    this.providers.set(
      CloudProvidersMetaData.AWS,
      new Set<string>([
        'ami-id',
        'ami-launch-index',
        'ami-manifest-path',
        'block-device-mapping',
        'events',
        'hostname',
        'iam',
        'instance-action',
        'instance-id',
        'instance-life-cycle',
        'instance-type',
        'local-hostname',
        'local-ipv4',
        'mac',
        'metrics',
        'network',
        'placement',
        'profile',
        'public-hostname',
        'public-ipv4',
        'public-keys',
        'reservation-id',
        'security-groups',
        'services'
      ])
    );
  }

  public static isAllowedResource(providerUrl: string, resourcePath: string): boolean {
    const normalized = resourcePath.replace(/^\/+/, '').replace(/\/+$/, '');

    if (providerUrl === CloudProvidersMetaData.DIGITAL_OCEAN) {
      return new Set<string>([
        'id',
        'hostname',
        'user-data',
        'vendor-data',
        'public-keys',
        'region',
        'interfaces',
        'interfaces/public',
        'interfaces/private',
        'dns',
        'floating_ip',
        'reserved_ip',
        'tags',
        'features'
      ]).has(normalized);
    }

    if (providerUrl === CloudProvidersMetaData.GOOGLE) {
      return new Set<string>(['instance', 'oslogin', 'project']).has(normalized);
    }

    if (providerUrl === CloudProvidersMetaData.AWS) {
      return new Set<string>([
        'ami-id',
        'ami-launch-index',
        'ami-manifest-path',
        'block-device-mapping',
        'events',
        'hostname',
        'iam',
        'instance-action',
        'instance-id',
        'instance-life-cycle',
        'instance-type',
        'local-hostname',
        'local-ipv4',
        'mac',
        'metrics',
        'network',
        'placement',
        'profile',
        'public-hostname',
        'public-ipv4',
        'public-keys',
        'reservation-id',
        'security-groups',
        'services'
      ]).has(normalized);
    }

    if (providerUrl === CloudProvidersMetaData.AZURE) {
      return new Set<string>(['compute', 'network']).has(normalized);
    }

    throw new BadRequestException('Unsupported metadata endpoint');
  }

  async get(providerUrl: string, resourcePath?: string): Promise<string> {
    if (!this.providers.has(providerUrl)) {
      throw new BadRequestException('Unsupported metadata endpoint');
    }

    if (!resourcePath) {
      throw new BadRequestException('Invalid metadata resource');
    }

    const allowed = this.providers.get(providerUrl);
    if (!allowed || !allowed.has(resourcePath)) {
      throw new BadRequestException('Invalid metadata resource');
    }

    if (providerUrl.startsWith(CloudProvidersMetaData.GOOGLE)) {
      return `
        instance/
        oslogin/
        project/
      `.trim();
    } else if (providerUrl.startsWith(CloudProvidersMetaData.DIGITAL_OCEAN)) {
      return `
        id
        hostname
        user-data
        vendor-data
        public-keys
        region
        interfaces/
        dns/
        floating_ip/
        reserved_ip/
        tags/
        features/
      `.trim();
    } else if (providerUrl.startsWith(CloudProvidersMetaData.AWS)) {
      return `
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
      `.trim();
    } else if (providerUrl.startsWith(CloudProvidersMetaData.AZURE)) {
      return `
        {
          "compute": {},
          "network": {}
        }
      `.trim();
    } else {
      throw new BadRequestException('Unsupported metadata endpoint');
    }
  }
}
