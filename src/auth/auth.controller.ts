import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response, response } from 'express';
import { User } from 'src/model/user.entity';
import { LdapQueryHandler } from 'src/users/ldap.query.handler';
import { UsersService } from 'src/users/users.service';
import { LoginRequest } from './api/login.request';
import { LoginResponse } from './api/LoginResponse';
import { passwordMatches } from './credentials.utils';
import { AuthService, JwtProcessorType } from './auth.service';
import { AuthGuard } from './auth.guard';
import { JwtType } from './jwt/jwt.type.decorator';
import { JwtValidationResponse } from './api/JwtValidationResponse';
import { SWAGGER_DESC_loginWithKIDSqlJwt, SWAGGER_DESC_loginWithRSAJwtKeys, SWAGGER_DESC_loginWithWeakKeyJwt, SWAGGER_DESC_validateWithKIDSqlJwt, SWAGGER_DESC_validateWithWeakKeyJwt } from './auth.controller.swagger.desc';

@Controller('/api/auth')
@ApiTags('auth controller')
export class AuthController {
  private log: Logger = new Logger(AuthController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  private async login(
    req: LoginRequest,
    response: Response,
    jwtFactory: (user) => Promise<string>,
  ): Promise<void> {
    let user: User;
    try {
      user = await this.usersService.findByEmail(req.user);
    } catch (err) {
      throw new HttpException(
        {
          error: err.message,
          location: __filename,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (!user || !(await passwordMatches(req.password, user.password))) {
      throw new HttpException(
        {
          error: 'Invalid credentials',
          location: __filename,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
    response.header(
      'Authorization',
      await this.authService.createToken(
        { user: user.email },
        JwtProcessorType.RSA,
      ),
    );
    response
      .json({
        email: user.email,
        ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(user.email),
      })
      .end();
  }

  @Post('login')
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invliad credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithRSAJwtKeys
  })
  async loginWithRSAJwtKeys(
    @Body() req: LoginRequest,
    @Res() response: Response,
  ): Promise<void> {
    this.log.debug('Call loginWithRSAJwtKeys');
    return this.login(req, response, (user) =>
      this.authService.createToken({ user }, JwtProcessorType.RSA),
    );
  }

  @Post('jwt/kid-sql/login')
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invliad credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithKIDSqlJwt
  })
  async loginWithKIDSqlJwt(
    @Body() req: LoginRequest,
    @Res() response: Response,
  ): Promise<void> {
    this.log.debug('Call loginWithKIDSqlJwt');
    return this.login(req, response, (user) =>
      this.authService.createToken({ user }, JwtProcessorType.SQL_KID),
    );
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.SQL_KID)
  @Get('jwt/kid-sql/validate')
  @ApiResponse({
    type: JwtValidationResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invliad credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_validateWithKIDSqlJwt
  })
  async validateWithKIDSqlJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/weak-key/login')
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invliad credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithWeakKeyJwt
  })
  async loginWithWeakKeyJwt(
    @Body() req: LoginRequest,
    @Res() response: Response,
  ): Promise<void> {
    this.log.debug('Call loginWithKIDSqlJwt');
    return this.login(req, response, (user) =>
      this.authService.createToken({ user }, JwtProcessorType.WEAK_KEY),
    );
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.WEAK_KEY)
  @Get('jwt/weak-key/validate')
  @ApiOperation({
    description: SWAGGER_DESC_validateWithWeakKeyJwt
  })
  @ApiResponse({
    type: JwtValidationResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invliad credentials',
  })
  async validateWithWeakKeyJwt(
    @Body() req: LoginRequest,
    @Res() response: Response,
  ): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }
}
