import assert from 'node:assert/strict';
import test from 'node:test';

import { formatZonedDateTime, parseZonedDateTime } from '../src/lib/time.ts';

test('converts a local Shanghai schedule into its UTC instant', () => {
  assert.equal(
    parseZonedDateTime('2026-09-23T00:00', 'Asia/Shanghai'),
    Date.parse('2026-09-22T16:00:00.000Z'),
  );
  assert.equal(parseZonedDateTime('2026-02-30T00:00', 'Asia/Shanghai'), undefined);
  assert.match(
    formatZonedDateTime(Date.parse('2026-09-22T16:00:00.000Z'), 'Asia/Shanghai'),
    /2026.*9.*23.*00:00/,
  );
});

test('uses the requested timezone for DST overlaps instead of the server timezone', () => {
  const firstOccurrence = parseZonedDateTime('2026-11-01T01:30', 'America/New_York');
  assert.equal(firstOccurrence, Date.parse('2026-11-01T05:30:00.000Z'));
});
