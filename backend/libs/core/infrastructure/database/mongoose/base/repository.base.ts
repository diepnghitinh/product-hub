import { Model } from 'mongoose';

/**
 * Base for every Mongoose repository adapter. Holds the `Model<Doc>`, and forces
 * each adapter to declare how it maps between the persistence document (`Doc`)
 * and the domain aggregate (`Entity`). Mirrors the DDD kernel's TypeORM
 * `BaseRepository` shape (`toDomain`/`toDocument`) so the slice pattern stays
 * identical regardless of which database sits behind the port.
 */
export abstract class BaseRepository<Entity, Doc> {
  protected constructor(protected readonly model: Model<Doc>) {}

  abstract toDomain(doc: Doc): Entity;
  abstract toDocument(domainEntity: Entity): Partial<Doc>;

  get getModel(): Model<Doc> {
    return this.model;
  }
}
