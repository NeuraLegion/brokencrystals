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
import { Response } from 'express';
import { HttpClientService } from 'src/httpclient/httpclient.service';
import { User } from 'src/model/user.entity';
import { LdapQueryHandler } from 'src/users/ldap.query.handler';
import { UsersService } from 'src/users/users.service';
import { JwtValidationResponse } from './api/JwtValidationResponse';
import { LoginRequest } from './api/login.request';
import { LoginResponse } from './api/LoginResponse';
import {
  SWAGGER_DESC_loginWithJKUJwt,
  SWAGGER_DESC_loginWithJWKJwt,
  SWAGGER_DESC_loginWithKIDSqlJwt,
  SWAGGER_DESC_loginWithRSAJwtKeys,
  SWAGGER_DESC_loginWithWeakKeyJwt,
  SWAGGER_DESC_loginWithX5CJwt,
  SWAGGER_DESC_loginWithX5UJwt,
  SWAGGER_DESC_validateWithJKUJwt,
  SWAGGER_DESC_validateWithJWKJwt,
  SWAGGER_DESC_validateWithKIDSqlJwt,
  SWAGGER_DESC_validateWithWeakKeyJwt,
  SWAGGER_DESC_validateWithX5CJwt,
  SWAGGER_DESC_validateWithX5UJwt,
} from './auth.controller.swagger.desc';
import { AuthGuard } from './auth.guard';
import { AuthService, JwtProcessorType } from './auth.service';
import { passwordMatches } from './credentials.utils';
import { JwtType } from './jwt/jwt.type.decorator';

@Controller('/api/auth')
@ApiTags('auth controller')
export class AuthController {
  private log: Logger = new Logger(AuthController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly httpClient: HttpClientService,
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
    response.header('Authorization', await jwtFactory(user.email));
    response
      .json({
        email: user.email,
        ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(user.email),
      })
      .end();
  }


  @Post('/admin/login')
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithRSAJwtKeys,
  })
  async loginWithRSAJwtKeysAdmin(
    @Body() req: LoginRequest,
    @Res() response: Response,
  ): Promise<void> {
    this.log.debug('Call loginWithRSAJwtKeysAdmin');
    this.loginWithRSAJwtKeys(req, response);
  }

  @Post('login')
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithRSAJwtKeys,
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
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithKIDSqlJwt,
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
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_validateWithKIDSqlJwt,
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
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithWeakKeyJwt,
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
    description: SWAGGER_DESC_validateWithWeakKeyJwt,
  })
  @ApiResponse({
    type: JwtValidationResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  async validateWithWeakKeyJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/jku/login')
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithJKUJwt,
  })
  async loginWithJKUJwt(
    @Body() req: LoginRequest,
    @Res() response: Response,
  ): Promise<void> {
    this.log.debug('Call loginWithJKUJwt');
    return this.login(req, response, (user) =>
      this.authService.createToken({ user }, JwtProcessorType.JKU),
    );
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.JKU)
  @Get('jwt/jku/validate')
  @ApiOperation({
    description: SWAGGER_DESC_validateWithJKUJwt,
  })
  @ApiResponse({
    type: JwtValidationResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  async validateWithJKUJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/jwk/login')
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithJWKJwt,
  })
  async loginWithJWKJwt(
    @Body() req: LoginRequest,
    @Res() response: Response,
  ): Promise<void> {
    this.log.debug('Call loginWithJWKJwt');
    return this.login(req, response, (user) =>
      this.authService.createToken({ user }, JwtProcessorType.JWK),
    );
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.JWK)
  @Get('jwt/jwk/validate')
  @ApiOperation({
    description: SWAGGER_DESC_validateWithJWKJwt,
  })
  @ApiResponse({
    type: JwtValidationResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  async validateWithJWKJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/x5c/login')
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithX5CJwt,
  })
  async loginWithX5CJwt(
    @Body() req: LoginRequest,
    @Res() response: Response,
  ): Promise<void> {
    this.log.debug('Call loginWithX5CJwt');
    return this.login(req, response, (user) =>
      this.authService.createToken({ user }, JwtProcessorType.X5C),
    );
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.X5C)
  @Get('jwt/x5c/validate')
  @ApiOperation({
    description: SWAGGER_DESC_validateWithX5CJwt,
  })
  @ApiResponse({
    type: JwtValidationResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  async validateWithX5CJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/x5u/login')
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_loginWithX5UJwt,
  })
  async loginWithX5UJwt(
    @Body() req: LoginRequest,
    @Res() response: Response,
  ): Promise<void> {
    this.log.debug('Call loginWithX5UJwt');
    return this.login(req, response, (user) =>
      this.authService.createToken({ user }, JwtProcessorType.X5U),
    );
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.X5U)
  @Get('jwt/x5u/validate')
  @ApiOperation({
    description: SWAGGER_DESC_validateWithX5UJwt,
  })
  @ApiResponse({
    type: JwtValidationResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invalid credentials',
  })
  async validateWithX5UJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }
}
