import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '../model/user.entity';
import { LdapQueryHandler } from '../users/ldap.query.handler';
import { UsersService } from '../users/users.service';
import { JwtValidationResponse } from './api/JwtValidationResponse';
import { FormMode, LoginRequest } from './api/login.request';
import { LoginResponse } from './api/LoginResponse';
import { OidcClientResponse } from './api/OidcClientResponse';
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
import { FastifyReply, FastifyRequest } from 'fastify';
import { CsrfGuard } from './csrf.guard';
import { ClientType, KeyCloakService } from '../keycloak/keycloak.service';

interface LoginData {
  email: string;
  ldapProfileLink: string;
  token: string;
}

@Controller('/api/auth')
@ApiTags('auth controller')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly CSRF_COOKIE_HEADER = '_csrf';

  constructor(
    private readonly usersService: UsersService,
    private readonly keyCloakService: KeyCloakService,
    private readonly authService: AuthService,
  ) {}

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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithRSAJwtKeysAdmin');
    return this.loginWithRSAJwtKeys(req, res);
  }

  @Post('login')
  @UseGuards(CsrfGuard)
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithRSAJwtKeys');

    let loginData: LoginData;

    if (req.op === FormMode.OIDC) {
      loginData = await this.loginOidc(req);
    } else {
      loginData = await this.login(req);
    }

    const { token, ...loginResponse } = loginData;

    res.header('authorization', token);

    return loginResponse;
  }

  @Get('dom-csrf-flow')
  async getDomCsrfToken(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<string> {
    this.logger.debug('Call getDomCsrfToken');

    const fp = request.headers['fingerprint'] as string;

    if (!fp) {
      throw new BadRequestException('Fingerprint  header is required');
    }
    const token = createHash('md5').update(fp).digest('hex');

    res.setCookie(this.CSRF_COOKIE_HEADER, token, {
      httpOnly: true,
      sameSite: 'strict',
    });

    return token;
  }

  @Get('simple-csrf-flow')
  async getCsrfToken(
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<string> {
    this.logger.debug('Call getCsrfToken');

    const token = randomBytes(32).toString('base64').substring(0, 32);
    res.setCookie(this.CSRF_COOKIE_HEADER, token, {
      httpOnly: true,
      sameSite: 'strict',
    });
    return token;
  }

  @Get('oidc-client')
  async getOidcClient(): Promise<OidcClientResponse> {
    this.logger.debug('Call getOidcClient');

    const client = this.keyCloakService.getClient(ClientType.PUBLIC);

    return {
      clientId: client.client_id,
      clientSecret: client.client_secret,
      metadataUrl: client.metadata_url,
    };
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithKIDSqlJwt');
    const profile = await this.login(req);

    res.header(
      'authorization',
      await this.authService.createToken(
        { user: profile.email },
        JwtProcessorType.SQL_KID,
      ),
    );

    return profile;
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithKIDSqlJwt');
    const profile = await this.login(req);

    res.header(
      'authorization',
      await this.authService.createToken(
        { user: profile.email },
        JwtProcessorType.WEAK_KEY,
      ),
    );

    return profile;
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithJKUJwt');
    const profile = await this.login(req);

    res.header(
      'authorization',
      await this.authService.createToken(
        { user: profile.email },
        JwtProcessorType.JKU,
      ),
    );

    return profile;
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithJWKJwt');
    const profile = await this.login(req);

    res.header(
      'authorization',
      await this.authService.createToken(
        { user: profile.email },
        JwtProcessorType.JWK,
      ),
    );

    return profile;
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithX5CJwt');
    const profile = await this.login(req);

    res.header(
      'authorization',
      await this.authService.createToken(
        { user: profile.email },
        JwtProcessorType.X5C,
      ),
    );

    return profile;
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithX5UJwt');
    const profile = await this.login(req);

    res.header(
      'Authorization',
      await this.authService.createToken(
        { user: profile.email },
        JwtProcessorType.X5U,
      ),
    );

    return profile;
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

  private async loginOidc(req: LoginRequest): Promise<LoginData> {
    try {
      const {
        token_type,
        access_token,
      } = await this.keyCloakService.generateToken({
        username: req.user,
        password: req.password,
      });

      return {
        email: req.user,
        ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(req.user),
        token: `${token_type} ${access_token}`,
      };
    } catch (err) {
      if (err.response.status === 401) {
        throw new UnauthorizedException({
          error: 'Invalid credentials',
          location: __filename,
        });
      }

      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }

  private async login(req: LoginRequest): Promise<LoginData> {
    let user: User;

    try {
      user = await this.usersService.findByEmail(req.user);
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }

    if (!user || !(await passwordMatches(req.password, user.password))) {
      throw new UnauthorizedException({
        error: 'Invalid credentials',
        location: __filename,
      });
    }

    const token = await this.authService.createToken(
      {
        user: user.email,
        exp: 90 + Math.floor(Date.now() / 1000),
      },
      JwtProcessorType.RSA,
    );

    return {
      token,
      email: user.email,
      ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(user.email),
    };
  }
}
