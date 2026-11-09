import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestStops, normStop, normTruck, progress, taipeiDate } from '../src/lib.js';

// 一條往北走的假路線，每站相隔約 330 公尺
const stops = [1, 2, 3, 4, 5].map((rank) => ({ rank, name: `站${rank}`, lat: 25.17 + rank * 0.003, lng: 121.44 }));
const at = (rank, dLat = 0) => ({ lat: 25.17 + rank * 0.003 + dLat, lng: 121.44 });

test('progress：車在前一站 → prev', () => {
  assert.equal(progress(at(3), stops, 4), 'prev');
  assert.equal(progress(at(3, 0.0005), stops, 4), 'prev'); // 離前一站約 55m
});

test('progress：車在你家這站 → mine（保險）', () => {
  assert.equal(progress(at(4), stops, 4), 'mine');
});

test('progress：還很遠或已經過了 → null', () => {
  assert.equal(progress(at(1), stops, 4), null);
  assert.equal(progress(at(5), stops, 4), null);
  assert.equal(progress(at(3, 0.0015), stops, 4), null); // 兩站中間、離每站都 >150m
});

test('progress：第一站沒有前一站', () => {
  assert.equal(progress(at(1), stops, 1), 'mine');
});

test('nearestStops', () => {
  const n = nearestStops(stops, at(2, 0.0004), 2);
  assert.deepEqual(n.map((s) => s.rank), [2, 3]);
});

test('欄位轉換', () => {
  const s = normStop({ city: '淡水區', lineid: 'A1', linename: '淡水1', rank: '7', name: '中正路口', time: '19:30', latitude: '25.17', longitude: '121.44' });
  assert.equal(s.rank, 7);
  assert.equal(s.lat, 25.17);
  const t = normTruck({ lineid: 'A1', car: 'KED-1234', time: '2026/11/09 19:28', latitude: '25.17', longitude: '121.44' });
  assert.equal(t.lng, 121.44);
});

test('taipeiDate 跨日', () => {
  assert.equal(taipeiDate(Date.parse('2026-11-09T16:30:00Z')), '2026-11-10');
});
