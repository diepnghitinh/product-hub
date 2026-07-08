/**
 * Guard clauses for validating arguments inside domain factories and use-cases.
 * Returns a {@link IGuardResult} rather than throwing, so callers fold failures
 * into a {@link Result}. Ported from the reference DDD kernel.
 */
export interface IGuardResult {
  succeeded: boolean;
  message?: string;
}

export interface IGuardArgument {
  argument: unknown;
  argumentName: string;
}

export type GuardArgumentCollection = IGuardArgument[];

export class Guard {
  public static combine(guardResults: IGuardResult[]): IGuardResult {
    for (const result of guardResults) {
      if (!result.succeeded) return result;
    }
    return { succeeded: true };
  }

  public static againstNullOrUndefined(
    argument: unknown,
    argumentName: string,
  ): IGuardResult {
    if (argument === null || argument === undefined) {
      return { succeeded: false, message: `${argumentName} is null or undefined` };
    }
    return { succeeded: true };
  }

  public static againstNullOrUndefinedBulk(
    args: GuardArgumentCollection,
  ): IGuardResult {
    for (const arg of args) {
      const result = this.againstNullOrUndefined(arg.argument, arg.argumentName);
      if (!result.succeeded) return result;
    }
    return { succeeded: true };
  }

  public static againstEmptyString(
    argument: string,
    argumentName: string,
  ): IGuardResult {
    if (!argument || argument.trim().length === 0) {
      return { succeeded: false, message: `${argumentName} cannot be empty` };
    }
    return { succeeded: true };
  }

  public static isOneOf(
    value: unknown,
    validValues: unknown[],
    argumentName: string,
  ): IGuardResult {
    const isValid = validValues.includes(value);
    if (isValid) return { succeeded: true };
    return {
      succeeded: false,
      message: `${argumentName} isn't oneOf the correct values in ${JSON.stringify(
        validValues,
      )}. Got "${String(value)}".`,
    };
  }

  public static inRange(
    num: number,
    min: number,
    max: number,
    argumentName: string,
  ): IGuardResult {
    const isInRange = num >= min && num <= max;
    if (!isInRange) {
      return {
        succeeded: false,
        message: `${argumentName} is not within range ${min} to ${max}.`,
      };
    }
    return { succeeded: true };
  }
}
