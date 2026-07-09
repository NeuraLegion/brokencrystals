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
  // The user-supplied "command" is only ever used to pick one of these keys;
  // it is never used to build the executable path or shell string directly.
  private static readonly ALLOWED_COMMANDS: Record<string, string> = {
    ls: 'ls',
    pwd: 'pwd',
    whoami: 'whoami',
    date: 'date',
    echo: 'echo'
  };

  // Arguments must only contain safe characters - no shell metacharacters,
  // no path traversal, no quoting/escaping tricks.
  private static readonly SAFE_ARG_PATTERN = /^[A-Za-z0-9_.\-/]*$/;

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UsersService
  ) {}

  async launchCommand(command: string): Promise<string> {
    this.logger.debug(`launch ${command} command`);

    if (typeof command !== 'string' || command.trim().length === 0) {
      return Promise.reject('Invalid command');
    }

    const parts = command.trim().split(/\s+/);
    const [requestedExec, ...args] = parts;

    const exec = AppService.ALLOWED_COMMANDS[requestedExec];

    if (!exec) {
      return Promise.reject(
        `Command "${requestedExec}" is not allowed`
      );
    }

    if (!args.every((arg) => AppService.SAFE_ARG_PATTERN.test(arg))) {
      return Promise.reject('Invalid characters in command arguments');
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
