// A small flag parser for command arguments. Commands declare the flags they
// accept so an unknown flag is an error instead of being silently ignored.

export type FlagKind = "string" | "boolean";

export type FlagSpec = Record<string, FlagKind>;

export type ParsedArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

export function parseFlags(args: string[], spec: FlagSpec): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);

    const kind = spec[name];

    if (!kind) {
      throw new Error(`Unknown flag --${name}`);
    }

    if (kind === "boolean") {
      if (inlineValue !== undefined) {
        throw new Error(`Flag --${name} does not take a value`);
      }

      flags[name] = true;
      continue;
    }

    if (inlineValue !== undefined) {
      flags[name] = inlineValue;
      continue;
    }

    const next = args[i + 1];

    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Flag --${name} needs a value`);
    }

    flags[name] = next;
    i++;
  }

  return { positional, flags };
}

export function flagString(
  parsed: ParsedArgs,
  name: string,
): string | undefined {
  const value = parsed.flags[name];

  return typeof value === "string" ? value : undefined;
}

export function flagBool(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags[name] === true;
}

export function positiveInt(value: string, label: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

export function nonNegativeInt(value: string, label: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be zero or a positive integer`);
  }

  return parsed;
}

// "30s", "5m", "2h", "7d" -> milliseconds.
export function parseDuration(durationStr: string): number {
  const match = durationStr.match(/^(\d+)(ms|s|m|h|d)$/);

  if (!match) {
    throw new Error(
      `Invalid duration "${durationStr}": use a number followed by ms, s, m, h or d (e.g. 1m)`,
    );
  }

  const amount = Number(match[1]);

  switch (match[2]) {
    case "ms":
      return amount;

    case "s":
      return amount * 1000;

    case "m":
      return amount * 60 * 1000;

    case "h":
      return amount * 60 * 60 * 1000;

    case "d":
      return amount * 24 * 60 * 60 * 1000;

    default:
      throw new Error("Invalid duration unit");
  }
}
