import { v4 as uuid } from 'uuid';
import { Identifier } from './identifier';

/** A UUID-v4 entity identifier. Generates a fresh id when none is supplied. */
export class UniqueEntityID extends Identifier<string | number> {
  constructor(id?: string | number) {
    super(id ? id : uuid());
  }
}
