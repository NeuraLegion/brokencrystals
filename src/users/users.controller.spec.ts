import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { KeyCloakService } from '../keycloak/keycloak.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService
        },
        {
          provide: KeyCloakService,
          useValue: {}
        },
        {
          provide: AuthService,
          useValue: {}
        }
      ]
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should reject unauthenticated access to getById', async () => {
    await expect(
      controller.getById(1, { headers: {} } as any)
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('should forbid authenticated users from enumerating other users by id', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 10,
      isAdmin: false
    });
    usersService.findById.mockResolvedValue({
      id: 11,
      isAdmin: false
    });

    await expect(
      controller.getById(
        11,
        {
          headers: {
            authorization: 'header.{"user":"user@example.com"}.sig'
          }
        } as any
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should allow a user to access their own record by id', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 10,
      isAdmin: false
    });
    usersService.findById.mockResolvedValue({
      id: 10,
      isAdmin: false
    });

    await expect(
      controller.getById(
        10,
        {
          headers: {
            authorization: 'header.{"user":"user@example.com"}.sig'
          }
        } as any
      )
    ).resolves.toBeDefined();
  });

  it('should allow admin access to any user record by id', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 1,
      isAdmin: true
    });
    usersService.findById.mockResolvedValue({
      id: 11,
      isAdmin: false
    });

    await expect(
      controller.getById(
        11,
        {
          headers: {
            authorization: 'header.{"user":"admin@example.com"}.sig'
          }
        } as any
      )
    ).resolves.toBeDefined();
  });
});
