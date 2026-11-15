export interface Setting<T> {
  readonly default: T;
  readonly description: string;
  parse(value: unknown): T;
}

export function parseBooleanSetting(value: unknown): boolean {
  let result: boolean;
  if (value === true || value === "true") {
    result = true;
  } else if (value === false || value === "false") {
    result = false;
  } else {
    throw new Error(`must be true or false, got ${JSON.stringify(value)}`);
  }
  return result;
}

export function intSetting(min: number, max: number): (value: unknown) => number {
  return (value) => {
    const isIntegerString = typeof value === "string" && /^-?\d+$/.test(value.trim());
    const number = typeof value === "number" ? value : isIntegerString ? Number(value) : Number.NaN;
    if (!Number.isInteger(number) || number < min || number > max) {
      throw new Error(`must be an integer from ${min} to ${max}, got ${JSON.stringify(value)}`);
    }
    return number;
  };
}

export function enumSetting<T extends string>(values: readonly T[], noun: string): (value: unknown) => T {
  return (value) => {
    if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
      throw new Error(`unknown ${noun} ${JSON.stringify(value)}; supported ${noun}s: ${values.join(", ")}`);
    }
    return value as T;
  };
}
