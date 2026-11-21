export function readIntegerEnv(name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!/^\d+$/.test(raw ?? String(fallback)) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function challengeWindowHours() {
  return readIntegerEnv("CHALLENGE_WINDOW_HOURS", 48, 1, 24 * 365);
}
