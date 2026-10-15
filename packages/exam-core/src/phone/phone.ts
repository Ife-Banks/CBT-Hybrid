import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface NormalisePhoneOptions {
  /** Country assumed when the input has no international prefix. Default `NG`. */
  defaultCountry?: CountryCode;
  /** Accept valid foreign numbers (default true, per CBT-04 section 4.5). */
  allowForeign?: boolean;
}

/**
 * Normalise a phone number to E.164, or return `null` when it is invalid.
 *
 * Uses libphonenumber-js with default country `NG` (CBT-04 sections 3.15 and
 * 4.5). Non-mobile or unparseable values are rejected.
 */
export function normalisePhone(input: string, options: NormalisePhoneOptions = {}): string | null {
  const { defaultCountry = 'NG', allowForeign = true } = options;

  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  if (!allowForeign && parsed.country !== defaultCountry) return null;

  return parsed.number;
}

/** Throwing variant for call sites that treat invalid numbers as errors. */
export function normalisePhoneOrThrow(input: string, options: NormalisePhoneOptions = {}): string {
  const result = normalisePhone(input, options);
  if (result === null) throw new Error(`Invalid phone number: ${input}`);
  return result;
}
