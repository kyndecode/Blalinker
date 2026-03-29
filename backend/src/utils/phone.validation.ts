const COUNTRY_DIAL_CODES: Record<string, string> = {
  BF: '226',
  CI: '225',
  FR: '33',
  ML: '223',
  SN: '221',
  TG: '228',
  US: '1',
};

interface PhoneLengthRule {
  min: number;
  max: number;
  stripLeadingZero: boolean;
}

const COUNTRY_PHONE_LENGTH_RULES: Record<string, PhoneLengthRule> = {
  BF: { min: 8, max: 8, stripLeadingZero: false },
  CI: { min: 10, max: 10, stripLeadingZero: false },
  FR: { min: 9, max: 9, stripLeadingZero: true },
  ML: { min: 8, max: 8, stripLeadingZero: false },
  SN: { min: 9, max: 9, stripLeadingZero: true },
  TG: { min: 8, max: 8, stripLeadingZero: false },
  US: { min: 10, max: 10, stripLeadingZero: false },
};

const DEFAULT_RULE: PhoneLengthRule = { min: 6, max: 14, stripLeadingZero: false };

export function normalizeCountryCode(countryCode: string): string {
  return countryCode.trim().toUpperCase();
}

export function getDialCode(countryCode: string): string {
  return COUNTRY_DIAL_CODES[normalizeCountryCode(countryCode)] ?? '';
}

export function getPhoneLengthRule(countryCode: string): PhoneLengthRule {
  return COUNTRY_PHONE_LENGTH_RULES[normalizeCountryCode(countryCode)] ?? DEFAULT_RULE;
}

export function extractDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

export function isValidE164ForCountry(phone: string, countryCode: string): boolean {
  const trimmed = phone.trim();
  if (!isValidE164(trimmed)) return false;

  const dialCode = getDialCode(countryCode);
  if (!dialCode) return true;
  if (!trimmed.startsWith(`+${dialCode}`)) return false;

  const localDigits = trimmed.slice(dialCode.length + 1);
  const rule = getPhoneLengthRule(countryCode);
  return localDigits.length >= rule.min && localDigits.length <= rule.max;
}

export function buildE164FromLocal(localPhone: string, countryCode: string): string {
  const dialCode = getDialCode(countryCode);
  const rule = getPhoneLengthRule(countryCode);
  const localDigitsRaw = extractDigits(localPhone);
  const localDigits = rule.stripLeadingZero ? localDigitsRaw.replace(/^0+/, '') : localDigitsRaw;
  if (!localDigits) return '';
  if (!dialCode) return `+${localDigits}`;
  return `+${dialCode}${localDigits}`;
}
