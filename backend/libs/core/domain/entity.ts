import { UniqueEntityID } from './unique-entity-id';

const isEntity = (v: unknown): v is Entity<unknown> => v instanceof Entity;

/**
 * Base domain Entity — identity-based equality. Two entities are equal when
 * they share the same {@link UniqueEntityID}, regardless of attribute values.
 */
export abstract class Entity<T> {
  protected readonly _id: UniqueEntityID;
  public readonly props: T;

  constructor(props: T, id?: UniqueEntityID) {
    this._id = id ? id : new UniqueEntityID();
    this.props = props;
  }

  public equals(object?: Entity<T>): boolean {
    if (object == null || object == undefined) {
      return false;
    }
    if (this === object) {
      return true;
    }
    if (!isEntity(object)) {
      return false;
    }
    return this._id.equals(object._id);
  }
}
