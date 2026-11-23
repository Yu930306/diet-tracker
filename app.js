/* 饮食记录 · 联网版 (Supabase)
   - 没有早餐栏，只有午餐 / 晚餐 / 加餐（加餐 20:00）。
   - 食谱按日期，午餐/晚餐/加餐各一条，来自 seed.js（与 Muse 版原文一致）。
   - 记录页每张餐卡：食谱（要求）+ 实际吃了什么 + 拍照 + 打卡。没有当天总结卡。
   - 周总结页只有两项：这一周打卡几次 + 体重记录（一周一次）。
   - 时间表页只有一个倒计时：到 2026-12-23，日期黑字放大，天数红字放大。
   - 默认只有一个档案（档案1，26岁女生）；页面上有“+ 添加档案”按钮，
     用户自己点一下、输个名字就能加人，不用改代码，新档案两部手机同步可见。
*/
(function () {
  'use strict';
  var CFG = window.DIET_CONFIG || {};
  var MEALS = [
    { key: 'lunch', name: '午餐', time: '12:00' },
    { key: 'dinner', name: '晚餐', time: '18:00' },
    { key: 'snack', name: '加餐', time: '20:00' }
  ];
  // 默认档案：只有档案1。用户通过“添加档案”自己加人，加的档案存在
  // Supabase profiles 表里，两部手机同步可见，不用改代码。
  var DEFAULT_PROFILES = [
    { id: 'person1', name: '档案1', sex: '女', age: 26, height_cm: 167, start_weight_kg: 51.5, plan_start_date: '2026-11-23', snack_time: '20:00' }
  ];
  var profiles = DEFAULT_PROFILES.slice();
  // 食物库：每 100g 的碳水 / 蛋白 / 脂肪（克），标准参考值。
  // 热量 = 碳水x4 + 蛋白x4 + 脂肪x9。
  var FOOD_LIBRARY = [
    ['米饭（熟）', 26, 2.6, 0.3], ['杂粮饭（熟）', 25, 3.5, 1.0], ['燕麦片', 66, 13, 7],
    ['红薯（熟）', 20, 1.2, 0.2], ['玉米（熟）', 19, 3.2, 1.5], ['土豆', 17, 2, 0.1],
    ['南瓜', 6, 1, 0.1], ['面条（熟）', 25, 4, 0.5], ['饺子', 25, 8, 6],
    ['面包（白）', 49, 9, 3], ['鸡胸肉', 0, 31, 3.6], ['鸡腿肉去皮', 0, 24, 6],
    ['牛肉（瘦）', 0, 26, 9], ['虾仁', 1, 20, 1], ['鲈鱼', 0, 18, 2], ['鲷鱼', 0, 20, 2],
    ['鸡蛋（全蛋）', 1, 13, 10], ['牛奶', 5, 3.2, 3.6], ['酸奶（无糖）', 5, 3.5, 3],
    ['坚果（混合）', 20, 15, 50], ['苹果', 14, 0.3, 0.2], ['香蕉', 22, 1, 0.3],
    ['蓝莓', 14, 0.7, 0.3], ['草莓', 8, 0.7, 0.3], ['柚子', 10, 0.8, 0.1],
    ['橙子', 12, 0.9, 0.2], ['西兰花', 4, 3, 0.4], ['青菜', 2, 1.5, 0.3],
    ['黄瓜', 3, 0.7, 0.2], ['番茄', 4, 0.9, 0.2], ['豆腐', 4, 8, 5]
  ];

  var sb = null;
  var room = localStorage.getItem('dt_room') || '';
  var state = { profileId: 'person1', date: todayStr(), tab: 'record', weekStart: weekStartOf(todayStr()) };
  var cache = { plans: {}, foods: {}, photos: {}, checkins: {} };

  function el(id) { return document.getElementById(id); }
  function todayStr() { return fmtDate(new Date()); }
  function fmtDate(d) {
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }
  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); }
  function weekStartOf(s) {
    var d = parseDate(s), dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow); return fmtDate(d);
  }
  function weekLabel(ws) {
    var we = addDays(ws, 6);
    return ws.slice(5) + ' ~ ' + we.slice(5);
  }
  function dateLabel(s) {
    var d = parseDate(s), week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + week + (s === todayStr() ? ' · 今天' : '');
  }
  function daysUntil(targetStr) {
    var t = parseDate(targetStr), n = new Date();
    t.setHours(0, 0, 0, 0); n.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((t - n) / 86400000));
  }
  function kcal(c, p, f) { return Math.round(c * 4 + p * 4 + f * 9); }
  function setStatus(msg, isErr) {
    var s = el('status'); s.textContent = msg || ''; s.className = isErr ? 'err' : '';
  }

  function init() {
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY === 'PASTE_ANON_KEY_HERE') {
      setStatus('还没有填 Supabase anon key：请在 config.js 里填好再打开。', true);
    } else {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    }
    bindChrome();
    renderCountdown();
    if (!room) { el('roomGate').classList.remove('hidden'); return; }
    enterRoom(room);
  }

  function bindChrome() {
    renderProfileBar();
    el('addProfileBtn').addEventListener('click', addProfile);
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.dataset.tab;
        document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
        el('tab-record').classList.toggle('hidden', state.tab !== 'record');
        el('tab-weekly').classList.toggle('hidden', state.tab !== 'weekly');
        el('tab-time').classList.toggle('hidden', state.tab !== 'time');
        if (state.tab === 'weekly') loadWeekly();
        if (state.tab === 'time') renderCountdown();
      });
    });
    el('roomEnter').addEventListener('click', function () {
      var v = el('roomInput').value.trim();
      if (!v) { alert('请先输入房间码'); return; }
      room = v; localStorage.setItem('dt_room', room);
      enterRoom(room);
    });
    el('prevDay').addEventListener('click', function () { state.date = addDays(state.date, -1); loadAll(); });
    el('nextDay').addEventListener('click', function () { state.date = addDays(state.date, 1); loadAll(); });
    el('todayBtn').addEventListener('click', function () { state.date = todayStr(); loadAll(); });
    el('prevWeek').addEventListener('click', function () { state.weekStart = addDays(state.weekStart, -7); loadWeekly(); });
    el('nextWeek').addEventListener('click', function () { state.weekStart = addDays(state.weekStart, 7); loadWeekly(); });
    el('weightSave').addEventListener('click', saveWeight);
  }

  // 档案栏：按 profiles 列表渲染（默认只有档案1），后面跟“+ 添加档案”。
  function renderProfileBar() {
    var bar = el('profileBar');
    bar.querySelectorAll('button[data-profile]').forEach(function (b) { b.remove(); });
    var addBtn = el('addProfileBtn');
    profiles.forEach(function (p) {
      var b = document.createElement('button');
      b.dataset.profile = p.id;
      b.textContent = p.name;
      b.className = p.id === state.profileId ? 'active' : '';
      b.addEventListener('click', function () {
        state.profileId = p.id;
        renderProfileBar();
        loadAll();
      });
      bar.insertBefore(b, addBtn);
    });
  }

  // 从 Supabase 读本房间的档案（用户自己加的也在里面），没有就只留档案1。
  async function loadProfiles() {
    try {
      var r = await sb.from('profiles').select('*').eq('room_code', room).order('id');
      if (r.error) throw r.error;
      if (r.data && r.data.length) {
        profiles = r.data.map(function (x) {
          return { id: x.id, name: x.name, sex: x.sex || '', age: x.age, height_cm: x.height_cm, start_weight_kg: x.start_weight_kg, plan_start_date: x.plan_start_date || '2026-11-23', snack_time: x.snack_time || '20:00' };
        });
        if (!profiles.some(function (p) { return p.id === state.profileId; })) state.profileId = profiles[0].id;
      }
      renderProfileBar();
    } catch (e) { renderProfileBar(); }
  }

  // “+ 添加档案”：用户自己点一下、输个名字就能加人，不用改代码。
  // 新档案写进 Supabase profiles 表，两部手机同步可见；食谱要自己填，
  // 或者以后每周按日期写（新档案默认没有预置食谱）。
  async function addProfile() {
    var n = profiles.length;
    var name = prompt('新档案叫什么名字？', '档案' + (n + 1));
    if (name == null) return;
    name = String(name).trim();
    if (!name) { alert('名字不能为空'); return; }
    var id = 'person' + (n + 1);
    while (profiles.some(function (p) { return p.id === id; })) id = 'person' + (parseInt(id.slice(6), 10) + 1);
    var row = { room_code: room, id: id, name: name, sex: '', age: null, height_cm: null, start_weight_kg: null, plan_start_date: '2026-11-23', snack_time: '20:00' };
    if (!sb) { alert('还没有连接 Supabase，稍后再试'); return; }
    var r = await sb.from('profiles').upsert(row, { onConflict: 'room_code,id' });
    if (r.error) { alert('添加失败：' + r.error.message); return; }
    profiles.push({ id: id, name: name, sex: '', age: null, height_cm: null, start_weight_kg: null, plan_start_date: '2026-11-23', snack_time: '20:00' });
    state.profileId = id;
    renderProfileBar();
    loadAll();
  }

  async function enterRoom(r) {
    el('roomGate').classList.add('hidden');
    if (!sb) { setStatus('还没有填 Supabase anon key，数据无法同步。', true); return; }
    setStatus('正在同步房间 ' + r + ' …');
    try {
      await ensureProfiles();
      await loadProfiles();
      await ensureSeeded();
      subscribeRealtime();
      setInterval(loadAll, 30000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) loadAll(); });
      setStatus('已连接 · 房间 ' + r + ' · 两部手机输同一个码就能同步');
      loadAll();
    } catch (e) {
      setStatus('同步失败：' + (e && e.message ? e.message : e), true);
    }
  }

  async function ensureProfiles() {
    // 只保证档案1存在（默认档案）。用户自己加的档案由 addProfile 写库，
    // 这里不补档案2，不再自动造第二个档案。
    var p = DEFAULT_PROFILES[0];
    var r = await sb.from('profiles').upsert(
      { room_code: room, id: p.id, name: p.name, sex: p.sex, age: p.age, height_cm: p.height_cm, start_weight_kg: p.start_weight_kg, plan_start_date: p.plan_start_date, snack_time: p.snack_time },
      { onConflict: 'room_code,id' });
    if (r.error) throw r.error;
  }

  async function ensureSeeded() {
    // 只给档案1种食谱（新加的档案自己填）。房间里还没有任何食谱时才种一次。
    var r = await sb.from('meal_plans').select('date', { count: 'exact', head: true }).eq('room_code', room).eq('profile_id', 'person1');
    if (r.error) throw r.error;
    if ((r.count || 0) > 0) return;
    var rows = (window.SEED_MEAL_PLANS || []).map(function (m) {
      return { room_code: room, profile_id: 'person1', date: m.date, meal: m.meal, content: m.content };
    });
    for (var i = 0; i < rows.length; i += 100) {
      var rr = await sb.from('meal_plans').upsert(rows.slice(i, i + 100), { onConflict: 'room_code,profile_id,date,meal' });
      if (rr.error) throw rr.error;
    }
  }

  function subscribeRealtime() {
    try {
      sb.channel('room-' + room)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plans', filter: 'room_code=eq.' + room }, loadAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'food_items', filter: 'room_code=eq.' + room }, loadAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_photos', filter: 'room_code=eq.' + room }, loadAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins', filter: 'room_code=eq.' + room }, loadAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_records', filter: 'room_code=eq.' + room }, loadWeekly)
        .subscribe();
    } catch (e) { /* realtime 失败也不影响手动刷新 */ }
  }

  async function loadAll() {
    if (!sb || !room) return;
    el('dateLabel').textContent = dateLabel(state.date);
    try {
      var day = state.date, pid = state.profileId;
      var plans = await sb.from('meal_plans').select('*').eq('room_code', room).eq('profile_id', pid).eq('date', day);
      var foods = await sb.from('food_items').select('*').eq('room_code', room).eq('profile_id', pid).eq('date', day).order('created_at');
      var photos = await sb.from('meal_photos').select('*').eq('room_code', room).eq('profile_id', pid).eq('date', day).order('created_at');
      var checks = await sb.from('checkins').select('*').eq('room_code', room).eq('profile_id', pid).eq('date', day);
      if (plans.error) throw plans.error;
      cache.plans = {}; (plans.data || []).forEach(function (x) { cache.plans[x.meal] = x.content; });
      cache.foods = {}; (foods.data || []).forEach(function (x) { (cache.foods[x.meal] = cache.foods[x.meal] || []).push(x); });
      cache.photos = {}; (photos.data || []).forEach(function (x) { (cache.photos[x.meal] = cache.photos[x.meal] || []).push(x); });
      cache.checkins = {}; (checks.data || []).forEach(function (x) { cache.checkins[x.meal] = !!x.done; });
      renderMeals();
      setStatus('已连接 · 房间 ' + room + ' · ' + dateLabel(day));
    } catch (e) {
      setStatus('同步失败：' + (e && e.message ? e.message : e), true);
    }
  }

  function renderMeals() {
    var wrap = el('mealCards'); wrap.innerHTML = '';
    MEALS.forEach(function (m) {
      var card = document.createElement('div'); card.className = 'card';
      var recipe = cache.plans[m.key] || '';
      var done = !!cache.checkins[m.key];
      var foods = cache.foods[m.key] || [];
      var photos = cache.photos[m.key] || [];
      var html = '<h2>' + m.name + '<span class="time">' + m.time + '</span></h2>' +
        '<p class="muted">食谱 · ' + dateLabel(state.date) + ' · 这一餐吃什么（要求）· 按日期定</p>' +
        '<textarea data-meal="' + m.key + '" placeholder="如：鸡胸150g + 杂粮饭150g + 西兰花200g">' + escapeHtml(recipe) + '</textarea>' +
        '<p><span class="saved" data-saved="' + m.key + '"></span></p>' +
        '<p class="muted">食谱按日期定，每天可以不一样；改的是上面选定的那一天。填食谱只是计划，不打卡；实际吃完在下面打卡。</p>' +
        '<hr style="border:0;border-top:1px solid #efe8d6;margin:14px 0">' +
        '<p style="margin:0 0 6px"><b>实际吃了什么 · 打卡</b> <span class="muted">按真正吃下去的记，吃完才点打卡</span></p>' +
        '<div data-foods="' + m.key + '"></div>' +
        '<div class="addfood">' +
        '<select data-lib="' + m.key + '">' + FOOD_LIBRARY.map(function (f, i) {
          return '<option value="' + i + '">' + f[0] + '（碳水' + f[1] + '/蛋白' + f[2] + '/脂肪' + f[3] + ' /100g）</option>';
        }).join('') + '<option value="custom">自定义食物…</option></select>' +
        '<input type="number" min="1" placeholder="克数" data-grams="' + m.key + '">' +
        '<button class="btn small" data-addfood="' + m.key + '" style="width:auto">+ 添加食物</button>' +
        '</div>' +
        '<div data-custom="' + m.key + '" class="hidden" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<input placeholder="食物名" data-cname="' + m.key + '" style="flex:2;padding:9px;border:1px solid #d8cfbc;border-radius:9px">' +
        '<input type="number" step="0.1" placeholder="碳水/100g" data-cc="' + m.key + '" style="flex:1;padding:9px;border:1px solid #d8cfbc;border-radius:9px">' +
        '<input type="number" step="0.1" placeholder="蛋白/100g" data-cp="' + m.key + '" style="flex:1;padding:9px;border:1px solid #d8cfbc;border-radius:9px">' +
        '<input type="number" step="0.1" placeholder="脂肪/100g" data-cf="' + m.key + '" style="flex:1;padding:9px;border:1px solid #d8cfbc;border-radius:9px">' +
        '</div>' +
        '<div style="margin-top:10px"><label class="btn secondary small" style="display:inline-block;text-align:center">拍照 / 选图<input type="file" accept="image/*" data-photo="' + m.key + '" style="display:none"></label></div>' +
        '<div class="thumbs" data-photos="' + m.key + '"></div>' +
        '<button class="btn ' + (done ? 'done' : 'notdone') + '" data-checkin="' + m.key + '" style="margin-top:12px">' + (done ? '✓ 这一餐已打卡 · 点一下取消' : '打卡 · 这一餐实际吃完了再点') + '</button>';
      card.innerHTML = html;
      wrap.appendChild(card);
      // foods list
      var fl = card.querySelector('[data-foods="' + m.key + '"]');
      foods.forEach(function (f) {
        var c = f.carbs100 * f.grams / 100, p = f.protein100 * f.grams / 100, fa = f.fat100 * f.grams / 100;
        var row = document.createElement('div'); row.className = 'foodrow';
        row.innerHTML = '<span>' + escapeHtml(f.name) + ' ' + f.grams + 'g</span><span>碳水' + c.toFixed(1) + 'g · 蛋白' + p.toFixed(1) + 'g · 脂肪' + fa.toFixed(1) + 'g · ' + kcal(c, p, fa) + '大卡</span><button class="del" data-delfood="' + f.id + '">×</button>';
        fl.appendChild(row);
      });
      // photos
      var ph = card.querySelector('[data-photos="' + m.key + '"]');
      photos.forEach(function (p) {
        var d = document.createElement('div'); d.className = 'ph';
        d.innerHTML = '<img src="' + p.url + '" alt="餐食照片"><button data-delphoto="' + p.id + '">×</button>';
        ph.appendChild(d);
      });
      // events
      var ta = card.querySelector('textarea');
      ta.addEventListener('blur', function () { saveRecipe(m.key, ta.value); });
      card.querySelector('[data-lib="' + m.key + '"]').addEventListener('change', function (e) {
        card.querySelector('[data-custom="' + m.key + '"]').classList.toggle('hidden', e.target.value !== 'custom');
      });
      card.querySelector('[data-addfood="' + m.key + '"]').addEventListener('click', function () { addFood(m.key, card); });
      card.querySelector('[data-photo="' + m.key + '"]').addEventListener('change', function (e) { uploadPhoto(m.key, e.target.files[0]); });
      card.querySelector('[data-checkin="' + m.key + '"]').addEventListener('click', function () { toggleCheckin(m.key); });
      card.querySelectorAll('[data-delfood]').forEach(function (b) {
        b.addEventListener('click', async function () { await sb.from('food_items').delete().eq('id', b.dataset.delfood); loadAll(); });
      });
      card.querySelectorAll('[data-delphoto]').forEach(function (b) {
        b.addEventListener('click', async function () {
          var row = (cache.photos[m.key] || []).find(function (x) { return String(x.id) === b.dataset.delphoto; });
          if (row && row.path) { try { await sb.storage.from('meal-photos').remove([row.path]); } catch (e) {} }
          await sb.from('meal_photos').delete().eq('id', b.dataset.delphoto); loadAll();
        });
      });
    });
  }

  async function saveRecipe(meal, content) {
    var r = await sb.from('meal_plans').upsert(
      { room_code: room, profile_id: state.profileId, date: state.date, meal: meal, content: content },
      { onConflict: 'room_code,profile_id,date,meal' });
    var s = document.querySelector('[data-saved="' + meal + '"]');
    if (s) s.textContent = r.error ? ('保存失败：' + r.error.message) : '✓ 食谱已保存';
  }

  async function addFood(meal, card) {
    var libSel = card.querySelector('[data-lib="' + meal + '"]');
    var grams = parseFloat(card.querySelector('[data-grams="' + meal + '"]').value);
    if (!grams || grams <= 0) { alert('请先填克数'); return; }
    var name, c, p, f;
    if (libSel.value === 'custom') {
      name = card.querySelector('[data-cname="' + meal + '"]').value.trim();
      c = parseFloat(card.querySelector('[data-cc="' + meal + '"]').value) || 0;
      p = parseFloat(card.querySelector('[data-cp="' + meal + '"]').value) || 0;
      f = parseFloat(card.querySelector('[data-cf="' + meal + '"]').value) || 0;
      if (!name) { alert('请填食物名'); return; }
    } else {
      var item = FOOD_LIBRARY[+libSel.value];
      name = item[0]; c = item[1]; p = item[2]; f = item[3];
    }
    var r = await sb.from('food_items').insert({ room_code: room, profile_id: state.profileId, date: state.date, meal: meal, name: name, grams: grams, carbs100: c, protein100: p, fat100: f });
    if (r.error) { alert('添加失败：' + r.error.message); return; }
    loadAll();
  }

  async function uploadPhoto(meal, file) {
    if (!file) return;
    setStatus('正在上传照片…');
    try {
      var img = await fileToImage(file);
      var blob = await compressImage(img);
      var path = room + '/' + state.profileId + '/' + state.date + '/' + meal + '/' + Date.now() + '.jpg';
      var up = await sb.storage.from('meal-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      var pub = sb.storage.from('meal-photos').getPublicUrl(path);
      var ins = await sb.from('meal_photos').insert({ room_code: room, profile_id: state.profileId, date: state.date, meal: meal, url: pub.data.publicUrl, path: path });
      if (ins.error) throw ins.error;
      setStatus('照片已上传');
      loadAll();
    } catch (e) {
      setStatus('照片上传失败：' + (e && e.message ? e.message : e), true);
    }
  }
  function fileToImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = rej; img.src = url;
    });
  }
  function compressImage(img) {
    return new Promise(function (res) {
      var max = 1200, w = img.width, h = img.height;
      if (w > max || h > max) { var k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(function (b) { res(b); }, 'image/jpeg', 0.82);
    });
  }

  async function toggleCheckin(meal) {
    var done = !cache.checkins[meal];
    var r = await sb.from('checkins').upsert(
      { room_code: room, profile_id: state.profileId, date: state.date, meal: meal, done: done },
      { onConflict: 'room_code,profile_id,date,meal' });
    if (r.error) { alert('打卡失败：' + r.error.message); return; }
    cache.checkins[meal] = done;
    renderMeals();
  }

  async function loadWeekly() {
    if (!sb || !room) return;
    el('weekLabel').textContent = '第 ' + weekNo(state.weekStart) + ' 周 · ' + weekLabel(state.weekStart);
    try {
      var ws = state.weekStart, we = addDays(ws, 7);
      var chk = await sb.from('checkins').select('date', { count: 'exact', head: true })
        .eq('room_code', room).eq('profile_id', state.profileId).eq('done', true)
        .gte('date', ws).lt('date', we);
      if (chk.error) throw chk.error;
      el('weekCheckins').textContent = chk.count || 0;
      var w = await sb.from('weight_records').select('*').eq('room_code', room).eq('profile_id', state.profileId).eq('week_start', ws).maybeSingle();
      if (w.error) throw w.error;
      if (w.data) el('weightInput').value = w.data.weight_jin;
      var latest = await sb.from('weight_records').select('*').eq('room_code', room).eq('profile_id', state.profileId).order('week_start', { ascending: false }).limit(1);
      if (latest.error) throw latest.error;
      if (latest.data && latest.data.length) {
        var r0 = latest.data[0];
        var d = r0.updated_at ? r0.updated_at.slice(0, 10) : r0.week_start;
        el('currentWeight').textContent = r0.weight_jin + ' 斤（' + d + '记的）';
      } else {
        el('currentWeight').textContent = '最近一周还没有体重记录';
      }
    } catch (e) {
      setStatus('周总结加载失败：' + (e && e.message ? e.message : e), true);
    }
  }
  function weekNo(ws) {
    var start = parseDate('2026-11-23'), d = parseDate(ws);
    return Math.floor((d - start) / (7 * 86400000)) + 1;
  }

  async function saveWeight() {
    var v = parseFloat(el('weightInput').value);
    if (!v || v < 20 || v > 200) { alert('请填体重（斤），20~200'); return; }
    var r = await sb.from('weight_records').upsert(
      { room_code: room, profile_id: state.profileId, week_start: state.weekStart, weight_jin: v },
      { onConflict: 'room_code,profile_id,week_start' });
    if (r.error) { alert('保存失败：' + r.error.message); return; }
    loadWeekly();
  }

  function renderCountdown() {
    var target = (CFG.TARGET_DATE || '2026-12-23');
    var d = parseDate(target);
    el('cdDate').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    el('cdDays').textContent = daysUntil(target);
    var t = new Date(), week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][t.getDay()];
    el('cdNote').textContent = '按系统日期自动算 · 今天 ' + (t.getMonth() + 1) + '月' + t.getDate() + '日 · ' + week;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
