/**
 * Formats a raw on-chain value into the display string the frontend shows.
 *
 * The backend owns this on purpose: `1152345` + `ms` must render as `19:12.345` and
 * `1432` + `cps` with `decimals=2` as `14.32`. Implementing it twice guarantees drift.
 *
 * All arithmetic stays in BigInt so values above 2^53 cannot lose precision.
 */
export function formatValue(value: string | bigint | number, unit: string, decimals: number): string {
  const raw = typeof value === "bigint" ? value : BigInt(String(value));
  const scale = 10n ** BigInt(Math.max(0, decimals));
  const whole = raw / scale;
  const fraction = raw % scale;

  if (unit.toLowerCase() === "ms") {
    const totalMs = whole;
    const hours = totalMs / 3_600_000n;
    const minutes = (totalMs / 60_000n) % 60n;
    const secondsPart = (totalMs / 1000n) % 60n;
    const millis = totalMs % 1000n;
    const pad = (part: bigint, size: number) => part.toString().padStart(size, "0");
    const body = `${pad(minutes, hours > 0n ? 2 : 2)}:${pad(secondsPart, 2)}.${pad(millis, 3)}`;
    return hours > 0n ? `${hours}:${body}` : body;
  }

  if (scale === 1n) return whole.toString();
  const fractionText = fraction.toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

/** Parses a user supplied display/serialised value back into the integer the chain expects. */
export function parseValue(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`Invalid value: ${value}`);
  const [whole, fraction = ""] = value.split(".");
  const scale = 10n ** BigInt(Math.max(0, decimals));
  const padded = fraction.padEnd(Number(decimals), "0").slice(0, Number(decimals));
  return BigInt(whole) * scale + BigInt(padded || "0");
}
