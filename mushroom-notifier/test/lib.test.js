import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, findDue, shouldSaveLocation, formatMessage } from '../src/lib.js';
import { normalize } from '../src/source.js';

const here = { lat: 25.0330, lng: 121.5654 }; // 台北 101
const now = Date.parse('2026-11-04T12:00:00Z');
const min = 60000;

test('distanceM', () => {
  assert.equal(Math.round(distanceM(here, here)), 0);
  const d = distanceM(here, { lat: 25.0420, lng: 121.5654 }); // 往北約 1 km
  assert.ok(d > 990 && d < 1010, String(d));
});

test('findDue: 只回傳半徑內、0~3 分鐘內出現的', () => {
  const ms = [
    { id: 'a', lat: 25.0335, lng: 121.5654, appearAt: now + 2 * min },   // 近、2 分鐘後 ✓
    { id: 'b', lat: 25.0335, lng: 121.5654, appearAt: now + 3 * min },   // 剛好 3 分鐘 ✓
    { id: 'c', lat: 25.0335, lng: 121.5654, appearAt: now + 5 * min },   // 太早
    { id: 'd', lat: 25.0335, lng: 121.5654, appearAt: now - 1 * min },   // 已出現
    { id: 'e', lat: 25.1000, lng: 121.5654, appearAt: now + 1 * min },   // 太遠
  ];
  const due = findDue(ms, here, { radiusM: 1000, leadMin: 3, now });
  assert.deepEqual(due.map((m) => m.id), ['a', 'b']);
});

test('shouldSaveLocation 節流', () => {
  const prev = { ...here, ts: now };
  assert.equal(shouldSaveLocation(null, prev), true);
  assert.equal(shouldSaveLocation(prev, { ...here, ts: now + min }), false);
  assert.equal(shouldSaveLocation(prev, { ...here, ts: now + 6 * min }), true);
  assert.equal(shouldSaveLocation(prev, { lat: 25.0345, lng: 121.5654, ts: now + min }), true);
});

test('formatMessage', () => {
  const s = formatMessage({ name: '火蘑菇', lat: 1, lng: 2, appearAt: now + 3 * min, dist: 420.4 }, now);
  assert.match(s, /火蘑菇 約 3 分鐘後出現（20:03）/);
  assert.match(s, /420 公尺/);
  assert.match(s, /q=1,2/);
});

test('normalize 過濾壞資料', () => {
  const out = normalize([
    { id: 1, lat: '25', lng: '121', appearAt: '2026-11-04T12:03:00Z' },
    { id: 2, lat: 'x', lng: 121, appearAt: now },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].appearAt, now + 3 * min);
});
