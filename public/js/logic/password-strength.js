// اقصادي — password strength (pure: no DOM, no network). Used by /login (signup) and /account (change password).
// The server only requires 8..200 characters; this adds a friendly hint about how hard the password is to guess.
//
//   passwordStrength('Abcdefgh12') → { level: 'good', score: 3, ok: true, length: 10, checks: {...} }
//   level: 'empty' | 'short' (under 8) | 'weak' | 'fair' | 'good' | 'strong'   score: 0..4 (for a 4-step meter)

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 200;

// A few passwords everybody tries first (lower-cased). Matching one caps the level at «weak».
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'qwerty', 'qwertyui', 'qwerty123', 'qwertyuiop',
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', 'abc12345', 'abcd1234',
  'iloveyou', 'aqsati', 'aqsati123', 'kuwait', 'kuwait123', 'admin123', 'welcome1', 'letmein1', '1q2w3e4r',
]);

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigits(s) {
  return s.replace(EASTERN_DIGITS, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** true for runs like «12345678», «abcdefgh», «87654321» (each char ±1 from the previous). */
function isSequence(s) {
  if (s.length < 4) return false;
  const step = s.charCodeAt(1) - s.charCodeAt(0);
  if (Math.abs(step) !== 1) return false;
  for (let i = 2; i < s.length; i += 1) {
    if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== step) return false;
  }
  return true;
}

/** How guessable a password looks. Counts characters (code points), so Arabic letters count once each. */
export function passwordStrength(raw) {
  const pw = typeof raw === 'string' ? raw : '';
  const chars = [...pw];
  const length = chars.length;
  const checks = {
    length: length >= MIN_LENGTH,
    long: length >= 12,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /[0-9٠-٩۰-۹]/.test(pw),
    symbol: /[^\p{L}\p{N}]/u.test(pw),
    otherLetter: /[^\P{L}a-zA-Z]/u.test(pw), // Arabic (or any non-Latin) letters
  };
  const ok = length >= MIN_LENGTH && length <= MAX_LENGTH;
  if (!length) return { level: 'empty', score: 0, ok: false, length, checks };
  if (length < MIN_LENGTH) return { level: 'short', score: 0, ok: false, length, checks };

  const variety = ['lower', 'upper', 'digit', 'symbol', 'otherLetter'].filter((k) => checks[k]).length;
  let points = 1 + (length >= 12 ? 1 : 0) + (length >= 16 ? 1 : 0) + Math.max(0, variety - 1);

  const plain = toLatinDigits(pw).toLowerCase();
  const weakPattern = COMMON.has(plain) || /^(.)\1+$/u.test(plain) || isSequence(plain);
  if (weakPattern) points = 1;

  const score = Math.max(1, Math.min(4, points));
  const level = ['weak', 'weak', 'fair', 'good', 'strong'][score];
  return { level, score, ok, length, checks, common: weakPattern };
}
