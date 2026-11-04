import { findDue, formatMessage, shouldSaveLocation } from './lib.js';
import { fetchMushrooms } from './source.js';

const LOC_KEY = 'loc';
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

async function getCfg(env) {
  const saved = (await env.STATE.get(CFG_KEY, 'json')) || {};
  return {
    radiusM: saved.radiusM ?? Number(env.RADIUS_M || 1000),
    leadMin: Number(env.LEAD_MIN || 3),
    paused: saved.paused ?? false,
  };
}

async function handleUpdate(env, update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;
  // 只接受自己的聊天室，避免別人亂用你的 bot
  if (String(msg.chat.id) !== String(env.TELEGRAM_CHAT_ID)) {
    if (msg.text === '/start') {
      await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: `你的 chat id 是 ${msg.chat.id}，請設定到 TELEGRAM_CHAT_ID。` });
    }
    return;
  }

  if (msg.location) {
    const next = { lat: msg.location.latitude, lng: msg.location.longitude, ts: Date.now() };
    const prev = await env.STATE.get(LOC_KEY, 'json');
    if (shouldSaveLocation(prev, next)) await env.STATE.put(LOC_KEY, JSON.stringify(next));
    if (update.message && !msg.location.live_period) await say(env, '📍 已更新位置（建議改用「分享即時位置」，移動時會自動更新）');
    return;
  }

  const text = (msg.text || '').trim();
  const cfg = await getCfg(env);
  const saved = (await env.STATE.get(CFG_KEY, 'json')) || {};
  if (text.startsWith('/radius')) {
    const r = Number(text.split(/\s+/)[1]);
    if (!(r > 0)) return say(env, '用法：/radius 800（公尺）');
    await env.STATE.put(CFG_KEY, JSON.stringify({ ...saved, radiusM: r }));
    return say(env, `半徑設為 ${r} 公尺`);
  }
  if (text === '/stop') {
    await env.STATE.put(CFG_KEY, JSON.stringify({ ...saved, paused: true }));
    return say(env, '⏸ 已暫停提醒，/go 恢復');
  }
  if (text === '/go') {
    await env.STATE.put(CFG_KEY, JSON.stringify({ ...saved, paused: false }));
    return say(env, '▶️ 已恢復提醒');
  }
  if (text === '/status' || text === '/start') {
    const loc = await env.STATE.get(LOC_KEY, 'json');
    const age = loc ? Math.round((Date.now() - loc.ts) / 60000) + ' 分鐘前' : '尚未收到';
    return say(env, [
      `狀態：${cfg.paused ? '暫停' : '運作中'}`,
      `半徑：${cfg.radiusM} 公尺，提前 ${cfg.leadMin} 分鐘`,
      `最後位置：${age}`,
      `資料來源：${env.SOURCE_URL ? '已設定' : '尚未設定'}`,
      '',
      '在 Telegram 點 📎 → 位置 → 分享即時位置，就會依你所在位置提醒。',
      '指令：/radius 公尺、/stop、/go、/status',
    ].join('\n'));
  }
}

async function tick(env) {
  const cfg = await getCfg(env);
  if (cfg.paused) return;
  const loc = await env.STATE.get(LOC_KEY, 'json');
  const maxAge = Number(env.LOC_MAX_AGE_MIN || 30) * 60000;
  if (!loc || Date.now() - loc.ts > maxAge) return; // 沒有近期位置就不提醒

  const now = Date.now();
  const due = findDue(await fetchMushrooms(env), loc, { ...cfg, now });
  for (const m of due) {
    const key = `sent:${m.id}:${m.appearAt}`;
    if (await env.STATE.get(key)) continue;
    await say(env, formatMessage(m, now));
    await env.STATE.put(key, '1', { expirationTtl: 3600 });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/telegram') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
      await handleUpdate(env, await req.json());
      return new Response('ok');
    }
    return new Response('mushroom-notifier', { status: 200 });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};
