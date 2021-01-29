import { hash, compare } from 'bcrypt';

const SALT_ROUNDS = 10;

export const hashPassword = (password: string): Promise<string> =>
  hash(password, SALT_ROUNDS);

export const passwordMatches = (
  password: string,
  hash: string,
): Promise<boolean> => compare(password, hash);
