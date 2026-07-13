import {
  HttpException,
  Injectable,
  Logger,
  BadRequestException
} from '@nestjs/common';
import { spawn } from 'child_process';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users/users.service';
import { AppModuleConfigProperties } from './app.module.config.properties';
import { OrmModuleConfigProperties } from './orm/orm.module.config.properties';
import { AppConfig } from './app.config.api';
import { UserDto } from './users/api/UserDto';

// Static mapping of allowed command names to their safe, fixed invocations.
// No user-controlled arguments are ever passed to the subprocess.
const ALLOWED_COMMANDS: ReadonlyMap<string, readonly string[]> = new Map([
  ['ls', ['ls']],
  ['echo', ['echo', 'hello']],
  ['date', ['date']],
  ['whoami', ['whoami']],
  ['uptime', ['uptime']]
]);

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UsersService
  ) {}

  async launchCommand(command: string): Promise<string> {
    this.logger.debug(`launch ${command} command`);

    // Only use the first token as the command name; ignore any arguments
    const cmdName = command.trim().split(/\s+/)[0];
    const fixedArgs = ALLOWED_COMMANDS.get(cmdName);

    if (!fixedArgs) {
      throw new BadRequestException(
        `Command '${cmdName}' is not allowed. Permitted: ${[...ALLOWED_COMMANDS.keys()].join(', ')}`
      );
    }

    // Run the statically defined command+args — no user input reaches spawn
    const [exec, ...args] = fixedArgs;

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
