// 純函式：距離計算、篩選即將出現的蘑菇、組訊息。方便單元測試。

const R = 6371000; // 地球半徑（公尺）

export function distanceM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 找出「在半徑內」且「距離出現時間 0 < 剩餘 <= leadMin 分鐘」的蘑菇。
 * mushrooms: [{ id, name, lat, lng, appearAt }]，appearAt 為毫秒 timestamp。
 */
export function findDue(mushrooms, here, { radiusM, leadMin, now }) {
  const leadMs = leadMin * 60 * 1000;
  return mushrooms
    .map((m) => ({ ...m, dist: distanceM(here, m) }))
    .filter((m) => {
      const remain = m.appearAt - now;
      return m.dist <= radiusM && remain > 0 && remain <= leadMs;
    })
    .sort((a, b) => a.appearAt - b.appearAt);
}

/** 位置是否值得寫入 KV（節省免費額度的寫入次數）。 */
export function shouldSaveLocation(prev, next, { minMoveM = 100, minIntervalMs = 5 * 60 * 1000 } = {}) {
  if (!prev) return true;
  if (next.ts - prev.ts >= minIntervalMs) return true;
  return distanceM(prev, next) >= minMoveM;
}

export function formatMessage(m, now) {
  const min = Math.max(0, Math.round((m.appearAt - now) / 60000));
  const t = new Date(m.appearAt).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return [
    `🍄 ${m.name || '蘑菇'} 約 ${min} 分鐘後出現（${t}）`,
    `距離你約 ${Math.round(m.dist)} 公尺`,
    `https://maps.google.com/?q=${m.lat},${m.lng}`,
  ].join('\n');
}
