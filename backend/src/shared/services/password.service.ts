import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/** Central bcrypt hashing so no use-case touches the crypto library directly. */
@Injectable()
export class PasswordService {
  private readonly rounds = 10;

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
