interface ValueObjectProps {
  [index: string]: unknown;
}

/** Shallow structural equality of two plain objects (one level deep). */
function shallowEqual(a: ValueObjectProps, b: ValueObjectProps): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

/**
 * A Value Object — no identity; equality is by structural (attribute) value.
 * Props are frozen so a value object is immutable once created.
 */
export abstract class ValueObject<T extends ValueObjectProps> {
  public readonly props: T;

  constructor(props: T) {
    this.props = Object.freeze(props);
  }

  public equals(vo?: ValueObject<T>): boolean {
    if (vo === null || vo === undefined) {
      return false;
    }
    if (vo.props === undefined) {
      return false;
    }
    return shallowEqual(this.props, vo.props);
  }
}
