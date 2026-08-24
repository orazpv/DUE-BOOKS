import assert from 'node:assert/strict';
import test from 'node:test';
import { calcOutstanding, calcContributionReceived } from '../src/utils/financial.ts';
import { normalizeWholeNaira } from '../src/utils/validation.ts';
import type { Payment } from '../src/types.ts';

test('invalid and unrealistic naira values are rejected', () => {
  assert.equal(normalizeWholeNaira(-10), null);
  assert.equal(normalizeWholeNaira(0), null);
  assert.equal(normalizeWholeNaira(Number.NaN), null);
  assert.equal(normalizeWholeNaira(Number.POSITIVE_INFINITY), null);
  assert.equal(normalizeWholeNaira(1_000_000_000_001), null);
  assert.equal(normalizeWholeNaira(10.6), 11);
});

test('outstanding never becomes negative or non-finite', () => {
  assert.equal(calcOutstanding(100, 150), 0);
  assert.equal(calcOutstanding(Number.NaN, 20), 0);
});

test('duplicate allocations are summed for reporting safety', () => {
  const payment = {
    status: 'confirmed',
    allocations: [
      { contributionId: 'c1', contributionName: 'Dues', contributionType: 'dues', amount: 20 },
      { contributionId: 'c1', contributionName: 'Dues', contributionType: 'dues', amount: 30 },
    ],
  } as Payment;
  assert.equal(calcContributionReceived('c1', [payment]), 50);
});
