import { nearestStops, normTruck, parseTruckTime, stopsLeft, taipeiDate } from './lib.js';
import STOPS_RAW, { DISTRICT } from './stops-data.js';

const CFG_KEY = 'cfg';
const STOPS = STOPS_RAW.map(([lineid, linename, rank, name, time, lat, lng]) => ({ lineid, linename, rank, name, time, lat, lng }));

async function tg(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('telegram', method, res.status, await res.text());
}
const say = (env, text) => tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text });

// 新北市「垃圾清運車輛所在位置」，全市約 200 台，一頁就夠
async function fetchTrucks(env) {
  const res = await fetch(`https://data.ntpc.gov.tw/api/datasets/${env.REALTIME_DATASET}/json?page=0&size=1000`);
  if (!res.ok) throw new Error(`ntpc realtime HTTP ${res.status}`);
  return (await res.json()).map(normTruck);
}

async function handleUpdate(env, update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;
  if (String(msg.chat.id) !== String(env.TELEGRAM_CHAT_ID)) {
    if (msg.text === '/start') await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: `你的 chat id 是 ${msg.chat.id}，請設定到 TELEGRAM_CHAT_ID。` });
    return;
  }
  const cfg = (await env.STATE.get(CFG_KEY, 'json')) || {};
  const ahead = cfg.ahead ?? Number(env.AHEAD || 1);

  // 傳家裡位置 → 列出附近清運點讓你選
  if (msg.location && update.message) {
    const near = nearestStops(STOPS, { lat: msg.location.latitude, lng: msg.location.longitude }, 6);
    if (!near.length || near[0].dist > 2000) return say(env, `附近找不到${DISTRICT}的清運點 😢`);
    const lines = near.map((s) => `/pick_${s.lineid}_${s.rank}\n  ${s.name}（${s.linename}，表定 ${s.time}，${Math.round(s.dist)}m）`);
    return say(env, ['離你最近的清運點，點你平常倒垃圾的那一站：', '', ...lines].join('\n'));
  }

  const text = (msg.text || '').trim();
  const pick = text.match(/^\/pick[_ ](\d+)[_ ](\d+)/);
  if (pick) {
    const lineid = pick[1], rank = Number(pick[2]);
    const mine = STOPS.find((s) => s.lineid === lineid && s.rank === rank);
    if (!mine) return say(env, '找不到這一站，請重新傳位置');
    await env.STATE.put(CFG_KEY, JSON.stringify({ ...cfg, lineid, rank }));
    return say(env, `✅ 設定完成\n你家：${mine.name}（${mine.linename}，表定 ${mine.time}）\n垃圾車到你家前 ${ahead} 站時通知你。\n想早一點知道可以用 /ahead 3`);
  }
  const ah = text.match(/^\/ahead\s+(\d+)/);
  if (ah) {
    const n = Math.min(10, Math.max(1, Number(ah[1])));
    await env.STATE.put(CFG_KEY, JSON.stringify({ ...cfg, ahead: n }));
    return say(env, `好，垃圾車到你家前 ${n} 站時通知你`);
  }
  if (text === '/stop') { await env.STATE.put(CFG_KEY, JSON.stringify({ ...cfg, paused: true })); return say(env, '⏸ 已暫停，/go 恢復'); }
  if (text === '/go') { await env.STATE.put(CFG_KEY, JSON.stringify({ ...cfg, paused: false })); return say(env, '▶️ 已恢復'); }
  if (text === '/start' || text === '/status') {
    const mine = STOPS.find((s) => s.lineid === cfg.lineid && s.rank === cfg.rank);
    return say(env, [
      mine ? `你家：${mine.name}（${mine.linename}，表定 ${mine.time}）` : '還沒設定清運點',
      `提前 ${ahead} 站提醒，狀態：${cfg.paused ? '暫停' : '運作中'}`,
      '',
      '設定：點 📎 → 位置 → 傳送「家裡」的位置（傳一次就好），再點選清運點。',
      '指令：/status、/ahead 站數、/stop、/go',
    ].join('\n'));
  }
}

async function tick(env) {
  const cfg = (await env.STATE.get(CFG_KEY, 'json')) || {};
  if (!cfg.lineid || cfg.paused) return;
  const now = Date.now();
  const sentKey = `sent:${taipeiDate(now)}:${cfg.lineid}`;
  if (await env.STATE.get(sentKey)) return; // 今天已經通知過

  const lineStops = STOPS.filter((s) => s.lineid === cfg.lineid);
  const mine = lineStops.find((s) => s.rank === cfg.rank);
  const maxAge = Number(env.GPS_MAX_AGE_MIN || 10) * 60000;
  const trucks = (await fetchTrucks(env)).filter((t) => t.lineid === cfg.lineid && now - parseTruckTime(t.time) < maxAge);
  for (const t of trucks) {
    const left = stopsLeft(t, lineStops, cfg.rank, { ahead: cfg.ahead ?? Number(env.AHEAD || 1), nearM: Number(env.NEAR_M || 150) });
    if (left === null) continue;
    const head = left === 0
      ? `🚛 垃圾車已經到你家這站「${mine.name}」了，快！`
      : `🚛 垃圾車再 ${left} 站就到你家（${mine.name}），準備出門！`;
    await say(env, `${head}\n車子現在在：${t.location || '—'}\nhttps://maps.google.com/?q=${t.lat},${t.lng}`);
    await env.STATE.put(sentKey, '1', { expirationTtl: 86400 });
    return;
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/telegram') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      await handleUpdate(env, await req.json());
      return new Response('ok');
    }
    return new Response('garbage-notifier');
  },
  async scheduled(_e, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};
