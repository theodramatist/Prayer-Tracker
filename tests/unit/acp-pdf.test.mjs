// Reading the Anglican Cycle of Prayer from the Anglican Communion's PDF by
// its layout, as the app does with a newer cycle and scripts/build-acp.mjs
// does with the built-in one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAcpLines, everyDay } from '../../js/acp-pdf.js';

const line = (text, bold = false) => ({ text, bold });

test('bold dates, the labels after them left out, and the bold entry split at its dash', () => {
  const lines = [
    line('The Anglican Cycle of Prayer', true),
    line('1 September 2023 to 31 December 2026'),
    line('Friday 1 September 2023', true),
    line('Season of Creation'),
    line('The Diocese of Zaki-Biam –', true),
    line('The Church of Nigeria (Anglican Communion)', true),
    line('Saturday 2 September 2023', true),
    line('The Diocese of Central Zambia – The Church of the', true),
    line('Province of Central Africa', true),
    line('Sunday 3 September 2023', true),
    line('13th Sunday after Trinity'),
    line('The Church of the Province of the Indian Ocean', true),
    line('The next edition of the Anglican Cycle of Prayer is now available'),
    line('www.anglicancommunion.org 3'),
  ];
  assert.deepEqual(parseAcpLines(lines), [
    { date: '2023-09-01', text: 'The Diocese of Zaki-Biam', note: 'The Church of Nigeria (Anglican Communion)' },
    { date: '2023-09-02', text: 'The Diocese of Central Zambia', note: 'The Church of the Province of Central Africa' },
    { date: '2023-09-03', text: 'The Church of the Province of the Indian Ocean' },
  ]);
});

test('a PDF laid out otherwise gives nothing, so the app reads it as text instead', () => {
  assert.deepEqual(parseAcpLines([
    line('Monday 2 November 2026', true), line('The Diocese of Alpha'), line('The Rt Revd A. Bishop'),
    line('Tuesday 3 November 2026', true), line('The Diocese of Beta'),
  ]), []);
});

test('every day from the first to the last, in order', () => {
  assert.deepEqual(everyDay([{ date: '2027-01-03', text: 'C' }, { date: '2027-01-01', text: 'A' }]), [
    { date: '2027-01-01', text: 'A' },
    { date: '2027-01-02', text: 'The Anglican Communion' },
    { date: '2027-01-03', text: 'C' },
  ]);
});
