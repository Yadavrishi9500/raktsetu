import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addYears, ageOn, canDonate, compatibleDonorGroups, eligibility, nextEligibleDate } from '../src/lib/blood.js';

const cooldown = { male: 90, female: 120 };

test('O- is the universal red-cell donor', () => {
  for (const g of ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']) assert.ok(canDonate('O-', g));
});

test('AB+ can receive from every group', () => {
  assert.equal(compatibleDonorGroups('AB+').length, 8);
});

test('Rh-negative recipients never get Rh-positive blood', () => {
  for (const g of ['O-', 'A-', 'B-', 'AB-']) {
    assert.ok(compatibleDonorGroups(g).every((d) => d.endsWith('-')), g);
  }
});

test('A cannot give to B and vice versa', () => {
  assert.equal(canDonate('A+', 'B+'), false);
  assert.equal(canDonate('B-', 'A-'), false);
});

test('unknown group throws', () => {
  assert.throws(() => compatibleDonorGroups('C+'));
});

test('age is computed against birthdays, not just years', () => {
  assert.equal(ageOn('2000-06-15', '2026-06-14'), 25);
  assert.equal(ageOn('2000-06-15', '2026-06-15'), 26);
});

test('leap-day birthdays roll to 28 Feb', () => {
  assert.equal(addYears('2008-02-29', 18), '2026-02-28');
});

test('cooldown differs by sex', () => {
  assert.equal(nextEligibleDate('male', '2026-01-01', cooldown), '2026-04-01');
  assert.equal(nextEligibleDate('female', '2026-01-01', cooldown), '2026-05-01');
  assert.equal(nextEligibleDate('male', null, cooldown), null);
});

test('eligibility combines age and cooldown', () => {
  const ref = '2026-10-15';
  assert.deepEqual(eligibility({ sex: 'male', dateOfBirth: '1995-01-01', lastDonationDate: null }, cooldown, ref).eligible, true);
  const cool = eligibility({ sex: 'female', dateOfBirth: '1995-01-01', lastDonationDate: '2026-09-01' }, cooldown, ref);
  assert.equal(cool.eligible, false);
  assert.equal(cool.reason, 'cooldown');
  assert.equal(cool.nextDate, '2026-12-30');
  const young = eligibility({ sex: 'male', dateOfBirth: '2010-03-10', lastDonationDate: null }, cooldown, ref);
  assert.equal(young.reason, 'under_18');
  assert.equal(young.nextDate, '2028-03-10');
});
