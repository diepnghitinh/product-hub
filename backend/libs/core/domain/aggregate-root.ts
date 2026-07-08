import { Entity } from './entity';
import { UniqueEntityID } from './unique-entity-id';

/**
 * An Aggregate Root — the consistency boundary and entry point to a cluster of
 * domain objects. Exposes its identity; all persistence and invariants go
 * through the root.
 *
 * Note: the reference kernel also carries an event-sourcing mechanism
 * (applyEvent/commit). product-hub does not use an event store, so this is the
 * lean form — identity + behaviour only. Add domain events here later if needed.
 */
export abstract class AggregateRoot<T> extends Entity<T> {
  get id(): UniqueEntityID {
    return this._id;
  }
}
