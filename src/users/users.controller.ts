import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Options,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateUserRequest } from './api/CreateUserRequest';
import { UserDto } from './api/UserDto';
import { LdapQueryHandler } from './ldap.query.handler';
import { UsersService } from './users.service';
import { Readable } from 'stream';
import { User } from '../model/user.entity';
import { AuthGuard } from '../auth/auth.guard';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { JwtProcessorType } from '../auth/auth.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AnyFilesInterceptor } from '../components/any-files.interceptor';
import { KeyCloakService } from '../keycloak/keycloak.service';
import {
  SWAGGER_DESC_CREATE_BASIC_USER,
  SWAGGER_DESC_FIND_USER_BY_EMAIL,
  SWAGGER_DESC_LDAP_SEARCH,
  SWAGGER_DESC_OPTIONS_REQUEST,
  SWAGGER_DESC_UPLOAD_USER_PHOTO,
} from './users.controller.swagger.desc';

@Controller('/api/users')
@ApiTags('User controller')
export class UsersController {
  private logger = new Logger(UsersController.name);
  private ldapQueryHandler = new LdapQueryHandler();

  constructor(
    private readonly usersService: UsersService,
    private readonly keyCloakService: KeyCloakService,
  ) {}

  @Options()
  @ApiOperation({
    description: SWAGGER_DESC_OPTIONS_REQUEST,
  })
  @Header('Access-Control-Request-Headers', 'OPTIONS, GET, POST, DELETE')
  async getTestOptions(): Promise<void> {
    this.logger.debug(`Test OPTIONS`);
  }

  @Get('/one/:email')
  @ApiOperation({
    description: SWAGGER_DESC_FIND_USER_BY_EMAIL,
  })
  @ApiOkResponse({
    type: UserDto,
    description: 'Returns empty object when user is not found',
  })
  async getUser(@Param('email') email: string): Promise<UserDto> {
    try {
      this.logger.debug(`Find a user by email: ${email}`);
      return new UserDto(await this.usersService.findByEmail(email));
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Get('/one/:email/photo')
  @ApiOkResponse({
    description: 'Returns user profile photo',
  })
  @ApiNoContentResponse({
    description: 'Returns empty content if photo is not set',
  })
  @ApiForbiddenResponse({
    description: 'Returns this status is user is not authenticated',
  })
  async getUserPhoto(
    @Param('email') email: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.logger.debug(`Find a user photo by email: ${email}`);
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException({
        error: 'Could not file user',
        location: __filename,
      });
    }

    if (!user.photo) {
      res.status(HttpStatus.NO_CONTENT);
      return;
    }

    try {
      const readable = new Readable({
        read() {
          this.push(user.photo);
          this.push(null);
        },
      });
      res.type('image/png');
      return readable;
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }

  @Get('/ldap')
  @ApiOperation({
    description: SWAGGER_DESC_LDAP_SEARCH,
  })
  @ApiOkResponse({
    type: UserDto,
    isArray: true,
  })
  async ldapQuery(@Query('query') query: string): Promise<UserDto[]> {
    this.logger.debug(`Call ldapQuery: ${query}`);
    let users: User[];

    try {
      const email = this.ldapQueryHandler.parseQuery(query);

      if (email && email.endsWith('*')) {
        users = await this.usersService.findByEmailPrefix(email.slice(0, -1));
      } else {
        const user = await this.usersService.findByEmail(email);

        if (user) {
          users = [user];
        }
      }
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }

    if (!users) {
      throw new NotFoundException('User not found in ldap');
    }

    return users.map((user: User) => new UserDto(user));
  }

  @Post('/basic')
  @ApiOperation({
    description: SWAGGER_DESC_CREATE_BASIC_USER,
  })
  @ApiConflictResponse({
    type: Error,
    description: 'User Already exists',
  })
  @ApiCreatedResponse({
    type: UserDto,
    description: 'User created',
  })
  async createUser(@Body() user: CreateUserRequest): Promise<UserDto> {
    try {
      this.logger.debug(`Create a basic user: ${user}`);

      const userExists = await this.usersService.findByEmail(user.email);

      if (userExists) {
        throw new HttpException('User already exists', 409);
      }

      return new UserDto(
        await this.usersService.createUser(
          user.email,
          user.firstName,
          user.lastName,
          user.password,
        ),
      );
    } catch (err) {
      throw new HttpException(
        err.message ?? 'Something went wrong',
        err.status ?? 500,
      );
    }
  }

  @Post('/oidc')
  @ApiOperation({
    description: '',
  })
  @ApiConflictResponse({
    type: Error,
    description: 'User Already exists',
  })
  @ApiCreatedResponse({
    type: UserDto,
    description: 'User created',
  })
  async createOIDCUser(@Body() user: CreateUserRequest): Promise<UserDto> {
    try {
      this.logger.debug(`Create a OIDC user: ${user}`);

      return new UserDto(
        await this.keyCloakService.registerUser({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          password: user.password,
        }),
      );
    } catch (err) {
      throw new HttpException(
        err.response.data ?? 'Something went wrong',
        err.response.status ?? 500,
      );
    }
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Put('/one/:email/photo')
  @ApiOperation({
    description: SWAGGER_DESC_UPLOAD_USER_PHOTO,
  })
  @UseInterceptors(AnyFilesInterceptor)
  async uploadFile(@Param('email') email: string, @Req() req: FastifyRequest) {
    try {
      const file = await req.file();
      await this.usersService.updatePhoto(email, await file.toBuffer());
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }
}
