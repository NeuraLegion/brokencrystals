import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '../model/user.entity';
import { LdapQueryHandler } from '../users/ldap.query.handler';
import { UsersService } from '../users/users.service';
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
import { FastifyReply } from 'fastify';

@Controller('/api/auth')
@ApiTags('auth controller')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  private async login(req: LoginRequest): Promise<LoginResponse> {
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

    return {
      email: user.email,
      ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(user.email),
    };
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithRSAJwtKeysAdmin');
    return this.loginWithRSAJwtKeys(req, res);
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithRSAJwtKeys');
    const profile = await this.login(req);

    res.header(
      'authorization',
      await this.authService.createToken(
        { user: profile.email },
        JwtProcessorType.RSA,
      ),
    );

    return profile;
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
}
