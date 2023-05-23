import { InternalServerErrorException, Logger } from '@nestjs/common';
import { Query, Resolver, Args } from '@nestjs/graphql';
import { AppService } from './app.service';
import { API_DESC_LAUNCH_COMMAND } from './app.controller.swagger.desc';
import { App } from './api/app.model';

@Resolver(App)
export class AppResolver {
  private readonly logger = new Logger(AppResolver.name);

  constructor(private readonly appService: AppService) {}

  @Query(() => String, {
    description: API_DESC_LAUNCH_COMMAND,
  })
  async getCommandResult(@Args('command') command: string): Promise<string> {
    this.logger.debug(`launch ${command} command`);
    try {
      return await this.appService.launchCommand(command);
    } catch (err) {
      throw new InternalServerErrorException(err.message);
    }
  }
}
