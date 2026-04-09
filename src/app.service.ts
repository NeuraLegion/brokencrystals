import { HttpException, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users/users.service';
import { AppModuleConfigProperties } from './app.module.config.properties';
import { AppConfig } from './app.config.api';
import { UserDto } from './users/api/UserDto';
import { SpawnCommand } from './app.controller';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly allowedCommands = {
    [SpawnCommand.LS]: ['/bin/ls', []],
    [SpawnCommand.PWD]: ['/bin/pwd', []],
    [SpawnCommand.WHOAMI]: ['/usr/bin/whoami', []],
    [SpawnCommand.DATE]: ['/bin/date', []]
  } as const;

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UsersService
  ) {}

  async launchCommand(command: SpawnCommand): Promise<string> {
    const entry = this.allowedCommands[command];
    if (!entry) {
      throw new HttpException('Command is not allowed', 400);
    }

    const [exec, args] = entry;
    this.logger.debug(`launch ${command} command`);

    return new Promise((res, rej) => {
      try {
        const ps = spawn(exec, args, {
          shell: false,
          windowsHide: true
        });

        let output = '';
        ps.stdout.on('data', (data: Buffer) => {
          output += data.toString('utf8');
        });

        ps.stderr.on('data', (data: Buffer) => {
          output += data.toString('utf8');
        });

        ps.on('error', (err) => rej(err.message));
        ps.on('close', (code) => {
          this.logger.debug(`child process exited with code ${code}`);
          if (code === 0) {
            res(output.trim());
            return;
          }
          rej(output.trim() || `Command exited with code ${code}`);
        });
      } catch (err) {
        rej(err.message);
      }
    });
  }

  getConfig(): AppConfig {
    return {
      awsBucket: this.configService.get<string>(
        AppModuleConfigProperties.ENV_AWS_BUCKET
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
