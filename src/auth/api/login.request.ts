import { ApiProperty } from '@nestjs/swagger';

export enum FormMode {
  BASIC = 'basic',
  HTML = 'html',
  CSRF = 'csrf',
  DOM_BASED_CSRF = 'csrf_dom',
  OIDC = 'oidc',
}

export class LoginRequest {
  @ApiProperty()
  user: string;

  @ApiProperty()
  password: string;

  @ApiProperty({
    enum: FormMode,
  })
  op?: string;

  csrf?: string;

  fingerprint?: string;
}
