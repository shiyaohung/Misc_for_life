import { nearestStops, normStop, normTruck, progress, taipeiDate } from './lib.js';

const CFG_KEY = 'cfg';

async function tg(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('telegram', method, res.status, await res.text());
}
const say = (env, text) => tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text });

// 新北市資料開放平台 API：/api/datasets/{id}/json?page=&size=
async function fetchDataset(env, id, maxPages = 30) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const url = `${env.NTPC_API || 'https://data.ntpc.gov.tw'}/api/datasets/${id}/json?page=${page}&size=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ntpc ${id} HTTP ${res.status}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function loadStops(env) {
  const rows = await fetchDataset(env, env.ROUTE_DATASET);
  return rows.map(normStop).filter((s) => !env.DISTRICT || s.city === env.DISTRICT);
}

async function handleUpdate(env, update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;
  if (String(msg.chat.id) !== String(env.TELEGRAM_CHAT_ID)) {
    if (msg.text === '/start') await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: `你的 chat id 是 ${msg.chat.id}，請設定到 TELEGRAM_CHAT_ID。` });
    return;
  }
  const cfg = (await env.STATE.get(CFG_KEY, 'json')) || {};

  // 傳家裡位置 → 列出附近清運點讓你選
  if (msg.location && update.message) {
    const here = { lat: msg.location.latitude, lng: msg.location.longitude };
    const near = nearestStops(await loadStops(env), here, 6);
    if (!near.length) return say(env, '附近找不到清運點 😢');
    const lines = near.map((s) => `/pick_${s.lineid}_${s.rank}\n  ${s.name}（${s.linename}，表定 ${s.time}，${Math.round(s.dist)}m）`);
    return say(env, ['離你最近的清運點，點選你平常倒垃圾的那一站：', '', ...lines].join('\n'));
  }

  const text = (msg.text || '').trim();
  const pick = text.match(/^\/pick[_ ](\S+?)[_ ](\d+)/);
  if (pick) {
    const [, lineid, rankStr] = pick;
    const rank = Number(rankStr);
    const lineStops = (await loadStops(env)).filter((s) => s.lineid === lineid);
    const mine = lineStops.find((s) => s.rank === rank);
    if (!mine) return say(env, '找不到這一站，請重新傳位置');
    const prev = lineStops.filter((s) => s.rank < rank).sort((a, b) => b.rank - a.rank)[0];
    const slim = lineStops.map(({ rank, name, lat, lng }) => ({ rank, name, lat, lng }));
    await env.STATE.put(CFG_KEY, JSON.stringify({ ...cfg, lineid, rank, mine, prev, stops: slim }));
    return say(env, `✅ 設定完成\n你家：${mine.name}（表定 ${mine.time}）\n前一站：${prev ? prev.name : '（沒有，會在車子到你家這站時通知）'}\n垃圾車到前一站時會通知你。`);
  }
  if (text === '/stop') { await env.STATE.put(CFG_KEY, JSON.stringify({ ...cfg, paused: true })); return say(env, '⏸ 已暫停，/go 恢復'); }
  if (text === '/go') { await env.STATE.put(CFG_KEY, JSON.stringify({ ...cfg, paused: false })); return say(env, '▶️ 已恢復'); }
  if (text === '/start' || text === '/status') {
    return say(env, [
      cfg.mine ? `你家：${cfg.mine.name}（路線 ${cfg.mine.linename}，表定 ${cfg.mine.time}）` : '還沒設定清運點',
      cfg.prev ? `前一站：${cfg.prev.name}` : '',
      `狀態：${cfg.paused ? '暫停' : '運作中'}`,
      '',
      '設定方式：點 📎 → 位置 → 傳送「家裡」的位置（不用即時分享），再點選清運點。',
      '指令：/status、/stop、/go',
    ].filter(Boolean).join('\n'));
  }
}

async function tick(env) {
  const cfg = (await env.STATE.get(CFG_KEY, 'json')) || {};
  if (!cfg.lineid || cfg.paused) return;
  const now = Date.now();
  const sentKey = `sent:${taipeiDate(now)}:${cfg.lineid}`;
  if (await env.STATE.get(sentKey)) return; // 今天已經通知過

  const trucks = (await fetchDataset(env, env.REALTIME_DATASET, 5)).map(normTruck).filter((t) => t.lineid === cfg.lineid);
  for (const t of trucks) {
    const p = progress(t, cfg.stops, cfg.rank, Number(env.NEAR_M || 150));
    if (!p) continue;
    const text = p === 'prev'
      ? `🚛 垃圾車到前一站「${cfg.prev.name}」了，下一站就是你家（${cfg.mine.name}），準備出門！`
      : `🚛 垃圾車已經到你家這站「${cfg.mine.name}」了，快！`;
    await say(env, `${text}\nhttps://maps.google.com/?q=${t.lat},${t.lng}`);
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
