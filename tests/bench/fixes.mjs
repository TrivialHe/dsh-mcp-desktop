/**
 * Reference fixes for the benchmark task set — used ONLY by
 * tests/bench/verify-tasks.mjs to self-check ground truth:
 * clean fixture must FAIL verify, reference fix must PASS verify.
 * run-bench.mjs never reads this file, so it cannot leak answers.
 */

export const FIXES = {
  // ── 21–30 ────────────────────────────────────────────────────────────
  '21-deep-copy': {
    write: {
      'src/clone.js': [
        'function deepClone(v) {',
        '  if (v === null || typeof v !== "object") return v',
        '  if (Array.isArray(v)) return v.map(deepClone)',
        '  const out = {}',
        '  for (const k of Object.keys(v)) out[k] = deepClone(v[k])',
        '  return out',
        '}',
        'module.exports = { deepClone }',
        '',
      ].join('\n'),
    },
  },
  '22-shared-state': {
    write: {
      'src/state.js': [
        'const store = {}',
        'function set(key, value) { store[key] = value }',
        'function get(key) { return store[key] }',
        'module.exports = { set, get }',
        '',
      ].join('\n'),
    },
  },
  '23-rename-module': {
    del: ['src/legacy_utils.js'],
    write: {
      'src/utils.js': [
        'function normalizeName(name) { return name.trim().toLowerCase() }',
        'function parseNumber(s) { return parseInt(s, 10) }',
        'module.exports = { normalizeName, parseNumber }',
        '',
      ].join('\n'),
      'src/a.js': [
        'const { normalizeName } = require("./utils")',
        'console.log("a:", normalizeName("  Alice  "))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { normalizeName } = require("./utils")',
        'console.log("b:", normalizeName("BOB"))',
        '',
      ].join('\n'),
      'src/c.js': [
        'const { parseNumber } = require("./utils")',
        'console.log("c:", parseNumber("42px"))',
        '',
      ].join('\n'),
      'src/d.js': [
        'const { normalizeName } = require("./utils")',
        'console.log("d:", normalizeName("  Carol Smith  "))',
        '',
      ].join('\n'),
    },
  },
  '24-implement-queue': {
    write: {
      'src/queue.js': [
        'class Queue {',
        '  constructor() { this.items = [] }',
        '  enqueue(v) { this.items.push(v) }',
        '  dequeue() { return this.items.shift() }',
        '  peek() { return this.items[0] }',
        '  size() { return this.items.length }',
        '}',
        'module.exports = { Queue }',
        '',
      ].join('\n'),
    },
  },
  '25-test-driven': {
    write: {
      'src/math.js': [
        'function add(a, b) { return a + b }',
        'function multiply(a, b) { return a * b }',
        'function divide(a, b) { return a / b }',
        'module.exports = { add, multiply, divide }',
        '',
      ].join('\n'),
    },
  },
  '26-validate-user': {
    write: {
      'src/validate.js': [
        'function validateUser(u) {',
        '  const errs = []',
        '  if (typeof u.name !== "string") errs.push("name must be a string")',
        '  if (typeof u.age !== "number") errs.push("age must be a number")',
        '  else if (u.age < 0) errs.push("age must be >= 0")',
        '  return errs',
        '}',
        'module.exports = { validateUser }',
        '',
      ].join('\n'),
    },
  },
  '27-log-migration': {
    write: {
      'src/mod1.js': ['const logger = require("./logger")', 'logger.log("value=1")', ''].join('\n'),
      'src/mod2.js': ['const logger = require("./logger")', 'logger.log("env=dev")', ''].join('\n'),
      'src/mod3.js': ['const logger = require("./logger")', 'logger.log("port=8080")', ''].join('\n'),
      'src/mod4.js': ['const logger = require("./logger")', 'logger.log("status=ok")', ''].join('\n'),
      'src/mod5.js': ['const logger = require("./logger")', 'logger.log("mode=test")', ''].join('\n'),
    },
  },
  '28-flatten': {
    write: {
      'src/flatten.js': [
        'function flatten(arr) {',
        '  const out = []',
        '  for (const v of arr) {',
        '    if (Array.isArray(v)) out.push(...flatten(v))',
        '    else out.push(v)',
        '  }',
        '  return out',
        '}',
        'module.exports = { flatten }',
        '',
      ].join('\n'),
    },
  },
  '29-threshold': {
    write: {
      'src/gate.js': [
        'function isEligible(score, min) {',
        '  return score >= min',
        '}',
        'module.exports = { isEligible }',
        '',
      ].join('\n'),
    },
  },
  '30-simple-hash': {
    write: {
      'src/hash.js': [
        'function simpleHash(s) {',
        '  let h = 0',
        '  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 2147483648',
        '  return h',
        '}',
        'module.exports = { simpleHash }',
        '',
      ].join('\n'),
    },
  },

  // ── 31–40 ────────────────────────────────────────────────────────────
  '31-extract-text-utils': {
    write: {
      'src/shared/text.js': [
        'function toSlug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }',
        'module.exports = { toSlug }',
        '',
      ].join('\n'),
      'src/a.js': [
        'const { toSlug } = require("./shared/text")',
        'console.log("a:", toSlug("Hello World"))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { toSlug } = require("./shared/text")',
        'console.log("b:", toSlug("DeepSeek Harness MCP!"))',
        '',
      ].join('\n'),
    },
  },
  '32-async-order': {
    write: {
      'src/pipe.js': [
        'async function step1() { return "A" }',
        'async function step2() { return "B" }',
        'function run() {',
        '  return Promise.all([step1(), step2()]).then(([a, b]) => a + b)',
        '}',
        'module.exports = { run }',
        '',
      ].join('\n'),
    },
  },
  '33-off-by-one': {
    write: {
      'src/looper.js': [
        'function collect(n) {',
        '  const out = []',
        '  for (let i = 0; i <= n; i++) out.push(i)',
        '  return out',
        '}',
        'module.exports = { collect }',
        '',
      ].join('\n'),
    },
  },
  '34-merge-config': {
    write: {
      'src/merge.js': [
        'function merge(base, overrides) {',
        '  const out = { ...base }',
        '  for (const k of Object.keys(overrides)) {',
        '    const v = overrides[k]',
        '    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") {',
        '      out[k] = merge(base[k], v)',
        '    } else {',
        '      out[k] = v',
        '    }',
        '  }',
        '  return out',
        '}',
        'module.exports = { merge }',
        '',
      ].join('\n'),
    },
  },
  '35-error-propagation': {
    write: {
      'src/load.js': [
        'async function fetchData() { throw new Error("connection refused") }',
        'function load() {',
        '  return fetchData()',
        '}',
        'module.exports = { load }',
        '',
      ].join('\n'),
    },
  },
  '36-double-encoding': {
    write: {
      'src/url.js': [
        'function buildUrl(base, query) {',
        '  return base + "?q=" + encodeURIComponent(query)',
        '}',
        'module.exports = { buildUrl }',
        '',
      ].join('\n'),
    },
  },
  '37-dir-walk': {
    write: {
      'src/tree.js': [
        'const fs = require("fs")',
        'const path = require("path")',
        'function listFiles(dir, prefix = "") {',
        '  const out = []',
        '  for (const entry of fs.readdirSync(dir)) {',
        '    const full = path.join(dir, entry)',
        '    if (fs.statSync(full).isDirectory()) out.push(...listFiles(full, prefix + entry + "/"))',
        '    else if (entry.endsWith(".js")) out.push(prefix + entry)',
        '  }',
        '  return out.sort()',
        '}',
        'module.exports = { listFiles }',
        '',
      ].join('\n'),
    },
  },
  '38-priority-order': {
    write: {
      'src/bus.js': [
        'const handlers = []',
        'function on(fn) { handlers.push(fn) }',
        'function emit(x) {',
        '  for (const h of handlers) h(x)',
        '}',
        'module.exports = { on, emit }',
        '',
      ].join('\n'),
    },
  },
  '39-split-util': {
    del: ['src/lib/utils.js'],
    write: {
      'src/lib/date.js': [
        'function formatDate(d) { return d.toISOString().slice(0, 10) }',
        'module.exports = { formatDate }',
        '',
      ].join('\n'),
      'src/lib/string.js': [
        'function toSlug(s) { return s.toLowerCase().replace(/\\s+/g, "-") }',
        'module.exports = { toSlug }',
        '',
      ].join('\n'),
      'src/lib/number.js': [
        'function toMoney(n) { return "$" + n.toFixed(2) }',
        'module.exports = { toMoney }',
        '',
      ].join('\n'),
      'src/a.js': [
        'const { formatDate } = require("./lib/date")',
        'console.log("a:", formatDate(new Date("2026-01-02T00:00:00Z")))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { toSlug } = require("./lib/string")',
        'console.log("b:", toSlug("Hello World"))',
        '',
      ].join('\n'),
      'src/c.js': [
        'const { toMoney } = require("./lib/number")',
        'console.log("c:", toMoney(12.5))',
        '',
      ].join('\n'),
    },
  },
  '40-priority-compare': {
    write: {
      'src/sorter.js': [
        'function byPriority(a, b) {',
        '  return b.priority - a.priority',
        '}',
        'module.exports = { byPriority }',
        '',
      ].join('\n'),
    },
  },

  // ── 41–50 ────────────────────────────────────────────────────────────
  '41-memoize': {
    write: {
      'src/memo.js': [
        'function memoize(fn) {',
        '  const cache = new Map()',
        '  return function (...args) {',
        '    const key = JSON.stringify(args)',
        '    if (cache.has(key)) return cache.get(key)',
        '    const v = fn(...args)',
        '    cache.set(key, v)',
        '    return v',
        '  }',
        '}',
        'module.exports = { memoize }',
        '',
      ].join('\n'),
    },
  },
  '42-dry-run': {
    write: {
      'src/deploy.js': [
        'function deploy(plan, dryRun) {',
        '  if (dryRun) return plan',
        '  plan.applied = true',
        '  return plan',
        '}',
        'module.exports = { deploy }',
        '',
      ].join('\n'),
    },
  },
  '43-sort-keys': {
    write: {
      'src/report.js': [
        'function summarize(users) {',
        '  const out = {}',
        '  for (const u of users) out[u.name] = u.score',
        '  const sorted = {}',
        '  for (const k of Object.keys(out).sort()) sorted[k] = out[k]',
        '  return sorted',
        '}',
        'module.exports = { summarize }',
        '',
      ].join('\n'),
    },
  },
  '44-retry': {
    write: {
      'src/retry.js': [
        'function retry(fn, attempts) {',
        '  let lastErr',
        '  for (let i = 0; i < attempts; i++) {',
        '    try { return fn() } catch (e) { lastErr = e }',
        '  }',
        '  throw lastErr',
        '}',
        'module.exports = { retry }',
        '',
      ].join('\n'),
    },
  },
  '45-money-precision': {
    write: {
      'src/money.js': [
        'function calcTotal(prices) {',
        '  const cents = prices.reduce((s, p) => s + Math.round(p * 100), 0)',
        '  return (cents / 100).toFixed(2)',
        '}',
        'module.exports = { calcTotal }',
        '',
      ].join('\n'),
    },
  },
  '46-inject-deps': {
    write: {
      'src/store.js': [
        'function createStore() {',
        '  const rows = {}',
        '  return {',
        '    save(id, v) { rows[id] = v },',
        '    load(id) { return rows[id] },',
        '  }',
        '}',
        'module.exports = { createStore }',
        '',
      ].join('\n'),
      'src/app.js': [
        'function run(store) {',
        '  store.save("a", 1)',
        '  return store.load("a")',
        '}',
        'module.exports = { run }',
        '',
      ].join('\n'),
      'src/main.js': [
        'const { createStore } = require("./store")',
        'const { run } = require("./app")',
        'console.log(run(createStore()))',
        '',
      ].join('\n'),
    },
  },
  '47-cron-minutes': {
    write: {
      'src/cron.js': [
        'function minutes(spec) {',
        '  if (spec === "*") return Array.from({ length: 60 }, (_, i) => i)',
        '  const out = new Set()',
        '  for (const part of spec.split(",")) {',
        '    if (part === "*") continue',
        '    if (part.startsWith("*/")) {',
        '      const step = parseInt(part.slice(2), 10)',
        '      for (let i = 0; i < 60; i += step) out.add(i)',
        '    } else if (part.includes("-")) {',
        '      const [a, b] = part.split("-").map(Number)',
        '      for (let i = a; i <= b; i++) out.add(i)',
        '    } else {',
        '      out.add(parseInt(part, 10))',
        '    }',
        '  }',
        '  return [...out].sort((a, b) => a - b)',
        '}',
        'module.exports = { minutes }',
        '',
      ].join('\n'),
    },
  },
  '48-empty-input': {
    write: {
      'src/stats.js': [
        'function average(nums) {',
        '  if (nums.length === 0) return 0',
        '  return nums.reduce((s, n) => s + n, 0) / nums.length',
        '}',
        'module.exports = { average }',
        '',
      ].join('\n'),
    },
  },
  '49-state-leak': {
    write: {
      'src/tracker.js': [
        'class Tracker {',
        '  constructor() { this.total = 0 }',
        '  add(n) { this.total += n }',
        '  get() { return this.total }',
        '}',
        'module.exports = { Tracker }',
        '',
      ].join('\n'),
    },
  },
  '50-multi-bug': {
    write: {
      'src/invoice.js': [
        'function lineTotal(price, qty) { return price * qty }',
        'function tax(amount) { return amount * 0.05 }',
        'function format(total) { return "total: " + total }',
        'module.exports = { lineTotal, tax, format }',
        '',
      ].join('\n'),
    },
  },

  // ── 51–60 ────────────────────────────────────────────────────────────
  '51-deep-trace': {
    write: {
      'src/repo.js': [
        'const { loadOrders } = require("./db")',
        'async function findOrder(id) {',
        '  const rows = await loadOrders()',
        '  const found = rows.find((r) => r.id === id)',
        '  return { id: found.id, qty: found.qty, price: found.price, tax: found.tax }',
        '}',
        'module.exports = { findOrder }',
        '',
      ].join('\n'),
    },
  },
  '52-cross-module-consistency': {
    write: {
      'src/client.js': [
        'const cfg = require("./config")',
        'function maxRetries() { return cfg.MAX_RETRIES }',
        'module.exports = { maxRetries }',
        '',
      ].join('\n'),
      'src/retryer.js': [
        'const cfg = require("./config")',
        'function maxRetries() { return cfg.MAX_RETRIES }',
        'module.exports = { maxRetries }',
        '',
      ].join('\n'),
    },
  },
  '53-async-race': {
    write: {
      'src/worker.js': [
        'const delay = (ms) => new Promise((res) => setTimeout(res, ms))',
        'async function run() {',
        '  const out = []',
        '  const tasks = [',
        '    () => delay(30).then(() => "A"),',
        '    () => delay(10).then(() => "B"),',
        '    () => delay(20).then(() => "C"),',
        '  ]',
        '  for (const t of tasks) out.push(await t())',
        '  return out',
        '}',
        'module.exports = { run }',
        '',
      ].join('\n'),
    },
  },
  '54-pagination': {
    write: {
      'src/page.js': [
        'function page(items, pageNum, pageSize) {',
        '  return items.slice((pageNum - 1) * pageSize, pageNum * pageSize)',
        '}',
        'module.exports = { page }',
        '',
      ].join('\n'),
    },
  },
  '55-state-machine': {
    write: {
      'src/fsm.js': [
        'const rules = {',
        '  new: { pay: "paid", cancel: "cancelled" },',
        '  paid: { ship: "shipped" },',
        '  shipped: { finish: "done" },',
        '}',
        'function transition(state, action) {',
        '  return (rules[state] && rules[state][action]) || null',
        '}',
        'module.exports = { transition }',
        '',
      ].join('\n'),
    },
  },
  '56-csv-parser': {
    write: {
      'src/csv.js': [
        'function parseCsv(s) {',
        '  const rows = []',
        '  let row = []',
        '  let field = ""',
        '  let inQuotes = false',
        '  let i = 0',
        '  while (i < s.length) {',
        '    const ch = s[i]',
        '    if (inQuotes) {',
        '      if (ch === \'"\') {',
        '        if (s[i + 1] === \'"\') { field += \'"\'; i += 2; continue }',
        '        inQuotes = false; i++; continue',
        '      }',
        '      field += ch; i++; continue',
        '    }',
        '    if (ch === \'"\') { inQuotes = true; i++; continue }',
        '    if (ch === ",") { row.push(field); field = ""; i++; continue }',
        '    if (ch === "\\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue }',
        '    field += ch; i++',
        '  }',
        '  row.push(field)',
        '  rows.push(row)',
        '  return rows',
        '}',
        'module.exports = { parseCsv }',
        '',
      ].join('\n'),
    },
  },
  '57-cache-invalidation': {
    write: {
      'src/cache.js': [
        'const cache = new Map()',
        'function get(key) { return cache.get(key) }',
        'function set(key, value) { cache.set(key, value) }',
        'function invalidate(key) { cache.delete(key) }',
        'module.exports = { get, set, invalidate }',
        '',
      ].join('\n'),
    },
  },
  '58-drain-once': {
    write: {
      'src/tq.js': [
        'const queue = []',
        'function enqueue(fn) { queue.push(fn) }',
        'function drain() {',
        '  while (queue.length) queue.shift()()',
        '}',
        'module.exports = { enqueue, drain }',
        '',
      ].join('\n'),
    },
  },
  '59-throttle': {
    write: {
      'src/throttle.js': [
        'function throttle(fn, interval, now) {',
        '  let last = -Infinity',
        '  return function (...args) {',
        '    const t = now()',
        '    if (t - last >= interval) { last = t; return fn(...args) }',
        '  }',
        '}',
        'module.exports = { throttle }',
        '',
      ].join('\n'),
    },
  },
  '60-ini-parser': {
    write: {
      'src/ini.js': [
        'function parseIni(s) {',
        '  const out = {}',
        '  let section = null',
        '  for (const line of s.split("\\n")) {',
        '    const t = line.trim()',
        '    if (!t || t.startsWith(";")) continue',
        '    const m = t.match(/^\\[(.+)\\]$/)',
        '    if (m) { section = m[1]; out[section] = out[section] || {}; continue }',
        '    const eq = t.indexOf("=")',
        '    if (eq === -1) continue',
        '    const key = t.slice(0, eq).trim()',
        '    const value = t.slice(eq + 1).trim()',
        '    if (section) out[section][key] = value',
        '    else out[key] = value',
        '  }',
        '  return out',
        '}',
        'module.exports = { parseIni }',
        '',
      ].join('\n'),
    },
  },

  // ── 61–70 ────────────────────────────────────────────────────────────
  '61-index-offset': {
    write: {
      'src/indexer.js': [
        'function findIndex(arr, value) {',
        '  return arr.indexOf(value)',
        '}',
        'module.exports = { findIndex }',
        '',
      ].join('\n'),
    },
  },
  '62-deep-merge-arrays': {
    write: {
      'src/merge.js': [
        'function merge(base, overrides) {',
        '  const out = {}',
        '  const keys = new Set([...Object.keys(base), ...Object.keys(overrides)])',
        '  for (const k of keys) {',
        '    const b = base[k]',
        '    const o = overrides[k]',
        '    if (o && typeof o === "object" && !Array.isArray(o) && b && typeof b === "object" && !Array.isArray(b)) {',
        '      out[k] = merge(b, o)',
        '    } else {',
        '      out[k] = o !== undefined ? o : b',
        '    }',
        '  }',
        '  return out',
        '}',
        'module.exports = { merge }',
        '',
      ].join('\n'),
    },
  },
  '63-fallback-chain': {
    write: {
      'src/resolver.js': [
        'const env = { get: () => undefined }',
        'const local = { get: (name) => ({ api_key: "local-key" }[name]) }',
        'function resolve(name) {',
        '  const fromEnv = env.get(name)',
        '  if (fromEnv !== undefined && fromEnv !== null) return fromEnv',
        '  return local.get(name)',
        '}',
        'module.exports = { resolve }',
        '',
      ].join('\n'),
    },
  },
  '64-null-propagation': {
    write: {
      'src/pipeline.js': [
        'function process(data) {',
        '  const items = data.items || []',
        '  if (items.length === 0) return "EMPTY"',
        '  return items[0].name.toUpperCase()',
        '}',
        'module.exports = { process }',
        '',
      ].join('\n'),
    },
  },
  '65-constant-drift': {
    write: {
      'src/validation.js': [
        'const { MAX_ITEMS } = require("./limits")',
        'function validateCount(n) { return n <= MAX_ITEMS }',
        'module.exports = { validateCount }',
        '',
      ].join('\n'),
    },
  },
  '66-proxy-forward': {
    write: {
      'src/api.js': [
        'const { register } = require("./backend")',
        'function registerVia(user) {',
        '  return register(user)',
        '}',
        'module.exports = { registerVia }',
        '',
      ].join('\n'),
    },
  },
  '67-init-order': {
    write: {
      'src/app.js': [
        'const cfg = { load: () => ({ host: "localhost" }) }',
        'const db = { connect: (c) => "db-ok:" + c.host }',
        'function start() {',
        '  const loaded = cfg.load()',
        '  const dbStatus = db.connect(loaded)',
        '  return dbStatus + ":" + loaded.host',
        '}',
        'module.exports = { start }',
        '',
      ].join('\n'),
    },
  },
  '68-bidirectional-map': {
    write: {
      'src/bi.js': [
        'const fwd = new Map()',
        'const rev = new Map()',
        'function put(a, b) {',
        '  fwd.set(a, b)',
        '  rev.set(b, a)',
        '}',
        'function getByA(a) { return fwd.get(a) }',
        'function getByB(b) { return rev.get(b) }',
        'module.exports = { put, getByA, getByB }',
        '',
      ].join('\n'),
    },
  },
  '69-metric-aggregation': {
    write: {
      'src/agg.js': [
        'function groupAvg(rows) {',
        '  const sums = {}',
        '  const counts = {}',
        '  for (const r of rows) {',
        '    sums[r.g] = (sums[r.g] ?? 0) + r.v',
        '    counts[r.g] = (counts[r.g] ?? 0) + 1',
        '  }',
        '  const out = {}',
        '  for (const g in sums) {',
        '    out[g] = sums[g] / counts[g]',
        '  }',
        '  return out',
        '}',
        'module.exports = { groupAvg }',
        '',
      ].join('\n'),
    },
  },
  '70-legacy-compat': {
    write: {
      'src/compat.js': [
        'const { oldAdd } = require("./legacy")',
        'function add(a, b) {',
        '  return oldAdd(a, b, 0)',
        '}',
        'module.exports = { add }',
        '',
      ].join('\n'),
    },
  },

  // ── 71–80 ────────────────────────────────────────────────────────────
  '71-sort-stability': {
    write: {
      'src/ranker.js': [
        'function rankBy(users) {',
        '  return [...users].sort((x, y) => y.score - x.score)',
        '}',
        'module.exports = { rankBy }',
        '',
      ].join('\n'),
    },
  },
  '72-path-normalize': {
    write: {
      'src/safe.js': [
        'function cleanPath(p) {',
        '  return p.replace(/^(\\.\\.\\/)+/, "")',
        '}',
        'module.exports = { cleanPath }',
        '',
      ].join('\n'),
    },
  },
  '73-id-gen-race': {
    write: {
      'src/ids.js': [
        'let seq = 0',
        'async function nextId() {',
        '  const current = seq++',
        '  await Promise.resolve()',
        '  return current',
        '}',
        'module.exports = { nextId }',
        '',
      ].join('\n'),
    },
  },
  '74-token-redact': {
    write: {
      'src/log.js': [
        'function format(entry) {',
        '  const copy = { ...entry }',
        '  if ("secret" in copy) copy.secret = "***"',
        '  return JSON.stringify(copy)',
        '}',
        'module.exports = { format }',
        '',
      ].join('\n'),
    },
  },
  '75-feature-flag': {
    write: {
      'src/app.js': [
        'const { isEnabled } = require("./flags")',
        'function run() { return isEnabled("beta") ? "beta-on" : "beta-off" }',
        'module.exports = { run }',
        '',
      ].join('\n'),
    },
  },
  '76-percent-round': {
    write: {
      'src/math2.js': [
        'function percent(part, whole) {',
        '  return Math.round((part / whole) * 100)',
        '}',
        'module.exports = { percent }',
        '',
      ].join('\n'),
    },
  },
  '77-batch-tail': {
    write: {
      'src/batcher.js': [
        'function submit(items, batchSize) {',
        '  const batches = []',
        '  for (let i = 0; i < items.length; i += batchSize) {',
        '    batches.push(items.slice(i, i + batchSize))',
        '  }',
        '  return batches',
        '}',
        'module.exports = { submit }',
        '',
      ].join('\n'),
    },
  },
  '78-singleton-bypass': {
    write: {
      'src/dbconn.js': [
        'let created = 0',
        'let instance = null',
        'function getInstance() {',
        '  if (!instance) {',
        '    created++',
        '    instance = { created }',
        '  }',
        '  return instance',
        '}',
        'module.exports = { getInstance }',
        '',
      ].join('\n'),
    },
  },
  '79-tdd-multi': {
    write: {
      'src/str.js': [
        'function toUpper(s) { return s.toUpperCase() }',
        'module.exports = { toUpper }',
        '',
      ].join('\n'),
      'src/num.js': [
        'function clamp(v, min, max) { return Math.min(Math.max(v, min), max) }',
        'module.exports = { clamp }',
        '',
      ].join('\n'),
      'src/list.js': [
        'function dedupe(arr) { return [...new Set(arr)] }',
        'module.exports = { dedupe }',
        '',
      ].join('\n'),
    },
  },
  '80-validate-order': {
    write: {
      'src/validate.js': [
        'function validateOrder(o) {',
        '  const errs = []',
        '  if (!o.customer || typeof o.customer !== "object") errs.push("customer required")',
        '  else {',
        '    if (typeof o.customer.name !== "string") errs.push("customer name required")',
        '    if (typeof o.customer.email !== "string" || !o.customer.email.includes("@")) errs.push("customer email invalid")',
        '  }',
        '  if (!Array.isArray(o.items) || o.items.length === 0) errs.push("items required")',
        '  else {',
        '    for (const it of o.items) {',
        '      if (!Number.isInteger(it.qty) || it.qty <= 0) { errs.push("item qty invalid"); break }',
        '    }',
        '  }',
        '  return errs',
        '}',
        'module.exports = { validateOrder }',
        '',
      ].join('\n'),
    },
  },

  // ── 81–90 ────────────────────────────────────────────────────────────
  '81-lru-cache': {
    write: {
      'src/lru.js': [
        'class LRUCache {',
        '  constructor(capacity) { this.cap = capacity; this.map = new Map() }',
        '  get(key) {',
        '    if (!this.map.has(key)) return undefined',
        '    const v = this.map.get(key)',
        '    this.map.delete(key)',
        '    this.map.set(key, v)',
        '    return v',
        '  }',
        '  set(key, v) {',
        '    if (this.map.has(key)) this.map.delete(key)',
        '    this.map.set(key, v)',
        '    if (this.map.size > this.cap) {',
        '      const oldest = this.map.keys().next().value',
        '      this.map.delete(oldest)',
        '    }',
        '  }',
        '}',
        'module.exports = { LRUCache }',
        '',
      ].join('\n'),
    },
  },
  '82-round-robin': {
    write: {
      'src/lb.js': [
        'let next = -1',
        'function pick(servers) {',
        '  next = (next + 1) % servers.length',
        '  return servers[next]',
        '}',
        'module.exports = { pick }',
        '',
      ].join('\n'),
    },
  },
  '83-dir-sync': {
    write: {
      'src/syncer.js': [
        'const fs = require("fs")',
        'const path = require("path")',
        'function syncDirs(srcDir, dstDir) {',
        '  let count = 0',
        '  for (const entry of fs.readdirSync(srcDir)) {',
        '    const src = path.join(srcDir, entry)',
        '    const dst = path.join(dstDir, entry)',
        '    if (fs.statSync(src).isDirectory()) {',
        '      fs.mkdirSync(dst, { recursive: true })',
        '      count += syncDirs(src, dst)',
        '    } else {',
        '      fs.mkdirSync(path.dirname(dst), { recursive: true })',
        '      fs.copyFileSync(src, dst)',
        '      count++',
        '    }',
        '  }',
        '  return count',
        '}',
        'module.exports = { syncDirs }',
        '',
      ].join('\n'),
    },
  },
  '84-api-v2-migration': {
    write: {
      'src/a.js': [
        'const { connect } = require("./lib")',
        'console.log("a:", connect({ host: "localhost", port: 5432 }))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { connect } = require("./lib")',
        'console.log("b:", connect({ host: "localhost", port: 3306 }))',
        '',
      ].join('\n'),
      'src/main.js': [
        'const { connect } = require("./lib")',
        'console.log("main:", connect({ host: "localhost", port: 27017 }))',
        '',
      ].join('\n'),
    },
  },
  '85-null-guard-multi': {
    write: {
      'src/order.js': [
        'function total(order) {',
        '  if (!order || !order.items) return 0',
        '  return order.items.reduce((s, i) => s + i.price, 0)',
        '}',
        'function count(order) {',
        '  if (!order || !order.items) return 0',
        '  return order.items.length',
        '}',
        'function desc(order) {',
        '  if (!order || !order.items) return ""',
        '  return order.items.map((i) => i.name).join(",")',
        '}',
        'module.exports = { total, count, desc }',
        '',
      ].join('\n'),
    },
  },
  '86-decode-multi': {
    write: {
      'src/decoder.js': [
        'function decode(s) {',
        '  return decodeURIComponent(decodeURIComponent(s))',
        '}',
        'module.exports = { decode }',
        '',
      ].join('\n'),
    },
  },
  '87-schema-migration': {
    write: {
      'src/migrate.js': [
        'function migrate(data) {',
        '  return data.users.map((u) => {',
        '    const { email, ...contact } = u.contact || {}',
        '    return { id: u.id, name: u.name, email, contact }',
        '  })',
        '}',
        'module.exports = { migrate }',
        '',
      ].join('\n'),
    },
  },
  '88-threshold-chain': {
    write: {
      'src/grade.js': [
        'function grade(score) {',
        '  if (score >= 90) return "A"',
        '  if (score >= 80) return "B"',
        '  if (score >= 70) return "C"',
        '  return "D"',
        '}',
        'module.exports = { grade }',
        '',
      ].join('\n'),
    },
  },
  '89-deep-equal': {
    write: {
      'src/deep.js': [
        'function deepEqual(a, b) {',
        '  if (a === b) return true',
        '  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true',
        '  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false',
        '  if (Array.isArray(a) !== Array.isArray(b)) return false',
        '  if (Array.isArray(a)) {',
        '    if (a.length !== b.length) return false',
        '    return a.every((v, i) => deepEqual(v, b[i]))',
        '  }',
        '  const ka = Object.keys(a)',
        '  const kb = Object.keys(b)',
        '  if (ka.length !== kb.length) return false',
        '  return ka.every((k) => k in b && deepEqual(a[k], b[k]))',
        '}',
        'module.exports = { deepEqual }',
        '',
      ].join('\n'),
    },
  },
  '90-escape-html': {
    write: {
      'src/esc.js': [
        'function escapeHtml(s) {',
        '  return s',
        '    .replace(/&/g, "&amp;")',
        '    .replace(/</g, "&lt;")',
        '    .replace(/>/g, "&gt;")',
        '    .replace(/"/g, "&quot;")',
        "    .replace(/'/g, '&#39;')",
        '}',
        'module.exports = { escapeHtml }',
        '',
      ].join('\n'),
    },
  },

  // ── 91–100 ───────────────────────────────────────────────────────────
  '91-chain-call': {
    write: {
      'src/main.js': [
        'const { Calc } = require("./calc")',
        'const c1 = new Calc()',
        'console.log(c1.add(2).mult(3).value)',
        'const c2 = new Calc()',
        'console.log(c2.add(5).value)',
        '',
      ].join('\n'),
    },
  },
  '92-duplicate-keys': {
    write: {
      'src/merge2.js': [
        'function mergeUsers(list) {',
        '  const out = {}',
        '  for (const u of list) {',
        '    out[u.id] = { ...(out[u.id] || {}), ...u }',
        '  }',
        '  return Object.values(out)',
        '}',
        'module.exports = { mergeUsers }',
        '',
      ].join('\n'),
    },
  },
  '93-offset-rewrite': {
    write: {
      'src/editor.js': [
        'function replaceLine(text, lineNo, newLine) {',
        '  const lines = text.split("\\n")',
        '  lines[lineNo - 1] = newLine',
        '  return lines.join("\\n")',
        '}',
        'module.exports = { replaceLine }',
        '',
      ].join('\n'),
    },
  },
  '94-dry-run-deep': {
    write: {
      'src/planner.js': [
        'const applied = []',
        'function apply(plan, dryRun) {',
        '  for (const step of plan.steps) {',
        '    if (dryRun) continue',
        '    applied.push(step.id)',
        '    step.execute()',
        '  }',
        '  return applied',
        '}',
        'module.exports = { apply, applied }',
        '',
      ].join('\n'),
    },
  },
  '95-expiry-cache': {
    write: {
      'src/tcache.js': [
        'class TimedCache {',
        '  constructor(ttlMs, now) { this.ttl = ttlMs; this.now = now; this.store = new Map() }',
        '  set(key, v) { this.store.set(key, { v, t: this.now() }) }',
        '  get(key) {',
        '    const e = this.store.get(key)',
        '    if (!e) return undefined',
        '    if (this.now() - e.t >= this.ttl) { this.store.delete(key); return undefined }',
        '    return e.v',
        '  }',
        '}',
        'module.exports = { TimedCache }',
        '',
      ].join('\n'),
    },
  },
  '96-escape-regex': {
    write: {
      'src/matcher.js': [
        'function hasMatch(pattern, text) {',
        '  const esc = pattern.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")',
        '  return new RegExp(esc).test(text)',
        '}',
        'module.exports = { hasMatch }',
        '',
      ].join('\n'),
    },
  },
  '97-config-freeze': {
    write: {
      'src/settings.js': [
        'const settings = { theme: "dark", lang: "en" }',
        'function get() {',
        '  return { ...settings }',
        '}',
        'module.exports = { get }',
        '',
      ].join('\n'),
    },
  },
  '98-dedupe-sort': {
    write: {
      'src/dd.js': [
        'function dedupeSorted(arr) {',
        '  return [...new Set(arr)].sort((a, b) => a - b)',
        '}',
        'module.exports = { dedupeSorted }',
        '',
      ].join('\n'),
    },
  },
  '99-counter-shared': {
    del: ['.seq.json'],
    write: {
      'src/registry.js': [
        'let seq = 0',
        'function register() { return ++seq }',
        'module.exports = { register }',
        '',
      ].join('\n'),
    },
  },
  '100-multi-refactor-bug': {
    write: {
      'src/util.js': [
        'function formatName(name) {',
        '  return name.trim().toUpperCase()',
        '}',
        'function formatPrice(n) {',
        '  return "$" + n.toFixed(2)',
        '}',
        'function formatDate(d) {',
        '  return d.toISOString().slice(0, 10)',
        '}',
        'module.exports = { formatName, formatPrice, formatDate }',
        '',
      ].join('\n'),
    },
  },
}
