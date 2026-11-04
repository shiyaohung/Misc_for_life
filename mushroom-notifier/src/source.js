// 蘑菇資料來源轉接層。
//
// 目前尚未決定資料來源（見 README「資料來源」）。這裡只定義介面：
// 回傳 [{ id: string, name?: string, lat: number, lng: number, appearAt: number(ms) }]
//
// 若設定了 SOURCE_URL，會抓取該網址並預期它「已經是上述格式」的 JSON 陣列。
// 確定實際來源後，把轉換邏輯寫在 normalize() 裡即可。

export async function fetchMushrooms(env) {
  if (!env.SOURCE_URL) return [];
  const res = await fetch(env.SOURCE_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`source HTTP ${res.status}`);
  return normalize(await res.json());
}

export function normalize(raw) {
  if (!Array.isArray(raw)) throw new Error('source: expected a JSON array');
  return raw
    .map((r) => ({
      id: String(r.id),
      name: r.name,
      lat: Number(r.lat),
      lng: Number(r.lng),
      appearAt: typeof r.appearAt === 'number' ? r.appearAt : Date.parse(r.appearAt),
    }))
    .filter((m) => m.id && Number.isFinite(m.lat) && Number.isFinite(m.lng) && Number.isFinite(m.appearAt));
}
