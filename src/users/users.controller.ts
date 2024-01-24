import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  ForbiddenException,
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
  SerializeOptions,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateUserRequest, SignupMode } from './api/CreateUserRequest';
import { UserDto } from './api/UserDto';
import { LdapQueryHandler } from './ldap.query.handler';
import { UsersService } from './users.service';
import { User } from '../model/user.entity';
import { AuthGuard } from '../auth/auth.guard';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { JwtProcessorType } from '../auth/auth.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AnyFilesInterceptor } from '../components/any-files.interceptor';
import { KeyCloakService } from '../keycloak/keycloak.service';
import {
  SWAGGER_DESC_CREATE_BASIC_USER,
  SWAGGER_DESC_PHOTO_USER_BY_EMAIL,
  SWAGGER_DESC_FIND_USER,
  SWAGGER_DESC_LDAP_SEARCH,
  SWAGGER_DESC_OPTIONS_REQUEST,
  SWAGGER_DESC_UPLOAD_USER_PHOTO,
  SWAGGER_DESC_CREATE_OIDC_USER,
  SWAGGER_DESC_UPDATE_USER_INFO,
  SWAGGER_DESC_ADMIN_RIGHTS,
  SWAGGER_DESC_FIND_USERS,
  SWAGGER_DESC_FIND_FULL_USER_INFO,
  SWAGGER_DESC_DELETE_PHOTO_USER_BY_ID,
} from './users.controller.swagger.desc';
import { AdminGuard } from './users.guard';
import { PermissionDto } from './api/PermissionDto';
import { BASIC_USER_INFO, FULL_USER_INFO } from './api/UserDto';
import { parseXml } from 'libxmljs';

