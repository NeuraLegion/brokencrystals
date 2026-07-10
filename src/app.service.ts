import { HttpException, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users/users.service';
import { AppModuleConfigProperties } from './app.module.config.properties';
import { OrmModuleConfigProperties } from './orm/orm.module.config.properties';
import { AppConfig } from './app.config.api';
import { UserDto } from './users/api/UserDto';

// Strict allow-list of binaries that are permitted to be executed via the
// "launch command" demo feature. Only these executables may be run, and
// only with arguments that pass the safe-argument validation below.
const ALLOWED_COMMANDS: ReadonlySet<string> = new Set(['ls', 'pwd', 'whoami', 'date', 'echo']);

// Only allow simple alphanumeric arguments (plus a few harmless punctuation
// characters commonly used in flags/paths). Anything else -- including shell
// metacharacters such as ; | & $ ( ) ` > < and newlines -- is rejected.
const SAFE_ARG_REGEX = /^[a-zA-Z0-9_.\-/]*$/;

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UsersService
  ) {}

  async launchCommand(command: string): Promise<string> {
    this.logger.debug(`launch ${command} command`);

    if (typeof command !== 'string' || command.trim().length === 0) {
      throw new Error('Invalid command');
    }

    const parts = command.trim().split(/\s+/).filter(Boolean);
    const [exec, ...args] = parts;

    if (!exec || !ALLOWED_COMMANDS.has(exec)) {
      throw new Error('Command is not allowed');
    }

    if (!args.every((arg) => SAFE_ARG_REGEX.test(arg))) {
      throw new Error('Command arguments contain invalid characters');
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
