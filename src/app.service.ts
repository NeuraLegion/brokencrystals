import { HttpException, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users/users.service';
import { AppModuleConfigProperties } from './app.module.config.properties';
import { OrmModuleConfigProperties } from './orm/orm.module.config.properties';
import { AppConfig } from './app.config.api';
import { UserDto } from './users/api/UserDto';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  // Strict allow-list of executables that may be invoked via launchCommand.
  // Only safe, read-only, argument-less (or minimally argumented) utilities
  // are permitted. Anything not in this list is rejected outright.
  private static readonly ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
    'ls',
    'pwd',
    'whoami',
    'date',
    'uptime'
  ]);

  // Arguments may only contain safe characters: letters, digits, dashes,
  // dots and forward slashes. No shell metacharacters, whitespace-escaping,
  // command separators, redirection, or subshell syntax are allowed.
  private static readonly SAFE_ARG_PATTERN = /^[A-Za-z0-9._/-]*$/;

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UsersService
  ) {}

  async launchCommand(command: string): Promise<string> {
    this.logger.debug(`launch ${command} command`);

    if (typeof command !== 'string' || command.trim().length === 0) {
      throw new Error('Command must be a non-empty string');
    }

    // Reject anything containing newlines or control characters up-front.
    if (/[\r\n\0]/.test(command)) {
      throw new Error('Invalid command');
    }

    const [exec, ...args] = command.trim().split(/\s+/);

    if (!AppService.ALLOWED_COMMANDS.has(exec)) {
      throw new Error(`Command "${exec}" is not allowed`);
    }

    for (const arg of args) {
      if (!AppService.SAFE_ARG_PATTERN.test(arg)) {
        throw new Error('Invalid characters in command arguments');
      }
    }

    return new Promise((res, rej) => {
      try {
        const ps = spawn(exec, args, { shell: false });

        ps.stdout.on('data', (data: Buffer) => {
          this.logger.debug(`stdout: ${data}`);
          res(data.toString('ascii'));
        });

        ps.stderr.on('data', (data: Buffer) => {
          this.logger.debug(`stderr: ${data}`);
          res(data.toString('ascii'));
        });

        ps.on('error', (err) => rej(err.message));

        ps.on('close', (code) =>
          this.logger.debug(`child process exited with code ${code}`)
        );
      } catch (err) {
        rej(err.message);
      }
    });
  }

  getConfig(): AppConfig {
    const dbSchema = this.configService.get<string>(
        OrmModuleConfigProperties.ENV_DATABASE_SCHEMA
      ),
      dbHost = this.configService.get<string>(
        OrmModuleConfigProperties.ENV_DATABASE_HOST
      ),
      dbPort = this.configService.get<string>(
        OrmModuleConfigProperties.ENV_DATABASE_PORT
      ),
      dbUser = this.configService.get<string>(
        OrmModuleConfigProperties.ENV_DATABASE_USER
      ),
      dbPwd = this.configService.get<string>(
        OrmModuleConfigProperties.ENV_DATABASE_PASSWORD
      );

    return {
      awsBucket: this.configService.get<string>(
        AppModuleConfigProperties.ENV_AWS_BUCKET
      ),
      sql: `postgres://${dbUser}:${dbPwd}@${dbHost}:${dbPort}/${dbSchema} `,
      googlemaps: this.configService.get<string>(
        AppModuleConfigProperties.ENV_GOOGLE_MAPS
      )
    };
  }

  async getUserInfo(email: string): Promise<UserDto> {
    try {
      this.logger.debug(`Find a user by email: ${email}`);
      return new UserDto(await this.userService.findByEmail(email));
    } catch (err) {
      throw new HttpException(err.message, err.status);
    }
  }
}
