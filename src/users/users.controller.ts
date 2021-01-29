import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Options,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CreateUserRequest } from './api/CreateUserRequest';
import { UserDto } from './api/UserDto';
import { LdapQueryHandler } from './ldap.query.handler';
import { UsersService } from './users.service';
import { Readable } from 'stream';
import { User } from '../model/user.entity';
import { AuthGuard } from '../auth/auth.guard';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { JwtProcessorType } from '../auth/auth.service';

@Controller('/api/users')
@ApiTags('user controller')
export class UsersController {
  private logger = new Logger(UsersController.name);
  private ldapQueryHandler = new LdapQueryHandler();

  constructor(private readonly usersService: UsersService) {}

  @Options()
  @Header('Allow', 'OPTIONS, GET, POST, DELETE')
  async getTestOptions(): Promise<void> {
    this.logger.debug(`Test OPTIONS`);
  }

  @Get('/one/:email')
  @ApiOperation({
    description: 'returns user',
  })
  @ApiResponse({
    type: UserDto,
    status: 200,
  })
  async getUser(@Param('email') email: string): Promise<UserDto> {
    try {
      this.logger.debug(`Find a user by email: ${email}`);
      return UserDto.convertToApi(await this.usersService.findByEmail(email));
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
  @Header('Content-Type', 'image/png')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'returns user profile photo',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'returns empty content if photo is not set',
  })
  async getUserPhoto(
    @Param('email') email: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
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
      readable.pipe(res);
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }

  @Get('/ldap')
  @ApiOperation({
    description: 'performs LDAP search for user details',
  })
  @ApiResponse({
    type: UserDto,
    isArray: true,
    status: 200,
  })
  async ldapQuery(@Query('query') query: string): Promise<UserDto[]> {
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

    return users.map<UserDto>(UserDto.convertToApi);
  }

  @Post()
  @ApiOperation({
    description: 'creates user',
  })
  @ApiResponse({
    type: UserDto,
    status: 200,
  })
  async createUser(@Body() user: CreateUserRequest): Promise<UserDto> {
    try {
      this.logger.debug(`Create a user: ${user}`);

      return UserDto.convertToApi(
        await this.usersService.createUser(
          user.email,
          user.firstName,
          user.lastName,
          user.password,
        ),
      );
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Put('/one/:email/photo')
  @ApiOperation({
    description: 'uploads user profile photo',
  })
  @UseInterceptors(AnyFilesInterceptor())
  async uploadFile(@Param('email') email: string, @UploadedFiles() files) {
    try {
      await this.usersService.updatePhoto(email, files[0].buffer);
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }
}
