import { Test, TestingModule } from '@nestjs/testing';
import { HttpClientService } from '../httpclient/httpclient.service';
import { KeyCloakService } from '../keycloak/keycloak.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, KeyCloakService, HttpClientService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
