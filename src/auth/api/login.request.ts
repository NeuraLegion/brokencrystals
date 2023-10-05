import { ApiProperty } from '@nestjs/swagger';

export enum FormMode {
  BASIC = 'basic',
  HTML = 'html',
  CSRF = 'csrf',
  DOM_BASED_CSRF = 'csrf_dom',
  OIDC = 'oidc',
}

export class LoginRequest {
  @ApiProperty({ example: 'john', required: true })
  user: string;

  @ApiProperty({ example: 'Pa55w0rd', required: true })
  password: string;

  @ApiProperty({
    enum: FormMode,
    required: true,
  })
  op?: string;

  csrf?: string;

  fingerprint?: string;
}
