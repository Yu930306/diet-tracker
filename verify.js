// Sandbox verification for the networked diet-tracker build.
// Run: node verify.js   (exit 0 = all checks pass)
// Does NOT need the Supabase anon key: it checks the code + seed data only.
// Live Supabase sync still needs the real key (see README-DEPLOY.md).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const DIR = __dirname;
let fail = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  — ' + extra : ''));
  if (!ok) fail++;
}

// 1. JS syntax
['app.js', 'seed.js', 'config.js'].forEach(f => {
  try { execSync('node --check ' + path.join(DIR, f), { stdio: 'pipe' }); check('syntax ' + f, true); }
  catch (e) { check('syntax ' + f, false, e.message); }
});

// 2. Seed data (verbatim copy of Muse getstate mealPlans, minus breakfast)
const seedSrc = fs.readFileSync(path.join(DIR, 'seed.js'), 'utf8');
const SEED_MEAL_PLANS = eval(seedSrc + '; SEED_MEAL_PLANS');
check('seed rows = 63', SEED_MEAL_PLANS.length === 63, 'got ' + SEED_MEAL_PLANS.length);
const byWeek = { w1: 0, w2: 0, w3: 0 };
const seen = new Set();
let bad = [];
SEED_MEAL_PLANS.forEach(r => {
  const key = r.date + '|' + r.meal;
  if (seen.has(key)) bad.push('dup ' + key);
  seen.add(key);
  if (r.meal === 'breakfast') bad.push('breakfast row present');
  if (!r.content || !r.content.trim()) bad.push('empty ' + key);
  if (r.date >= '2026-11-23' && r.date <= '2026-11-29') byWeek.w1++;
  else if (r.date >= '2026-11-30' && r.date <= '2026-12-06') byWeek.w2++;
  else if (r.date >= '2026-12-07' && r.date <= '2026-12-13') byWeek.w3++;
  else bad.push('out of range ' + r.date);
});
check('seed 21 rows per week', byWeek.w1 === 21 && byWeek.w2 === 21 && byWeek.w3 === 21, JSON.stringify(byWeek));
check('seed no dups / no breakfast / no empty / in range', bad.length === 0, bad.slice(0, 5).join('; '));
// spot checks against getstate values
const spot = [
  ['2026-11-23', 'lunch', '清蒸鲈鱼 + 米饭220g熟 + 蔬菜不限量+鸡肉'],
  ['2026-11-23', 'snack', '酸奶一杯+ 坚果15g（饿了吃 不饿不吃）'],
  ['2026-11-26', 'lunch', 'subway 火鸡胸+一勺蛋 去酱'],
  ['2026-11-29', 'dinner', '麦麦板烧鸡腿堡 去酱 +玉米杯 或者+一袋苹果（500卡套餐）'],
  ['2026-12-03', 'lunch', 'Subway火鸡胸+一勺蛋去酱，6寸面包'],
  ['2026-12-06', 'lunch', '饺子12个+蔬菜不限量'],
  ['2026-12-13', 'lunch', '饺子10个+蔬菜不限量'],
  ['2026-12-10', 'dinner', '鸡蛋1个+红薯130g+蔬菜不限量+鸡肉150g']
];
let spotFail = [];
spot.forEach(([d, m, c]) => {
  const row = SEED_MEAL_PLANS.find(r => r.date === d && r.meal === m);
  if (!row || row.content !== c) spotFail.push(d + ' ' + m);
});
check('seed spot-check 8 rows verbatim', spotFail.length === 0, spotFail.join('; '));
// every date in range has exactly lunch+dinner+snack
let missing = [];
for (let d = new Date(2026, 10, 23); d <= new Date(2026, 11, 13); d.setDate(d.getDate() + 1)) {
  const ds = d.toISOString().slice(0, 10);
  ['lunch', 'dinner', 'snack'].forEach(m => { if (!seen.has(ds + '|' + m)) missing.push(ds + ' ' + m); });
}
check('every day 2026-11-23..2026-12-13 has lunch+dinner+snack', missing.length === 0, missing.slice(0, 5).join('; '));

// 3. Countdown math
function daysUntil(t, from) {
  const a = new Date(t + 'T00:00:00'), b = new Date(from + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}
check('countdown 2026-11-23 -> 2026-12-23 = 30 days', daysUntil('2026-12-23', '2026-11-23') === 30);
check('countdown 2026-11-24 -> 2026-12-23 = 29 days', daysUntil('2026-12-23', '2026-11-24') === 29);

// 4. HTML / app structure
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
check('no daily-summary card in UI', !html.includes('当天总热量') && !app.includes('当天总热量') && !html.includes('daily-summary'));
check('no breakfast meal in app', !app.includes("'breakfast'") && !html.includes('早餐'));
check('meals are lunch/dinner/snack only', app.includes("key: 'lunch'") && app.includes("key: 'dinner'") && app.includes("key: 'snack'"));
check('snack time 20:00', html.includes("'20:00'") || app.includes("'20:00'"));
check('countdown date black enlarged', html.includes('.cd-date') && html.includes('color: #111') && html.includes('font-size: 34px'));
check('countdown days red enlarged', html.includes('.cd-num') && html.includes('color: #c00') && html.includes('font-size: 88px'));
check('weekly page: check-in count + weekly weight only', html.includes('weekCheckins') && html.includes('weightInput') && !html.includes('本周目标') && !html.includes('一周食谱'));
check('single profile by default: only person1 in DEFAULT_PROFILES', app.includes("id: 'person1'") && !app.includes("id: 'person2'"));
check('no person2 button in HTML', !html.includes('data-profile="person2"') && !html.includes('档案2'));
check('add-profile button present in HTML', html.includes('id="addProfileBtn"') && html.includes('添加档案'));
check('addProfile() writes new profile to Supabase profiles', app.includes('async function addProfile()') && app.includes("sb.from('profiles').upsert"));
check('profiles loaded from Supabase on enterRoom', app.includes('async function loadProfiles()') && app.includes('await loadProfiles()'));
check('ensureProfiles only guarantees person1', app.includes('DEFAULT_PROFILES[0]') && !app.includes("id: 'person2'"));
check('room-code gate present', html.includes('roomGate') && app.includes('dt_room'));
check('realtime + interval refresh present', app.includes('postgres_changes') && app.includes('setInterval(loadAll, 30000)'));
check('photo upload uses camera/album input', app.includes('accept="image/*"') && app.includes('meal-photos'));
check('kcal formula carbs*4+protein*4+fat*9', app.includes('c * 4 + p * 4 + f * 9'));
check('week 4 target 77g in config', fs.readFileSync(path.join(DIR, 'config.js'), 'utf8').includes('4: 77'));

// 5. SQL setup
const sql = fs.readFileSync(path.join(DIR, 'supabase-setup.sql'), 'utf8');
['profiles', 'meal_plans', 'food_items', 'meal_photos', 'checkins', 'weight_records'].forEach(t => {
  check('sql has table ' + t, sql.includes('create table if not exists public.' + t));
  check('sql enables RLS on ' + t, sql.includes('alter table public.' + t + ' enable row level security'));
});
check('sql creates meal-photos bucket', sql.includes("'meal-photos'"));

console.log(fail === 0 ? '\nALL CHECKS PASSED' : '\n' + fail + ' CHECK(S) FAILED');
process.exit(fail === 0 ? 0 : 1);
