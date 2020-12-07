import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { User } from 'src/model/user.entity';
import { hashPassword } from 'src/auth/credentials.utils';

@Injectable()
export class UsersService {
  private log: Logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: EntityRepository<User>,
  ) {}

  async createUser(
    email: string,
    firstName: string,
    lastName: string,
    password: string,
  ): Promise<User> {
    this.log.debug(`Called createUser`);

    const u = new User();
    u.email = email;
    u.firstName = firstName;
    u.lastName = lastName;
    u.isAdmin = false;
    u.password = await hashPassword(password);

    await this.usersRepository.persistAndFlush(u);
    this.log.debug(`Saved new user`);

    return u;
  }

  async findByEmail(email: string): Promise<User> {
    this.log.debug(`Called findAll`);
    return this.usersRepository.findOne({ email });
  }
}
