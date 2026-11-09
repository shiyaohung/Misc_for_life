import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestStops, normTruck, parseTruckTime, stopsLeft, taipeiDate } from '../src/lib.js';
import STOPS from '../src/stops-data.js';

// 一條往北走的假路線，每站相隔約 330 公尺
const stops = [1, 2, 3, 4, 5].map((rank) => ({ rank, name: `站${rank}`, lat: 25.17 + rank * 0.003, lng: 121.44 }));
const at = (rank, dLat = 0) => ({ lat: 25.17 + rank * 0.003 + dLat, lng: 121.44 });

test('stopsLeft：前一站 → 1、你家這站 → 0', () => {
  assert.equal(stopsLeft(at(3), stops, 4), 1);
  assert.equal(stopsLeft(at(3, 0.0005), stops, 4), 1); // 離前一站約 55m
  assert.equal(stopsLeft(at(4), stops, 4), 0);
});

test('stopsLeft：ahead=3 時前三站都算', () => {
  assert.equal(stopsLeft(at(1), stops, 4, { ahead: 3 }), 3);
  assert.equal(stopsLeft(at(1), stops, 4, { ahead: 2 }), null);
});

test('stopsLeft：還很遠、已經過了、在兩站中間 → null', () => {
  assert.equal(stopsLeft(at(1), stops, 4), null);
  assert.equal(stopsLeft(at(5), stops, 4), null);
  assert.equal(stopsLeft(at(3, 0.0015), stops, 4), null);
});

test('stopsLeft：清運序不連續也用順序算', () => {
  const gap = stops.map((s) => ({ ...s, rank: s.rank * 10 }));
  assert.equal(stopsLeft(at(3), gap, 40), 1);
});

test('nearestStops', () => {
  assert.deepEqual(nearestStops(stops, at(2, 0.0004), 2).map((s) => s.rank), [2, 3]);
});

test('normTruck / parseTruckTime（新北實際格式）', () => {
  const t = normTruck({ lineid: '234081', car: '148-BY', time: '2026/11/09 20:14:15', location: '新北市永和區國中路109巷1弄1號', longitude: '121.524218333333', latitude: '25.005755' });
  assert.equal(t.lat, 25.005755);
  assert.equal(parseTruckTime(t.time), Date.parse('2026-11-09T12:14:15Z'));
  assert.ok(Number.isNaN(parseTruckTime('')));
});

test('打包的淡水區清運點資料', () => {
  assert.ok(STOPS.length > 100);
  for (const s of STOPS) assert.ok(Number.isFinite(s[5]) && Number.isFinite(s[6]) && Number.isInteger(s[2]));
});

test('taipeiDate 跨日', () => {
  assert.equal(taipeiDate(Date.parse('2026-11-09T16:30:00Z')), '2026-11-10');
});
