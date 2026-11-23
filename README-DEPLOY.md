# 饮食记录 · 联网版（Supabase）— 部署说明

目标：两部 iPhone 打开同一个网址，输同一个房间码，互相看、互相改，不用 Muse 账号，不用上架 App Store，iPhone 上“分享 → 添加到主屏幕”当 App 用。

## 已做好的东西（都在 `~/workspace/diet-tracker-net/`）

- `index.html` + `app.js` + `seed.js` + `config.js`：完整静态应用。
  - 没有早餐栏，只有午餐 12:00 / 晚餐 18:00 / 加餐 20:00。
  - 食谱按日期，63 条（2026-11-23 至 2026-12-13，每天午/晚/加餐各一）与 Muse 版原文一致，第一次打开房间时自动种进 Supabase。
  - 每张餐卡：食谱（要求）+ 实际吃了什么（食物库选 + 克数自动算碳水/蛋白/脂肪/热量，热量=碳水×4+蛋白×4+脂肪×9）+ 拍照（相机/相册，压缩后上传）+ 打卡。
  - 没有当天总结卡（已按要求删掉）。
  - 周总结页只有两项：这一周打卡几次 + 体重记录（一周一次，一个输入框+保存；当前体重默认取最近一周的最新记录）。
  - 时间表页只有一个倒计时：到 2026年12月23日，日期黑字放大，天数红字放大，按系统日期自动算（11月23日是 30 天）。
  - 两个档案互相看、互相改；Realtime + 30 秒轮询 + 回前台刷新。
  - 第四周碳水目标已按用户要求改成 77g（1.5 倍，51.5kg × 1.5），记在 `config.js` 里。
- `supabase-setup.sql`：建表 + RLS 全开 + 拍照存储桶，一次性在 Supabase SQL Editor 里跑完。
- `verify.js`：沙箱自验脚本（见“已验证”）。

## 档案：默认只有一个（档案1），用户自己能加人

- 打开页面默认只有 **档案1**（26 岁、167cm、51.5kg 那份），没有档案2。
- 档案栏有个 **“+ 添加档案”** 按钮：用户点一下、输个名字就能加人，写进 Supabase `profiles` 表，两部手机同步可见，不用改代码。新加的档案默认没有预置食谱，食谱自己按日期填。
- `app.js` 里 `DEFAULT_PROFILES` 只有档案1；`ensureProfiles()` 只保证档案1存在，不再自动造档案2；进房间时 `loadProfiles()` 会从 Supabase 读本房间已有的档案。

## 还差两步才能上线（2026-11-23 15:55 实测状态）

- ✅ anon key 已填进 `config.js`（`PASTE_ANON_KEY_HERE` 已替换，沙箱 `verify.js` 40 项全过）。
- ❌ **Supabase 建表还没跑**：用 anon key 直接调 REST 查过，`meal_plans` / `profiles` / `checkins` / `weight_records` 全部返回 404（表不存在）。子 agent 没有浏览器、没有数据库密码，跑不了 SQL。**需主 agent 在浏览器里打开 Supabase SQL Editor 粘贴 `supabase-setup.sql` 跑一次**，看到 `tables 6` 和 `rls on 6` 即可。SQL Editor 地址：https://supabase.com/dashboard/project/udtijnuefwfvgnjyofyx/sql
- ❌ **部署还没成**：Vercel 在本环境仍是 `not_connected`（`refresh` 报错 no refresh token），用户说的“授权好了”没有落到这里；GitHub MCP 是连着的（Yu930306），但 `create_repository` 返回 403 `Resource not accessible by integration`，建不了公开仓 `Yu930306/diet-tracker`（集成没有建仓权限）。**需主 agent/用户在浏览器里手动建公开仓**（github.com → New repository → `diet-tracker` → Public），或者重新走一遍 Vercel 授权让连接真正生效；建好仓后把本目录 6 个文件推上去（或告诉子 agent 仓已建好，由子 agent 推），再开 GitHub Pages（Settings → Pages → main 分支）或从 Vercel 导入，得到上线地址。

### 第 1 步：拿 anon key（Supabase 后台已开着那个浏览器标签就能看到）
- 打开的标签页：Supabase Dashboard → diet-tracker 项目 → Settings → API Keys（legacy 页）。
- 复制 **anon public** key（很长的一串，以 `eyJ` 开头），填进 `config.js` 里 `SUPABASE_ANON_KEY` 的引号里，替换掉 `PASTE_ANON_KEY_HERE`。
- 注意：只填 anon key，**不要**填 service_role key（那个是服务端密钥，绝不能放进前端）。
- 密钥不要发到用户聊天里。由主 agent 在内部交接时传给我（子 agent 跟进消息），我填好再验。

### 第 2 步：跑 SQL + 部署上线（二选一，A 更省事）
- 先在 Supabase SQL Editor 里跑一遍 `supabase-setup.sql`（Dashboard → SQL Editor → New query → 粘贴 → Run），看到最后两行 `tables 6` 和 `rls on 6` 就是建好了。

- **路线 A（推荐）：Vercel 部署。** 2026-11-23 15:55 实测本环境仍是 `not_connected`，用户点的授权没有落到这里（`refresh` 报错 no refresh token）。需重新走一遍授权并确认连接真正生效，再导入仓库部署。
- **路线 B：GitHub Pages。** 新建公开仓 `Yu930306/diet-tracker`，推入这 6 个文件，仓库 Settings → Pages → Source 选 main 分支，得到 `https://yu930306.github.io/diet-tracker/`。**注意：子 agent 试过用 GitHub MCP 建仓，返回 403（集成没有建仓权限），所以这一步必须在浏览器里手动建仓**，建好后子 agent 可以推文件。

两个路线都要“新建一个公开仓”或“连 Vercel 授权”，这两步没有用户点头不能做，所以这里**没有**可用的上线地址，也没有编造。

## 已验证（沙箱，2026-11-23）

跑 `node verify.js` 全部通过：
- seed 63 条，每天午/晚/加餐各 1 条，覆盖 2026-11-23 至 2026-12-13，无早餐；抽查与 Muse 版 getstate 逐字一致。
- 倒计时：2026-11-23 到 2026-12-23 = 30 天；`index.html` 里日期是黑字大字、天数是红字大字。
- `app.js` / `seed.js` / `config.js` 语法检查通过；本地静态服务器能正常返回 `index.html`（200）。
- 周总结页代码里只有打卡次数 + 体重（每周一条）；记录页代码里没有任何当天总结卡。
- 实时同步、拍照上传、每周打卡计数、体重保存逻辑都已按 Supabase API 写好，但**没有真实 anon key 就连不上 Supabase，所以还没法实测**。

## 没有验证的（必须等上线后实测）

- 两部真机同时在线改同一条，另一部是不是立刻变（实时同步）。
- 真 iPhone 上点“拍照 / 选图”能不能调出相机和相册。
- Supabase 表和 RLS 实际跑通（等第 1、2 步做完后，用真 key 再验一遍）。

## 两部手机怎么用（上线后）

1. 两部手机都打开上线地址，iPhone：分享 → 添加到主屏幕。
2. 第一部手机先输一个房间码（例如 `reconet2026`），第二部输同一个码。
3. 第一次打开时食谱会自动出现（11月23日那周开始的 3 周）。档案1是 26 岁女生那份，档案2是空的，另一位自己填。
4. 体重一周记一次：周总结页填一次就行，当前体重会自动取最近一次。
