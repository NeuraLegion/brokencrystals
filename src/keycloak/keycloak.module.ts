import { Module } from '@nestjs/common';
import { KeyCloakService } from './keycloak.service';

@Module({
  imports: [],
  providers: [KeyCloakService],
  exports: [KeyCloakService],
})
export class KeyCloakModule {}