@Controller('/api/users')
@UseInterceptors(ClassSerializerInterceptor)
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
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @SerializeOptions({ groups: [BASIC_USER_INFO] })
  @ApiOperation({
    description: SWAGGER_DESC_FIND_USER,
  })
  @ApiOkResponse({
    type: UserDto,
    description: 'Returns basic user info if it exists',
  })
  @ApiNotFoundResponse({
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  async getByEmail(@Param('email') email: string): Promise<UserDto> {
    try {
      this.logger.debug(`Find a user by email: ${email}`);
      return new UserDto(await this.usersService.findByEmail(email));
    } catch (err) {
      throw new HttpException(err.message, err.status);
    }
  }

  @Get('/id/:id')
  @ApiQuery({ name: 'id', example: 1, required: true })
  @SerializeOptions({ groups: [BASIC_USER_INFO] })
  @ApiOperation({
    description: SWAGGER_DESC_FIND_USER,
  })
  @ApiOkResponse({
    type: UserDto,
    description: 'Returns basic user info if it exists',
  })
  @ApiNotFoundResponse({
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  async getById(@Param('id') id: number): Promise<UserDto> {
    try {
      this.logger.debug(`Find a user by id: ${id}`);
      return new UserDto(await this.usersService.findById(id));
    } catch (err) {
      throw new HttpException(err.message, err.status);
    }
  }

  @Get('/fullinfo/:email')
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @SerializeOptions({ groups: [FULL_USER_INFO] })
  @ApiOperation({
    description: SWAGGER_DESC_FIND_FULL_USER_INFO,
  })
  @ApiOkResponse({
    type: UserDto,
    description: 'Returns full user info if it exists',
  })
  @ApiNotFoundResponse({
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  async getFullUserInfo(@Param('email') email: string): Promise<UserDto> {
    try {
      this.logger.debug(`Find a full user info by email: ${email}`);
      return new UserDto(await this.usersService.findByEmail(email));
    } catch (err) {
      throw new HttpException(err.message, err.status);
    }
  }

  @Get('/search/:name')
  @ApiQuery({ name: 'name', example: 'john', required: true })
  @SerializeOptions({ groups: [FULL_USER_INFO] })
  @ApiOperation({
    description: SWAGGER_DESC_FIND_USERS,
  })
  @ApiOkResponse({
    type: UserDto,
    description: SWAGGER_DESC_FIND_USERS,
  })
  async searchByName(@Param('name') name: string): Promise<UserDto[]> {
    try {
      this.logger.debug(`Search users by name: ${name}`);
      const users = await this.usersService.searchByName(name, 50);
      return users.map((user) => new UserDto(user));
    } catch (err) {
      throw new HttpException(err.message, err.status);
    }
  }

  @Get('/one/:email/photo')
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: SWAGGER_DESC_PHOTO_USER_BY_EMAIL,
  })
  @ApiOkResponse({
    description: 'Returns user profile photo',
  })
  @ApiNoContentResponse({
    description: 'Returns empty content if photo is not set',
  })
  @ApiForbiddenResponse({
    description: 'Returns then user is not authenticated',
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
      return user.photo;
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }

  @Delete('/one/:id/photo')
  @ApiQuery({ name: 'id', example: 1, required: true })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: SWAGGER_DESC_DELETE_PHOTO_USER_BY_ID,
  })
  @ApiOkResponse({
    description: 'Deletes user profile photo',
  })
  @ApiNoContentResponse({
    description: 'Returns empty content if there was no user profile photo',
  })
  @ApiForbiddenResponse({
    description: 'Returns when user is not authenticated',
  })
  @ApiUnauthorizedResponse({
    description: 'Returns when isAdmin is false',
  })
  async deleteUserPhotoById(
    @Param('id') id: number,
    @Query('isAdmin') isAdminParam: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    isAdminParam = isAdminParam.toLowerCase();
    const isAdmin =
      isAdminParam === 'true' || isAdminParam === '1' ? true : false;
    if (!isAdmin) {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException({
        error: 'Could not file user',
        location: __filename,
      });
    }

    await this.usersService.deletePhoto(id);
  }

  @Get('/ldap')
  @ApiQuery({
    name: 'query',
    example:
      '(&(objectClass=person)(objectClass=user)(email=john.doe@example.com))',
    required: true,
  })
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
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
    description: 'User Already exists',
  })
  @ApiCreatedResponse({
    type: UserDto,
    description: 'User created',
  })
  async createUser(@Body() user: CreateUserRequest): Promise<UserDto> {
    try {
      this.logger.debug(`Create a basic user: ${user}`);

      const userExists = await this.doesUserExist(user);
      if (userExists) {
        throw new HttpException('User already exists', HttpStatus.CONFLICT);
      }

      return new UserDto(
        await this.usersService.createUser(user, user.op === SignupMode.BASIC),
      );
    } catch (err) {
      throw new HttpException(
        err.message ?? 'Something went wrong',
        err.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('/oidc')
  @ApiOperation({
    description: SWAGGER_DESC_CREATE_OIDC_USER,
  })
  @ApiConflictResponse({
    schema: {
      type: 'object',
      properties: {
        errorMessage: { type: 'string' },
      },
    },
    description: 'User Already exists',
  })
  @ApiCreatedResponse({
    description: 'User created, returns empty object',
  })
  async createOIDCUser(@Body() user: CreateUserRequest): Promise<UserDto> {
    try {
      this.logger.debug(`Create a OIDC user: ${user}`);

      const userExists = await this.doesUserExist(user);

      if (userExists) {
        throw new HttpException('User already exists', HttpStatus.CONFLICT);
      }

      const keycloakUser = new UserDto(
        await this.keyCloakService.registerUser({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          password: user.password,
        }),
      );

      this.createUser(user);

      return keycloakUser;
    } catch (err) {
      throw new HttpException(
        err.response.data ?? 'Something went wrong',
        err.response.status ?? 500,
      );
    }
  }

  @Put('/one/:email/info')
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: SWAGGER_DESC_UPDATE_USER_INFO,
  })
  @ApiForbiddenResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Returns updated user',
  })
  async changeUserInfo(
    @Body() newData: UserDto,
    @Param('email') email: string,
    @Req() req: FastifyRequest,
  ): Promise<UserDto> {
    try {
      const user = await this.usersService.findByEmail(email);
      if (!user) {
        throw new NotFoundException('Could not find user');
      }
      if (this.originEmail(req) !== email) {
        throw new ForbiddenException();
      }
      return new UserDto(await this.usersService.updateUserInfo(user, newData));
    } catch (err) {
      throw new HttpException(
        err.message || 'Internal server error',
        err.status || 500,
      );
    }
  }

  @Get('/one/:email/info')
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: SWAGGER_DESC_FIND_USER,
  })
  @ApiForbiddenResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse()
  @ApiOkResponse({
    description: 'Returns user info',
  })
  async getUserInfo(
    @Param('email') email: string,
    @Req() req: FastifyRequest,
  ): Promise<UserDto> {
    try {
      const user = await this.usersService.findByEmail(email);

      if (!user) {
        throw new NotFoundException('Could not find user');
      }
      if (this.originEmail(req) !== email) {
        throw new ForbiddenException();
      }
      return new UserDto(user);
    } catch (err) {
      throw new HttpException(
        err.message || 'Internal server error',
        err.status || 500,
      );
    }
  }

  @Get('/one/:email/adminpermission')
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @UseGuards(AuthGuard, AdminGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: SWAGGER_DESC_ADMIN_RIGHTS,
  })
  @ApiForbiddenResponse({
    description: 'user has no admin rights',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Returns true if user has admin rights',
  })
  getAdminStatus(@Param('email') email: string): Promise<PermissionDto> {
    return this.usersService.getPermissions(email);
  }

  @Put('/one/:email/photo')
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: SWAGGER_DESC_UPLOAD_USER_PHOTO,
  })
  @ApiOkResponse({
    description: 'Photo updated',
  })
  @UseInterceptors(AnyFilesInterceptor)
  async uploadFile(@Param('email') email: string, @Req() req: FastifyRequest) {
    try {
      const file = await req.file();
      const file_name = file.filename;
      const file_buffer = await file.toBuffer();

      if (file_name.endsWith('.svg')) {
        const xml = file_buffer.toString();
        const xmlDoc = parseXml(xml, {
          dtdload: true,
          noent: true,
          doctype: true,
          dtdvalid: true,
          errors: true,
          recover: true,
        });
        await this.usersService.updatePhoto(
          email,
          Buffer.from(xmlDoc.toString(), 'utf8'),
        );
        return xmlDoc.toString(true);
      } else {
        await this.usersService.updatePhoto(email, file_buffer);
      }
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }

  public originEmail(request: FastifyRequest): string {
    return JSON.parse(
      Buffer.from(
        request.headers.authorization.split('.')[1],
        'base64',
      ).toString(),
    ).user;
  }

  private async doesUserExist(user: UserDto): Promise<boolean> {
    try {
      const userExists = await this.usersService.findByEmail(user.email);
      if (userExists) {
        return true;
      }
    } catch (err) {
      if (err.status === HttpStatus.NOT_FOUND) {
        return false;
      }
      throw new HttpException(
        err.message ?? 'Something went wrong',
        err.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
