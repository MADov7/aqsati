import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordStrength, MIN_LENGTH, MAX_LENGTH } from '../public/js/logic/password-strength.js';

test('empty and short passwords are not ok', () => {
  assert.deepEqual([passwordStrength('').level, passwordStrength('').ok], ['empty', false]);
  assert.equal(passwordStrength(undefined).level, 'empty');
  const short = passwordStrength('Ab1!xyz');
  assert.equal(short.level, 'short');
  assert.equal(short.score, 0);
  assert.equal(short.ok, false);
});

test('the server rule (8..200 characters) decides ok', () => {
  assert.equal(MIN_LENGTH, 8);
  assert.equal(MAX_LENGTH, 200);
  assert.equal(passwordStrength('a'.repeat(7) + 'b').ok, true);
  assert.equal(passwordStrength('aB3$'.repeat(50)).ok, true); // exactly 200
  assert.equal(passwordStrength('aB3$'.repeat(50) + 'x').ok, false); // 201
});

test('common passwords, repeats and sequences are weak', () => {
  for (const pw of ['12345678', 'password', 'PASSWORD', 'qwertyui', '11111111', 'abcdefgh', '87654321', '١٢٣٤٥٦٧٨', 'aaaaaaaaaaaa']) {
    const r = passwordStrength(pw);
    assert.equal(r.level, 'weak', pw);
    assert.equal(r.score, 1, pw);
    assert.equal(r.common, true, pw);
  }
});

test('variety and length raise the level step by step', () => {
  assert.equal(passwordStrength('kwtbudget').level, 'weak'); // one class, 9 chars
  assert.equal(passwordStrength('kwtbudget7').level, 'fair'); // lower + digit
  assert.equal(passwordStrength('Kwtbudget7').level, 'good'); // + upper
  assert.equal(passwordStrength('Kwtbudget7!').level, 'strong'); // + symbol
  assert.equal(passwordStrength('kwtbudgetmonthly').level, 'good'); // 16 chars, one class
});

test('Arabic letters count as their own character class and as one character each', () => {
  const r = passwordStrength('أقساطيبيتي'); // 10 Arabic letters
  assert.equal(r.length, 10);
  assert.equal(r.checks.otherLetter, true);
  assert.equal(r.checks.lower, false);
  assert.equal(r.level, 'weak');
  assert.equal(passwordStrength('أقساطي2026k').level, 'good'); // Arabic + digits + lower, 11 chars
  assert.equal(passwordStrength('أقساطي2026kw').level, 'strong'); // the same, 12 chars
});

test('score is always within 0..4 and checks report what was found', () => {
  const r = passwordStrength('Very-Long Passphrase 2026 with spaces!');
  assert.equal(r.score, 4);
  assert.equal(r.level, 'strong');
  assert.deepEqual(
    [r.checks.length, r.checks.long, r.checks.lower, r.checks.upper, r.checks.digit, r.checks.symbol],
    [true, true, true, true, true, true],
  );
});
