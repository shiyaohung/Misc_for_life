// 下載新北市「垃圾車路線」，只留指定行政區，輸出成 src/stops-data.js 打包進 Worker。
// （全市約 2.6 萬筆、18MB，Worker 免費方案每次只有 10ms CPU，沒辦法即時解析，所以先離線處理。）
//
// 用法：node scripts/update-stops.mjs [行政區=淡水區]
//      node scripts/update-stops.mjs 淡水區 --from <資料夾>   # 用已下載的 r0.json、r1.json…
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ID = 'edc3ad26-8ae7-4916-a00b-bc6048d19bf8';
const district = process.argv[2] || '淡水區';
const fromIdx = process.argv.indexOf('--from');

async function download() {
  const rows = [];
  for (let page = 0; page < 60; page++) {
    const res = await fetch(`https://data.ntpc.gov.tw/api/datasets/${ID}/json?page=${page}&size=1000`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const part = await res.json();
    rows.push(...part);
    console.error(`page ${page}: ${part.length}`);
    if (part.length < 1000) break;
  }
  return rows;
}

const rows = fromIdx > 0
  ? readdirSync(process.argv[fromIdx + 1]).filter((f) => /^r\d+\.json$/.test(f))
      .flatMap((f) => JSON.parse(readFileSync(join(process.argv[fromIdx + 1], f), 'utf8')))
  : await download();

const stops = rows
  .filter((r) => r.city === district)
  .map((r) => [String(r.lineid), r.linename, Number(r.rank), r.name, r.time, Number(r.latitude), Number(r.longitude)])
  .sort((a, b) => a[0].localeCompare(b[0]) || a[2] - b[2]);

const out = `// 自動產生：node scripts/update-stops.mjs ${district}（${new Date().toISOString().slice(0, 10)}）
// 欄位：[lineid, linename, rank, name, time, lat, lng]
export const DISTRICT = ${JSON.stringify(district)};
export default ${JSON.stringify(stops)};
`;
writeFileSync(new URL('../src/stops-data.js', import.meta.url), out);
console.error(`${district}: ${stops.length} 個清運點，${new Set(stops.map((s) => s[0])).size} 條路線`);
