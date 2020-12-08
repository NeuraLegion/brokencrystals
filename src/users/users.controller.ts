import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Logger,
  Options,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Stream } from 'stream';
import { CreateUserRequest } from './api/CreateUserRequest';
import { IUser } from './api/IUser';
import { LdapQueryHandler } from './ldap.query.handler';
import { UsersService } from './users.service';
import { Readable } from 'stream';

@Controller('/api/users')
@ApiTags('user controller')
export class UsersController {
  private log: Logger = new Logger(UsersController.name);
  private ldapQueryHandler: LdapQueryHandler = new LdapQueryHandler();

  constructor(private readonly usersService: UsersService) {}

  @Options()
  @Header('Allow', 'OPTIONS, GET, POST, DELETE')
  async getTestOptions(): Promise<void> {}

  @Get('/one/:email')
  @ApiOperation({
    description: 'returns user',
  })
  @ApiResponse({
    type: IUser,
  })
  async getUser(@Param('email') email: string): Promise<IUser> {
    try {
      this.log.debug('Called getUser');
      return IUser.convertToApi(await this.usersService.findByEmail(email));
    } catch (err) {
      throw new HttpException(
        {
          error: err.message,
          location: __filename,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

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
    @Res() response: Response,
  ): Promise<void> {
    this.log.debug('Called getUserPhoto');
    let user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new HttpException(
        {
          error: 'Could not file user',
          location: __filename,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      if (!user.photo) {
        response.status(HttpStatus.NO_CONTENT).end();
        return;
      }

      const readableInstanceStream = new Readable({
        read() {
          this.push(user.photo);
          this.push(null);
        },
      });
      readableInstanceStream.pipe(response);
    } catch (err) {
      throw new HttpException(
        {
          error: err.message,
          location: __filename,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/ldap')
  @ApiOperation({
    description: 'performs LDAP search for user details',
  })
  @ApiResponse({
    type: IUser,
  })
  async ldapQuery(@Query('query') query: string): Promise<IUser> {
    try {
      let email = this.ldapQueryHandler.parseQuery(query);
      let user = await this.usersService.findByEmail(email);
      if (!user) {
        throw new HttpException('User not found in ldap', HttpStatus.NOT_FOUND);
      }
      return IUser.convertToApi(user);
    } catch (err) {
      throw new HttpException(
        {
          error: err.message,
          location: __filename,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @ApiOperation({
    description: 'creates user',
  })
  @ApiResponse({
    type: IUser,
  })
  async createUser(@Body() user: CreateUserRequest): Promise<IUser> {
    try {
      this.log.debug('Called createUser');
      return IUser.convertToApi(
        await this.usersService.createUser(
          user.email,
          user.firstName,
          user.lastName,
          user.password,
        ),
      );
    } catch (err) {
      throw new HttpException(
        {
          error: err.message,
          location: __filename,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('/one/:email/photo')
  @ApiOperation({
    description: 'uploads user profile photo',
  })
  @UseInterceptors(AnyFilesInterceptor())
  async uploadFile(@Param('email') email: string, @UploadedFiles() files) {
    try {
      await this.usersService.updatePhoto(email, files[0].buffer);
    } catch (err) {
      throw new HttpException(
        {
          error: err.message,
          location: __filename,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
