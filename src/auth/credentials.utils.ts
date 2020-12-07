import { hash, compare } from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, SALT_ROUNDS);
}

export async function passwordMatches(
  password: string,
  hash: string,
): Promise<boolean> {
  return await compare(password, hash);
}
