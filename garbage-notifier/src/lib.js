// 純函式：距離、找最近清運點、判斷要不要提醒。

export function distanceM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** 新北「垃圾車路線」一筆 → { lineid, linename, rank, name, time, lat, lng } */
export function normStop(r) {
  return {
    lineid: String(r.lineid),
    linename: r.linename,
    rank: Number(r.rank),
    name: r.name,
    time: r.time,
    city: r.city,
    lat: Number(r.latitude),
    lng: Number(r.longitude),
  };
}

/** 新北「垃圾車即時位置」一筆 → { lineid, car, lat, lng, time } */
export function normTruck(r) {
  return { lineid: String(r.lineid), car: r.car, time: r.time, lat: Number(r.latitude), lng: Number(r.longitude) };
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
 * 判斷垃圾車目前在路線上的進度。
 * lineStops: 這條路線所有清運點；myRank: 你家那站的清運序。
 * 回傳 'prev'（到了前一站）、'mine'（已到你家這站，前一站沒抓到時的保險）或 null。
 * 用「離車子最近的清運點」判斷，避免路線繞回同一條路時誤報。
 */
export function progress(truck, lineStops, myRank, nearM = 150) {
  let best = null;
  for (const s of lineStops) {
    const d = distanceM(truck, s);
    if (!best || d < best.d) best = { s, d };
  }
  if (!best || best.d > nearM) return null;
  const prevRank = Math.max(...lineStops.filter((s) => s.rank < myRank).map((s) => s.rank), -Infinity);
  if (best.s.rank === prevRank) return 'prev';
  if (best.s.rank === myRank) return 'mine';
  return null;
}

/** 台北時間的日期字串，例如 2026-11-09，用來「一天只提醒一次」 */
export function taipeiDate(now) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
