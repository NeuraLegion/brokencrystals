import { Module } from '@nestjs/common';
import { HttpClientService } from '../httpclient/httpclient.service';
import { KeyCloakService } from './keycloak.service';

@Module({
  imports: [],
  providers: [KeyCloakService, HttpClientService],
  exports: [KeyCloakService, HttpClientService],
})
export class KeyCloakModule {}
