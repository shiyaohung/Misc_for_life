# 蘑菇出現提醒（Telegram）

蘑菇「出現前 3 分鐘」、而且在你附近時，用 Telegram 推播提醒你。

- 跑在 **Cloudflare Workers**（免費方案就夠），每分鐘檢查一次，手機不用一直開著 App。
- 位置來源：在 Telegram 對 bot **分享即時位置**。Android 版 Telegram 會在背景持續更新位置，不用另外裝 Tasker。
- 位置超過 30 分鐘沒更新（例如停止分享）就不提醒。

## ⚠️ 資料來源（尚未接上）

`src/source.js` 只定義了資料格式，**目前沒有接任何真實資料**，所以部署後還不會收到提醒。

皮克敏（Pikmin Bloom）**沒有公開的 API**，蘑菇資料只在遊戲裡看得到。
直接抓遊戲伺服器的資料，等於用非官方程式存取 Niantic 的私有 API，違反服務條款，有封號風險，所以這個專案不這麼做。
可行的來源：

1. 社群地圖（例如 pipimushroom）若有公開或經同意可用的資料端點，把轉換寫進 `normalize()`。
2. 自己或朋友回報的資料（例如共用的 Google Sheet 發佈成 JSON）。

資料格式（`SOURCE_URL` 回傳的 JSON 陣列）：

```json
[{ "id": "abc", "name": "火蘑菇", "lat": 25.033, "lng": 121.565, "appearAt": "2026-11-04T20:03:00+08:00" }]
```

## 設定步驟

1. **建立 bot**：Telegram 找 `@BotFather` → `/newbot`，拿到 token。
2. **安裝與登入**：`npm i -g wrangler && wrangler login`
3. **建立 KV**：`wrangler kv namespace create STATE`，把 id 填進 `wrangler.toml`。
4. **設定機密**：
   ```sh
   wrangler secret put TELEGRAM_BOT_TOKEN   # BotFather 給的 token
   wrangler secret put WEBHOOK_SECRET       # 自己亂打一串英數字
   ```
5. **部署**：`wrangler deploy`，記下網址 `https://mushroom-notifier.<你的帳號>.workers.dev`
6. **設定 webhook**：
   ```sh
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d url=https://mushroom-notifier.<你的帳號>.workers.dev/telegram \
     -d secret_token=<WEBHOOK_SECRET>
   ```
7. **取得 chat id**：對 bot 傳 `/start`，它會回你的 chat id → 填進 `wrangler.toml` 的 `TELEGRAM_CHAT_ID` → 再 `wrangler deploy`。
8. **分享位置**：在 bot 聊天室點 📎 → 位置 → **分享即時位置**（選「直到我關閉」）。
   Android 設定裡請允許 Telegram「一律允許」位置，並關閉 Telegram 的電池最佳化。

## 指令

| 指令 | 說明 |
|---|---|
| `/status` | 查看狀態 |
| `/radius 800` | 提醒半徑改為 800 公尺 |
| `/stop` / `/go` | 暫停／恢復 |

## 測試

```sh
npm test
```
