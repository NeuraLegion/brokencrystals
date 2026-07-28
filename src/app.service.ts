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
  private readonly allowedCommands: Record<string, { exec: string; args: string[] }> = {
    pwd: { exec: '/bin/pwd', args: [] },
    date: { exec: '/bin/date', args: [] },
    whoami: { exec: '/usr/bin/whoami', args: [] }
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UsersService
  ) {}

  async launchCommand(command: string): Promise<string> {
    const normalizedCommand = typeof command === 'string' ? command.trim() : '';
    const safeCommand = this.allowedCommands[normalizedCommand];

    if (!safeCommand) {
      this.logger.warn(`Rejected unsupported command request: ${normalizedCommand}`);
      throw new HttpException('Unsupported command', 400);
    }

    this.logger.debug(`launch ${normalizedCommand} command`);

    return new Promise((res, rej) => {
      try {
        const ps = spawn(safeCommand.exec, safeCommand.args);
        let output = '';
        let errorOutput = '';

        ps.stdout.on('data', (data: Buffer) => {
          const chunk = data.toString('utf8');
          this.logger.debug(`stdout: ${chunk}`);
          output += chunk;
        });

        ps.stderr.on('data', (data: Buffer) => {
          const chunk = data.toString('utf8');
          this.logger.debug(`stderr: ${chunk}`);
          errorOutput += chunk;
        });

        ps.on('error', (err) => rej(err.message));

        ps.on('close', (code) => {
          this.logger.debug(`child process exited with code ${code}`);
          if (code === 0) {
            res(output);
            return;
          }
          rej(errorOutput || `Command exited with code ${code}`);
        });
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
