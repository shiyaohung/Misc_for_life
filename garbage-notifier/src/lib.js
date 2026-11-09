// 純函式：距離、找最近清運點、判斷要不要提醒。

export function distanceM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** 新北「垃圾車即時位置」一筆 → { lineid, car, lat, lng, time } */
export function normTruck(r) {
  return { lineid: String(r.lineid), car: r.car, time: r.time, location: r.location, lat: Number(r.latitude), lng: Number(r.longitude) };
}

/** 離某個位置最近的 n 個清運點 */
export function nearestStops(stops, here, n = 5) {
  return stops
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ ...s, dist: distanceM(here, s) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
}

/**
 * 垃圾車離你家還有幾站。
 * lineStops: 這條路線所有清運點；myRank: 你家那站的清運序；ahead: 提前幾站提醒。
 * 車子在「你家前 ahead 站 ～ 你家這站」之間時回傳剩幾站（0 = 已到你家這站），否則 null。
 * 用「離車子最近的清運點」判斷位置，避免路線繞回同一條路時誤報。
 */
export function stopsLeft(truck, lineStops, myRank, { ahead = 1, nearM = 150 } = {}) {
  const ordered = [...lineStops].sort((a, b) => a.rank - b.rank);
  const myIdx = ordered.findIndex((s) => s.rank === myRank);
  if (myIdx < 0) return null;
  let best = -1, bestD = Infinity;
  ordered.forEach((s, i) => {
    const d = distanceM(truck, s);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (bestD > nearM) return null;
  const left = myIdx - best;
  return left >= 0 && left <= ahead ? left : null;
}

/** 新北 GPS 時間 "2026/11/09 20:17:55"（台北時間）→ ms */
export function parseTruckTime(t) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(t || '');
  return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`) : NaN;
}

/** 台北時間的日期字串，例如 2026-11-09，用來「一天只提醒一次」 */
export function taipeiDate(now) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
