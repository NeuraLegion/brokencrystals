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
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { User } from '../model/user.entity';
import { LdapQueryHandler } from '../users/ldap.query.handler';
import { UsersService } from '../users/users.service';
import { JwtValidationResponse } from './api/JwtValidationResponse';
import { FormMode, LoginRequest } from './api/login.request';
import { LoginResponse } from './api/LoginResponse';
import { OidcClientResponse } from './api/OidcClientResponse';
import {
  SWAGGER_DESC_LOGIN_WITH_JKU_JWT,
  SWAGGER_DESC_LOGIN_WITH_JWK_JWT,
  SWAGGER_DESC_LOGIN_WITH_KID_SQL_JWT,
  SWAGGER_DESC_LOGIN_WITH_RSA_JWT_KEYS,
  SWAGGER_DESC_LOGIN_WITH_WEAK_KEY_JWT,
  SWAGGER_DESC_LOGIN_WITH_X5C_JWT,
  SWAGGER_DESC_LOGIN_WITH_X5U_JWT,
  SWAGGER_DESC_VALIDATE_WITH_JKU_JWT,
  SWAGGER_DESC_VALIDATE_WITH_JWK_JWT,
  SWAGGER_DESC_VALIDATE_WITH_KID_SQL_JWT,
  SWAGGER_DESC_VALIDATE_WITH_WEAK_KEY_JWT,
  SWAGGER_DESC_VALIDATE_WITH_X5C_JWT,
  SWAGGER_DESC_VALIDATE_WITH_X5U_JWT,
  SWAGGER_DESC_CALL_OIDC_CLIENT,
  SWAGGER_DESC_REQUEST_WITH_DOM_CSRF_TOKEN,
  SWAGGER_DESC_REQUEST_WITH_SIMPLE_CSRF_TOKEN,
  SWAGGER_DESC_LOGIN_WITH_HMAC_JWT,
  SWAGGER_DESC_VALIDATE_WITH_HMAC_JWT,
  SWAGGER_DESC_VALIDATE_WITH_RSA_SIGNATURE_JWT,
} from './auth.controller.swagger.desc';
import { AuthGuard } from './auth.guard';
import { AuthService, JwtProcessorType } from './auth.service';
import { passwordMatches } from './credentials.utils';
import { JwtType } from './jwt/jwt.type.decorator';
import { FastifyReply, FastifyRequest } from 'fastify';
import { CsrfGuard } from './csrf.guard';
import { ClientType, KeyCloakService } from '../keycloak/keycloak.service';
import { LoginJwtResponse } from './api/LoginJwtResponse';

interface LoginData {
  email: string;
  ldapProfileLink: string;
  token: string;
}

@Controller('/api/auth')
@ApiTags('Auth controller')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly CSRF_COOKIE_HEADER = '_csrf';

  constructor(
    private readonly usersService: UsersService,
    private readonly keyCloakService: KeyCloakService,
    private readonly authService: AuthService,
  ) {}

  @Post('/admin/login')
  @ApiCreatedResponse({
    type: LoginResponse,
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_RSA_JWT_KEYS,
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
  @ApiCreatedResponse({
    type: LoginResponse,
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_RSA_JWT_KEYS,
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

  @Get('jwt/rsa/signature/validate')
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA_SIGNATURE)
  @ApiOkResponse({
    type: JwtValidationResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    description: SWAGGER_DESC_VALIDATE_WITH_RSA_SIGNATURE_JWT,
  })
  async validateWithRSASignatureJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Get('dom-csrf-flow')
  @ApiOperation({
    description: SWAGGER_DESC_REQUEST_WITH_DOM_CSRF_TOKEN,
  })
  @ApiBadRequestResponse({
    description: 'Bad request, fingerprint is required',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
  })
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
  @ApiOperation({
    description: SWAGGER_DESC_REQUEST_WITH_SIMPLE_CSRF_TOKEN,
  })
  @ApiOkResponse({
    description: 'Returns simple csrf token',
  })
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
  @ApiResponse({
    type: OidcClientResponse,
    status: HttpStatus.OK,
  })
  @ApiOperation({
    description: SWAGGER_DESC_CALL_OIDC_CLIENT,
  })
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
  @ApiCreatedResponse({
    type: LoginJwtResponse,
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_KID_SQL_JWT,
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

  @Get('jwt/kid-sql/validate')
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.SQL_KID)
  @ApiOkResponse({
    type: JwtValidationResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    description: SWAGGER_DESC_VALIDATE_WITH_KID_SQL_JWT,
  })
  async validateWithKIDSqlJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/weak-key/login')
  @ApiCreatedResponse({
    type: LoginJwtResponse,
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_WEAK_KEY_JWT,
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

  @Get('jwt/weak-key/validate')
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.WEAK_KEY)
  @ApiOperation({
    description: SWAGGER_DESC_VALIDATE_WITH_WEAK_KEY_JWT,
  })
  @ApiOkResponse({
    type: JwtValidationResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  async validateWithWeakKeyJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/jku/login')
  @ApiCreatedResponse({
    type: LoginJwtResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_JKU_JWT,
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

  @Get('jwt/jku/validate')
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.JKU)
  @ApiOperation({
    description: SWAGGER_DESC_VALIDATE_WITH_JKU_JWT,
  })
  @ApiOkResponse({
    type: JwtValidationResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  async validateWithJKUJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/jwk/login')
  @ApiCreatedResponse({
    type: LoginJwtResponse,
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_JWK_JWT,
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

  @Get('jwt/jwk/validate')
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.JWK)
  @ApiOperation({
    description: SWAGGER_DESC_VALIDATE_WITH_JWK_JWT,
  })
  @ApiOkResponse({
    type: JwtValidationResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  async validateWithJWKJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/x5c/login')
  @ApiCreatedResponse({
    type: LoginJwtResponse,
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_X5C_JWT,
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

  @Get('jwt/x5c/validate')
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.X5C)
  @ApiOperation({
    description: SWAGGER_DESC_VALIDATE_WITH_X5C_JWT,
  })
  @ApiOkResponse({
    type: JwtValidationResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  async validateWithX5CJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/x5u/login')
  @ApiCreatedResponse({
    type: LoginJwtResponse,
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_X5U_JWT,
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

  @Get('jwt/x5u/validate')
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.X5U)
  @ApiOperation({
    description: SWAGGER_DESC_VALIDATE_WITH_X5U_JWT,
  })
  @ApiOkResponse({
    type: JwtValidationResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  async validateWithX5UJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  @Post('jwt/hmac/login')
  @ApiCreatedResponse({
    type: LoginJwtResponse,
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
    description: 'invalid credentials',
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_HMAC_JWT,
  })
  async loginWithHMACJwt(
    @Body() req: LoginRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithHMACJwt');
    const profile = await this.login(req);

    res.header(
      'authorization',
      await this.authService.createToken(
        { user: profile.email },
        JwtProcessorType.HMAC,
      ),
    );

    return profile;
  }

  @Get('jwt/hmac/validate')
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.HMAC)
  @ApiOperation({
    description: SWAGGER_DESC_VALIDATE_WITH_HMAC_JWT,
  })
  @ApiOkResponse({
    type: JwtValidationResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'invalid credentials',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  async validateWithHMACJwt(): Promise<JwtValidationResponse> {
    return {
      secret: 'this is our secret',
    };
  }

  private async loginOidc(req: LoginRequest): Promise<LoginData> {
    try {
      const { token_type, access_token } =
        await this.keyCloakService.generateToken({
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
