export function parseCustomFFmpegArgs(rawArgs: string | undefined): string[] {
  if (!rawArgs) {
    return [];
  }

  const input = rawArgs.trim();
  if (!input) {
    return [];
  }

  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (escaped) {
    current += "\\";
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}
