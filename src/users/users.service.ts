import { EntityRepository, wrap } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { hashPassword } from '../auth/credentials.utils';
import { User } from '../model/user.entity';

@Injectable()
export class UsersService {
  public static readonly LDAP_SEARCH_QUERY = (email) =>
    `(&(objectClass=person)(objectClass=user)(email=${email}))`;
  public static readonly LDAP_ERROR_RESPONSE = `
      Lookup failed: javax.naming.NamingException: 
      [LDAP: error code 1 - 000004DC: Lda pErr: DSID-0C0906DC, comment: context not found., data 0, v1db1 ]; 
      remaining name: 'OU=Users,O=BrokenCrystals'
    `;

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

  async updatePhoto(email: string, photo: Buffer): Promise<User> {
    this.log.debug(`updatePhoto for ${email}`);
    const user = await this.findByEmail(email);
    if (!user) {
      throw new Error('Could not find user');
    }
    wrap(user).assign({
      photo,
    });

    await this.usersRepository.persistAndFlush(user);
    return user;
  }

  async findByEmail(email: string): Promise<User> {
    this.log.debug(`Called findByEmail ${email}`);
    return this.usersRepository.findOne({ email });
  }

  async findByEmailPrefix(emailPrefix: string): Promise<User[]> {
    this.log.debug(`Called findByEmailPrefix ${emailPrefix}`);
    return this.usersRepository.find({ email: { $like: emailPrefix + '%' } });
  }
}
