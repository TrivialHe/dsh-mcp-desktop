/**
 * Mini-SWE-bench style task set for the dsh-mcp A/B benchmark.
 *
 * 20 long-horizon, multi-file tasks on tiny Node/CommonJS projects.
 * Each task: fixture files + a natural-language issue + an automated
 * ground-truth verify(dir) function (exit-0 checks + stdout checks).
 * No npm deps — everything runs on plain node.
 *
 * Difficulty is deliberately mixed (easy → hard: import cycles, data-flow
 * tracing) so the two arms can separate instead of both saturating.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const run = (dir, script) =>
  spawnSync(process.execPath, [join(dir, script)], { encoding: 'utf8', cwd: dir })
const read = (dir, file) => {
  try {
    return readFileSync(join(dir, file), 'utf8')
  } catch {
    return null
  }
}

/** Every fixture includes this main entry unless the task overrides it. */
const MAIN = (lines) => ({ 'src/main.js': lines.join('\n') })

export const TASKS = [
  // ── 1. rename-export ─────────────────────────────────────────────────
  {
    id: '01-rename-export',
    files: {
      'src/total.js': [
        'function getTotal(items) {',
        '  return items.reduce((s, i) => s + i.price, 0)',
        '}',
        'module.exports = { getTotal }',
        '',
      ].join('\n'),
      'src/order.js': [
        'const { getTotal } = require("./total")',
        'function orderTotal(items) { return getTotal(items) }',
        'module.exports = { orderTotal }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { getTotal } = require("./total")',
        'const { orderTotal } = require("./order")',
        'const items = [{ price: 10 }, { price: 20 }]',
        'console.log("total:", getTotal(items))',
        'console.log("order:", orderTotal(items))',
      ]),
    },
    issue:
      '重构任务：src/total.js 导出的函数名 getTotal 不够清晰，请把它重命名为 calculateTotal，并更新项目中所有引用该函数的地方，使程序仍然正常工作。',
    verify(dir) {
      const t = read(dir, 'src/total.js') ?? ''
      const o = read(dir, 'src/order.js') ?? ''
      const m = read(dir, 'src/main.js') ?? ''
      if (t.includes('getTotal') || o.includes('getTotal') || m.includes('getTotal'))
        return { ok: false, detail: 'getTotal 引用未清理干净' }
      if (!t.includes('calculateTotal'))
        return { ok: false, detail: 'total.js 中没有 calculateTotal' }
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('total: 30') || !r.stdout.includes('order: 30'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '输出 total: 30 / order: 30' }
    },
  },

  // ── 2. cascade-bug ───────────────────────────────────────────────────
  {
    id: '02-cascade-bug',
    files: {
      'src/calc.js': [
        'function compute(items) { return items.reduce((s, i) => s + i.price, 0) }',
        'module.exports = { compute }',
        '',
      ].join('\n'),
      'src/format.js': [
        'function toMoney(n) { return { amount: n } }',
        'module.exports = { toMoney }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { compute } = require("./calc")',
        'const { toMoney } = require("./format")',
        'const items = [{ price: 15 }, { price: 35 }]',
        'const t = toMoney(compute(items))',
        'console.log(t.amount, t.currency ?? "no-currency")',
      ]),
    },
    issue:
      'Bug 修复：程序应输出 "50 USD"，但实际输出 "50 no-currency"。追踪数据流（src/calc.js → src/format.js → src/main.js）找到丢失的字段并修复。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('50') || !r.stdout.includes('USD'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: `输出含 50 USD: ${r.stdout.trim()}` }
    },
  },

  // ── 3. implement-spec ────────────────────────────────────────────────
  {
    id: '03-implement-spec',
    files: {
      'src/config.js': [
        '// Spec: parseConfig(s) 把形如 "a=1,b=2" 的键值串解析成对象 { a: "1", b: "2" }',
        '// 规则：按逗号分段，每段按第一个 "=" 切分为键值；空段忽略；',
        '// 值不需要类型转换（保持字符串）。',
        'function parseConfig(s) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { parseConfig }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { parseConfig } = require("./config")',
        'const out = parseConfig("host=localhost,port=8080,debug=true")',
        'console.log(JSON.stringify(out))',
      ]),
    },
    issue:
      '实现任务：src/config.js 的 parseConfig 抛 "not implemented"。请阅读文件顶部的 Spec 注释并实现该函数，使程序输出 {"host":"localhost","port":"8080","debug":"true"}。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = '{"host":"localhost","port":"8080","debug":"true"}'
      if (!r.stdout.includes(want)) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: 'JSON 完全匹配' }
    },
  },

  // ── 4. move-util ─────────────────────────────────────────────────────
  {
    id: '04-move-util',
    files: {
      'src/lib/utils.js': [
        'function formatDate(d) { return d.toISOString().slice(0, 10) }',
        'function formatNumber(n) { return String(n).padStart(3, "0") }',
        'module.exports = { formatDate, formatNumber }',
        '',
      ].join('\n'),
      'src/a.js': [
        'const { formatDate } = require("./lib/utils")',
        'console.log("a:", formatDate(new Date("2026-01-02T00:00:00Z")))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { formatDate } = require("./lib/utils")',
        'console.log("b:", formatDate(new Date("2026-03-04T00:00:00Z")))',
        '',
      ].join('\n'),
      'src/c.js': [
        'const { formatDate } = require("./lib/utils")',
        'console.log("c:", formatDate(new Date("2026-05-06T00:00:00Z")))',
        '',
      ].join('\n'),
    },
    issue:
      '重构任务：把 src/lib/utils.js 中的 formatDate 函数迁移到新文件 src/lib/date.js（utils.js 中保留 formatNumber），并更新 src/a.js、src/b.js、src/c.js 三个调用方改为从新文件引入。三个脚本都要能正常运行。',
    verify(dir) {
      const utils = read(dir, 'src/lib/utils.js') ?? ''
      const date = read(dir, 'src/lib/date.js') ?? ''
      if (utils.includes('formatDate')) return { ok: false, detail: 'utils.js 仍含 formatDate' }
      if (!date.includes('formatDate')) return { ok: false, detail: 'date.js 缺少 formatDate' }
      for (const [f, want] of [['src/a.js', 'a: 2026-01-02'], ['src/b.js', 'b: 2026-03-04'], ['src/c.js', 'c: 2026-05-06']]) {
        const r = run(dir, f)
        if (r.status !== 0) return { ok: false, detail: `${f} 退出码 ${r.status}` }
        if (!r.stdout.includes(want)) return { ok: false, detail: `${f} 输出 ${r.stdout}` }
      }
      return { ok: true, detail: '3 个脚本全部输出正确' }
    },
  },

  // ── 5. fix-todos ─────────────────────────────────────────────────────
  {
    id: '05-fix-todos',
    files: {
      'src/mod1.js': ['// TODO: 此值应为 42', 'const answer = 41', 'module.exports = { answer }', ''].join('\n'),
      'src/mod2.js': ['// TODO: 此值应为 "prod"', 'const env = "dev"', 'module.exports = { env }', ''].join('\n'),
      'src/mod3.js': ['// TODO: 此值应为 1000', 'const limit = 999', 'module.exports = { limit }', ''].join('\n'),
      'src/mod4.js': ['// TODO: 此值应为 true', 'const flag = false', 'module.exports = { flag }', ''].join('\n'),
      'src/mod5.js': ['// TODO: 此值应为 7', 'const days = 6', 'module.exports = { days }', ''].join('\n'),
      ...MAIN([
        'const m1 = require("./mod1")',
        'const m2 = require("./mod2")',
        'const m3 = require("./mod3")',
        'const m4 = require("./mod4")',
        'const m5 = require("./mod5")',
        'console.log(m1.answer, m2.env, m3.limit, m4.flag, m5.days)',
      ]),
    },
    issue:
      'Bug 修复：src/ 下 5 个模块（mod1–mod5）各有一个 TODO 注释，注释里标明了正确值，但实际值不对。按注释修复全部 5 个文件，使程序输出 "42 prod 1000 true 7"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('42 prod 1000 true 7'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '5 个值全部正确' }
    },
  },

  // ── 6. cjs-to-esm ────────────────────────────────────────────────────
  {
    id: '06-cjs-to-esm',
    files: {
      'package.json': '{"type":"module"}\n',
      'src/alpha.js': [
        'const beta = require("./beta.js")',
        'function greet(name) { return beta.shout("hello " + name) }',
        'module.exports = { greet }',
        '',
      ].join('\n'),
      'src/beta.js': [
        'function shout(s) { return s.toUpperCase() }',
        'module.exports = { shout }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { greet } = require("./alpha.js")',
        'console.log(greet("world"))',
      ]),
    },
    issue:
      '迁移任务：项目的 package.json 已配置 "type": "module"，但 src/ 下代码仍是 CommonJS（require/module.exports），运行会报错。把 src/alpha.js、src/beta.js、src/main.js 全部改写成 ESM（import/export），使程序输出 "HELLO WORLD"。',
    verify(dir) {
      for (const f of ['src/alpha.js', 'src/beta.js', 'src/main.js']) {
        const c = read(dir, f) ?? ''
        if (c.includes('require(') || c.includes('module.exports'))
          return { ok: false, detail: `${f} 仍有 CJS 语法` }
      }
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('HELLO WORLD')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: 'ESM 化完成，输出 HELLO WORLD' }
    },
  },

  // ── 7. type-fix ──────────────────────────────────────────────────────
  {
    id: '07-type-fix',
    files: {
      'src/format-person.js': [
        'function formatPerson(p) { return p.name + " (" + p.age + ")" }',
        'module.exports = { formatPerson }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { formatPerson } = require("./format-person")',
        'const people = [{ name: "Ada", age: 36 }, null, { name: "Linus", age: 55 }]',
        'for (const p of people) console.log(formatPerson(p))',
      ]),
    },
    issue:
      'Bug 修复：程序崩溃（people 数组里混入了 null，formatPerson 直接访问 p.name）。修复使其输出 3 行：前两行分别含 "Ada (36)" 和 "Linus (55)"，null 行输出 "unknown"，且不抛异常。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('Ada (36)') || !r.stdout.includes('Linus (55)') || !r.stdout.includes('unknown'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '3 行输出正确且无崩溃' }
    },
  },

  // ── 8. missing-function ──────────────────────────────────────────────
  {
    id: '08-missing-function',
    files: {
      'src/checksum.js': [
        '// Spec: checksum(s) = 字符串所有字符的 charCode 之和，取模 256。',
        'function checksum(s) {',
        '  // TODO: implement per spec',
        '  return null',
        '}',
        'module.exports = { checksum }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { checksum } = require("./checksum")',
        'console.log(checksum("abcdef"))',
      ]),
    },
    issue:
      '实现任务：src/checksum.js 的 checksum 目前返回 null。按注释 Spec（所有字符码之和 % 256）实现它，使程序输出 85。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.trim().split('\n').some((l) => l.trim() === '85'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '输出 85' }
    },
  },

  // ── 9. data-flow ─────────────────────────────────────────────────────
  {
    id: '09-data-flow',
    files: {
      'src/main.js': [
        'const { fetch } = require("./service")',
        'fetch(2).then((u) => console.log(JSON.stringify(u))).catch((e) => console.log("ERR", e.message))',
        '',
      ].join('\n'),
      'src/service.js': [
        'const { query } = require("./db")',
        'async function fetch(id) {',
        '  const rows = await query(id)',
        '  return rows[0]',
        '}',
        'module.exports = { fetch }',
        '',
      ].join('\n'),
      'src/db.js': [
        'const data = { 1: { id: 1, name: "Ada" }, 2: { id: 2, name: "Bob" } }',
        'async function query(id) {',
        '  // BUG: 忽略了 id 过滤，总返回全部记录',
        '  return Object.values(data)',
        '}',
        'module.exports = { query }',
        '',
      ].join('\n'),
    },
    issue:
      'Bug 修复：fetch(2) 期望返回 {"id":2,"name":"Bob"}，但实际返回了 {"id":1,"name":"Ada"}。追踪 src/main.js → src/service.js → src/db.js 三层数据流，修复根因。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('{"id":2,"name":"Bob"}'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: 'fetch(2) 返回 Bob' }
    },
  },

  // ── 10. dedupe-refactor ──────────────────────────────────────────────
  {
    id: '10-dedupe-refactor',
    files: {
      'src/a.js': [
        'const scores = [5, 3, 8, 1]',
        'const sorted = [...scores].sort((x, y) => y - x)',
        'console.log("a:", sorted.join(","))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const scores = [9, 2, 7]',
        'const sorted = [...scores].sort((x, y) => y - x)',
        'console.log("b:", sorted.join(","))',
        '',
      ].join('\n'),
      'src/c.js': [
        'const scores = [4, 6]',
        'const sorted = [...scores].sort((x, y) => y - x)',
        'console.log("c:", sorted.join(","))',
        '',
      ].join('\n'),
    },
    issue:
      '重构任务：src/a.js、src/b.js、src/c.js 三处重复了同样的降序排序代码（sort((x, y) => y - x)）。提取公共逻辑到新文件 src/shared/sort.js（导出函数 sortDesc），并让三个文件改为调用它，输出不变。',
    verify(dir) {
      const s = read(dir, 'src/shared/sort.js') ?? ''
      if (!s.includes('sortDesc')) return { ok: false, detail: 'shared/sort.js 缺少 sortDesc' }
      for (const [f, want] of [['src/a.js', 'a: 8,5,3,1'], ['src/b.js', 'b: 9,7,2'], ['src/c.js', 'c: 6,4']]) {
        const c = read(dir, f) ?? ''
        if (c.includes('sort((x, y) => y - x)')) return { ok: false, detail: `${f} 仍有内联排序` }
        if (!c.includes('shared/sort')) return { ok: false, detail: `${f} 未引入 shared/sort` }
        const r = run(dir, f)
        if (r.status !== 0 || !r.stdout.includes(want))
          return { ok: false, detail: `${f} 输出 ${r.status !== 0 ? '退出码 ' + r.status : r.stdout}` }
      }
      return { ok: true, detail: '3 处调用共享模块，输出正确' }
    },
  },

  // ── 11. async-fix ────────────────────────────────────────────────────
  {
    id: '11-async-fix',
    files: {
      'src/tasks.js': [
        'async function run() { return Promise.resolve(42) }',
        'function process() { return run() }',
        'module.exports = { process }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { process } = require("./tasks")',
        'const v = process()',
        'console.log("v =", v)',
      ]),
    },
    issue:
      'Bug 修复：程序输出 "v = [object Promise]"，期望 "v = 42"。问题在异步/同步边界（src/tasks.js 的 process 返回了 Promise 但 main.js 按同步值使用）。选择合理的修复方式（在调用侧 await 或调整实现），保证输出正确。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('v = 42')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '输出 v = 42' }
    },
  },

  // ── 12. boundary-check ───────────────────────────────────────────────
  {
    id: '12-boundary-check',
    files: {
      'src/helper.js': [
        'function pick(arr, i) { return arr[i] }',
        'module.exports = { pick }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { pick } = require("./helper")',
        'const list = [10, 20, 30]',
        'console.log("pick:", pick(list, 5))',
      ]),
    },
    issue:
      'Bug 修复：pick(list, 5) 越界时返回 undefined，期望越界时返回字符串 "out-of-range"。修改 src/helper.js 的 pick 增加边界检查（也可以顺带处理负数索引）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('pick: out-of-range'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '越界返回 out-of-range' }
    },
  },

  // ── 13. config-mapping ───────────────────────────────────────────────
  {
    id: '13-config-mapping',
    files: {
      'src/config.js': [
        'module.exports = { serverPort: 8080 }',
        '',
      ].join('\n'),
      'src/http.js': [
        'function startServer(port) { console.log("listening on", port) }',
        'module.exports = { startServer }',
        '',
      ].join('\n'),
      'src/server.js': [
        'const config = require("./config")',
        'const { startServer } = require("./http")',
        'startServer(config.port)',
        '',
      ].join('\n'),
      'src/db.js': [
        'const config = require("./config")',
        'function connect() { return "db-ok:" + config.port }',
        'module.exports = { connect }',
        '',
      ].join('\n'),
      ...MAIN([
        'require("./server")',
        'const { connect } = require("./db")',
        'console.log(connect())',
      ]),
    },
    issue:
      'Bug 修复：config.js 把配置键改名为 serverPort 后，src/server.js 和 src/db.js 还在用旧的 config.port（undefined）。找出所有使用旧键的位置并修复，使程序输出 "listening on 8080" 和 "db-ok:8080"。',
    verify(dir) {
      for (const f of ['src/server.js', 'src/db.js', 'src/main.js']) {
        const c = read(dir, f) ?? ''
        if (c.includes('config.port')) return { ok: false, detail: `${f} 仍用旧键 config.port` }
      }
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('listening on 8080') || !r.stdout.includes('db-ok:8080'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '两处旧键已修复' }
    },
  },

  // ── 14. error-handling ───────────────────────────────────────────────
  {
    id: '14-error-handling',
    files: {
      'src/net.js': [
        'const rows = { 1: { name: "Ada" }, 2: { name: "Bob" } }',
        'async function getUser(id) { return rows[id] }',
        'module.exports = { getUser }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { getUser } = require("./net")',
        'async function main() {',
        '  const u1 = await getUser(1)',
        '  console.log("user:", u1.name.toUpperCase())',
        '  const u2 = await getUser(99)',
        '  console.log("missing:", u2.name.toUpperCase())',
        '}',
        'main().catch((e) => console.log("ERR", e.message))',
      ]),
    },
    issue:
      'Bug 修复：getUser(99) 返回 undefined，main 里对 u1 和 u2 的防御不一致（u1 没有防 undefined，直接 .name.toUpperCase() 会崩溃）。修复 src/net.js 或 src/main.js，使程序输出 "user: ADA" 和 "missing: DEFAULT"，不崩溃。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('user: ADA') || !r.stdout.includes('missing: DEFAULT'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '正常输出且无崩溃' }
    },
  },

  // ── 15. string-format ────────────────────────────────────────────────
  {
    id: '15-string-format',
    files: {
      'src/format.js': [
        'function describe(name, age) {',
        '  // BUG: 参数拼接顺序写反了',
        '  return age + " is " + name + " years old"',
        '}',
        'module.exports = { describe }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { describe } = require("./format")',
        'console.log(describe("Alice", 30))',
      ]),
    },
    issue:
      'Bug 修复：describe("Alice", 30) 期望输出 "Alice is 30 years old"，实际输出了 "30 is Alice years old"。修复 src/format.js 的拼接顺序。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('Alice is 30 years old'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '拼接顺序正确' }
    },
  },

  // ── 16. import-cycle ─────────────────────────────────────────────────
  {
    id: '16-import-cycle',
    files: {
      'src/a.js': [
        'const b = require("./b")',
        'const TAG = "alpha"',
        'function aFn() { return "A:" + b.bFn() }',
        'module.exports = { TAG, aFn }',
        '',
      ].join('\n'),
      'src/b.js': [
        'const a = require("./a")',
        '// BUG: 模块加载期就读 a.TAG，此时 a 尚未完成导出',
        'const tag = a.TAG',
        'function bFn() { return "B:" + tag }',
        'module.exports = { bFn }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { aFn, TAG } = require("./a")',
        'console.log("TAG", TAG)',
        'console.log(aFn())',
      ]),
    },
    issue:
      'Bug 修复：src/a.js 与 src/b.js 存在循环 require，加载时崩溃（b.js 在模块顶层读取 a.TAG 时 a 还没完成导出）。修复循环依赖（例如把 a.TAG 的读取延迟到函数体内），使程序输出 "TAG alpha" 和 "A:B:alpha"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('TAG alpha') || !r.stdout.includes('A:B:alpha'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '循环依赖已修复' }
    },
  },

  // ── 17. fix-failing-test ─────────────────────────────────────────────
  {
    id: '17-fix-failing-test',
    files: {
      'src/calc.js': [
        'function add(a, b) { return a - b }',
        'module.exports = { add }',
        '',
      ].join('\n'),
      'src/discount.js': [
        'function discount(price) { return price * 0.9 }',
        'module.exports = { discount }',
        '',
      ].join('\n'),
      'tests/run-tests.js': [
        'const assert = require("assert")',
        'const { add } = require("../src/calc")',
        'const { discount } = require("../src/discount")',
        'assert.strictEqual(add(2, 3), 5)',
        'assert.strictEqual(discount(100), 90)',
        'console.log("ALL TESTS PASSED")',
        '',
      ].join('\n'),
    },
    issue:
      'Bug 修复：tests/run-tests.js 有一个断言失败。运行测试（node tests/run-tests.js）定位失败原因并修复 src/ 下的实现，使测试全部通过并输出 "ALL TESTS PASSED"。',
    verify(dir) {
      const r = run(dir, 'tests/run-tests.js')
      if (r.status !== 0) return { ok: false, detail: `测试退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('ALL TESTS PASSED')) return { ok: false, detail: r.stdout }
      return { ok: true, detail: '测试全绿' }
    },
  },

  // ── 18. metric-conversion ────────────────────────────────────────────
  {
    id: '18-metric-conversion',
    files: {
      'src/units.js': [
        'module.exports = { KB: 1000, KIB: 1024, MB: 1000 * 1000, MIB: 1024 * 1024 }',
        '',
      ].join('\n'),
      'src/size.js': [
        'const { KB } = require("./units")',
        'function formatSize(bytes) {',
        '  // BUG: 磁盘容量是二进制量，却用了十进制 KB 换算',
        '  return bytes / KB + " KB"',
        '}',
        'module.exports = { formatSize }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { formatSize } = require("./size")',
        'console.log(formatSize(1024))',
      ]),
    },
    issue:
      'Bug 修复：磁盘容量应按 1024 进制（KiB）显示：formatSize(1024) 应输出 "1 KiB"，当前却输出 "1.024 KB"（用了十进制 KB=1000）。修复 src/size.js 使用正确的单位常量（src/units.js 里已有 KIB）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('1 KiB')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '输出 1 KiB' }
    },
  },

  // ── 19. logging-audit ────────────────────────────────────────────────
  {
    id: '19-logging-audit',
    files: {
      'src/service.js': [
        'function createOrder() {',
        '  return true',
        '}',
        'function cancelOrder(id) {',
        '  return "cancelled"',
        '}',
        'function getStatus(id) {',
        '  return "active"',
        '}',
        'module.exports = { createOrder, cancelOrder, getStatus }',
        '',
      ].join('\n'),
      ...MAIN([
        'const s = require("./service")',
        'console.log(s.createOrder(), s.cancelOrder(1), s.getStatus(1))',
      ]),
    },
    issue:
      '审计任务：为 src/service.js 的 3 个入口函数（createOrder、cancelOrder、getStatus）各添加一行日志注释作为函数体第一行：// LOG: <函数名> entered（例如 createOrder 的注释是 // LOG: createOrder entered）。不改动其他逻辑，程序仍输出 "true cancelled active"。',
    verify(dir) {
      const c = read(dir, 'src/service.js') ?? ''
      for (const fn of ['createOrder', 'cancelOrder', 'getStatus']) {
        if (!c.includes(`// LOG: ${fn} entered`))
          return { ok: false, detail: `缺少 // LOG: ${fn} entered` }
      }
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('true cancelled active'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '3 个入口函数均有日志注释' }
    },
  },

  // ── 20. sort-order ───────────────────────────────────────────────────
  {
    id: '20-sort-order',
    files: {
      'src/sort.js': [
        'function sortDesc(arr) {',
        '  // BUG: 比较器写反了，实际是升序',
        '  return [...arr].sort((a, b) => a - b)',
        '}',
        'module.exports = { sortDesc }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { sortDesc } = require("./sort")',
        'const out = sortDesc([3, 1, 4, 1, 5])',
        'console.log(out.join(","))',
      ]),
    },
    issue:
      'Bug 修复：sortDesc 的名字表示降序，但比较器写反了导致实际升序。修复 src/sort.js 的比较器，使程序输出 "5,4,3,1,1"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('5,4,3,1,1')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '降序正确' }
    },
  },

  // ── 21. deep-copy ────────────────────────────────────────────────────
  {
    id: '21-deep-copy',
    files: {
      'src/clone.js': [
        '// Spec: deepClone(v) 深拷贝：对象/数组递归复制；',
        '// 普通值（string/number/boolean/null/undefined）原样返回；',
        '// 循环引用与原型链不处理。',
        'function deepClone(v) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { deepClone }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { deepClone } = require("./clone")',
        'const src = { a: 1, b: [1, 2, { c: 3 }], d: "x" }',
        'const out = deepClone(src)',
        'out.b[2].c = 99',
        'console.log(JSON.stringify(src))',
        'console.log(JSON.stringify(out))',
      ]),
    },
    issue:
      '实现任务：src/clone.js 的 deepClone 抛 "not implemented"。按文件顶部 Spec 实现深拷贝，使 main 第一行输出原始对象（其 b[2].c 必须保持 3），第二行输出克隆对象（b[2].c 已被改为 99）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want1 = '{"a":1,"b":[1,2,{"c":3}],"d":"x"}'
      const want2 = '{"a":1,"b":[1,2,{"c":99}],"d":"x"}'
      if (!r.stdout.includes(want1)) return { ok: false, detail: `原始对象被改动: ${r.stdout}` }
      if (!r.stdout.includes(want2)) return { ok: false, detail: `克隆输出不对: ${r.stdout}` }
      return { ok: true, detail: '深拷贝且互不影响' }
    },
  },

  // ── 22. shared-state ─────────────────────────────────────────────────
  {
    id: '22-shared-state',
    files: {
      'src/state.js': [
        'const store = {}',
        'function set(key, value) {',
        '  // BUG: 键和值写反了',
        '  store[value] = key',
        '}',
        'function get(key) { return store[key] }',
        'module.exports = { set, get }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { set, get } = require("./state")',
        'set("count", 3)',
        'set("label", "ok")',
        'console.log("count =", get("count"))',
        'console.log("label =", get("label"))',
      ]),
    },
    issue:
      'Bug 修复：src/state.js 的 set 把键和值存反了，get 读不到数据。修复后程序输出 "count = 3" 和 "label = ok"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('count = 3') || !r.stdout.includes('label = ok'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '键值存储方向正确' }
    },
  },

  // ── 23. rename-module ────────────────────────────────────────────────
  {
    id: '23-rename-module',
    files: {
      'src/legacy_utils.js': [
        'function normalizeName(name) { return name.trim().toLowerCase() }',
        'function parseNumber(s) { return parseInt(s, 10) }',
        'module.exports = { normalizeName, parseNumber }',
        '',
      ].join('\n'),
      'src/a.js': [
        'const { normalizeName } = require("./legacy_utils")',
        'console.log("a:", normalizeName("  Alice  "))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { normalizeName } = require("./legacy_utils")',
        'console.log("b:", normalizeName("BOB"))',
        '',
      ].join('\n'),
      'src/c.js': [
        'const { parseNumber } = require("./legacy_utils")',
        'console.log("c:", parseNumber("42px"))',
        '',
      ].join('\n'),
      'src/d.js': [
        'const { normalizeName } = require("./legacy_utils")',
        'console.log("d:", normalizeName("  Carol Smith  "))',
        '',
      ].join('\n'),
    },
    issue:
      '重构任务：src/legacy_utils.js 的文件名不好，请重命名为 src/utils.js，并更新 src/a.js、src/b.js、src/c.js、src/d.js 四个调用方的 require 路径，输出不变（a: alice / b: bob / c: 42 / d: carol smith）。',
    verify(dir) {
      if (read(dir, 'src/legacy_utils.js') !== null)
        return { ok: false, detail: 'legacy_utils.js 仍存在' }
      const utils = read(dir, 'src/utils.js') ?? ''
      if (!utils.includes('normalizeName') || !utils.includes('parseNumber'))
        return { ok: false, detail: 'utils.js 缺少函数' }
      for (const f of ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js']) {
        const c = read(dir, f) ?? ''
        if (c.includes('legacy_utils')) return { ok: false, detail: `${f} 仍引用旧路径` }
        if (!c.includes('require("./utils")')) return { ok: false, detail: `${f} 未引用新路径` }
      }
      for (const [f, want] of [
        ['src/a.js', 'a: alice'],
        ['src/b.js', 'b: bob'],
        ['src/c.js', 'c: 42'],
        ['src/d.js', 'd: carol smith'],
      ]) {
        const r = run(dir, f)
        if (r.status !== 0) return { ok: false, detail: `${f} 退出码 ${r.status}: ${r.stderr}` }
        if (!r.stdout.includes(want)) return { ok: false, detail: `${f} 输出 ${r.stdout}` }
      }
      return { ok: true, detail: '4 个调用方全部迁移完成' }
    },
  },

  // ── 24. implement-queue ──────────────────────────────────────────────
  {
    id: '24-implement-queue',
    files: {
      'src/queue.js': [
        '// Spec: Queue 类，FIFO：',
        '//   enqueue(v) 入队；dequeue() 出队并返回队首（空队列返回 undefined）；',
        '//   peek() 查看队首但不弹出；size() 返回当前长度。',
        'class Queue {',
        '  constructor() { throw new Error("not implemented") }',
        '}',
        'module.exports = { Queue }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { Queue } = require("./queue")',
        'const q = new Queue()',
        'q.enqueue(1)',
        'q.enqueue(2)',
        'q.enqueue(3)',
        'console.log(q.dequeue(), q.peek(), q.size())',
      ]),
    },
    issue:
      '实现任务：src/queue.js 的 Queue 抛 "not implemented"。按 Spec 实现队列（FIFO），使程序输出 "1 2 2"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('1 2 2')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: 'FIFO 行为正确' }
    },
  },

  // ── 25. test-driven ──────────────────────────────────────────────────
  {
    id: '25-test-driven',
    files: {
      'src/math.js': [
        'function add(a, b) { return a - b }',
        'function multiply(a, b) { return a + b }',
        'function divide(a, b) { return a * b }',
        'module.exports = { add, multiply, divide }',
        '',
      ].join('\n'),
      'tests/run-tests.js': [
        'const assert = require("assert")',
        'const { add, multiply, divide } = require("../src/math")',
        'assert.strictEqual(add(2, 3), 5)',
        'assert.strictEqual(multiply(4, 3), 12)',
        'assert.strictEqual(divide(10, 2), 5)',
        'console.log("ALL TESTS PASSED")',
        '',
      ].join('\n'),
    },
    issue:
      'Bug 修复：tests/run-tests.js 有 3 个断言失败。运行 node tests/run-tests.js 定位全部失败原因并修复 src/math.js 的三个实现，使测试全部通过并输出 "ALL TESTS PASSED"。',
    verify(dir) {
      const r = run(dir, 'tests/run-tests.js')
      if (r.status !== 0) return { ok: false, detail: `测试退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('ALL TESTS PASSED')) return { ok: false, detail: r.stdout }
      return { ok: true, detail: '3 个断言全部通过' }
    },
  },

  // ── 26. validate-user ────────────────────────────────────────────────
  {
    id: '26-validate-user',
    files: {
      'src/validate.js': [
        '// Spec: validateUser(u) 返回错误信息数组（无错误时返回空数组）：',
        '//   name 缺失或非字符串 → "name must be a string"',
        '//   age 缺失或非数字   → "age must be a number"',
        '//   age < 0            → "age must be >= 0"',
        '// 每个字段只报第一条错误；检查顺序 name 在前、age 在后。',
        'function validateUser(u) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { validateUser }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { validateUser } = require("./validate")',
        'console.log(JSON.stringify(validateUser({})))',
        'console.log(JSON.stringify(validateUser({ name: 42, age: 5 })))',
        'console.log(JSON.stringify(validateUser({ name: "ada", age: -1 })))',
      ]),
    },
    issue:
      '实现任务：src/validate.js 的 validateUser 抛 "not implemented"。按 Spec 实现校验逻辑，使程序输出三行：["name must be a string","age must be a number"]、["name must be a string"]、["age must be >= 0"]。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = [
        '["name must be a string","age must be a number"]',
        '["name must be a string"]',
        '["age must be >= 0"]',
      ]
      for (const w of want) {
        if (!r.stdout.includes(w)) return { ok: false, detail: `缺少 ${w}: ${r.stdout}` }
      }
      return { ok: true, detail: '3 个用例校验正确' }
    },
  },

  // ── 27. log-migration ────────────────────────────────────────────────
  {
    id: '27-log-migration',
    files: {
      'src/logger.js': [
        'function log(msg) { console.log("[app] " + msg) }',
        'module.exports = { log }',
        '',
      ].join('\n'),
      'src/mod1.js': ['console.log("[DEBUG] value=" + 1)', ''].join('\n'),
      'src/mod2.js': ['console.log("[DEBUG] env=dev")', ''].join('\n'),
      'src/mod3.js': ['console.log("[DEBUG] port=8080")', ''].join('\n'),
      'src/mod4.js': ['console.log("[DEBUG] status=ok")', ''].join('\n'),
      'src/mod5.js': ['console.log("[DEBUG] mode=test")', ''].join('\n'),
      ...MAIN([
        'require("./mod1")',
        'require("./mod2")',
        'require("./mod3")',
        'require("./mod4")',
        'require("./mod5")',
      ]),
    },
    issue:
      '迁移任务：项目引入了统一日志模块 src/logger.js（log(msg) 输出 "[app] " 前缀），请把 src/mod1.js ~ src/mod5.js 五个文件中的 console.log("[DEBUG] ...") 全部替换为调用 logger.log(...)，内容不变。程序应输出 5 行 "[app] ..."（value=1 / env=dev / port=8080 / status=ok / mode=test）。',
    verify(dir) {
      for (const f of ['src/mod1.js', 'src/mod2.js', 'src/mod3.js', 'src/mod4.js', 'src/mod5.js']) {
        const c = read(dir, f) ?? ''
        if (c.includes('[DEBUG]')) return { ok: false, detail: `${f} 仍有旧格式` }
        if (!c.includes('logger.log')) return { ok: false, detail: `${f} 未使用 logger.log` }
      }
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      for (const want of ['[app] value=1', '[app] env=dev', '[app] port=8080', '[app] status=ok', '[app] mode=test']) {
        if (!r.stdout.includes(want)) return { ok: false, detail: `缺少 ${want}: ${r.stdout}` }
      }
      return { ok: true, detail: '5 处日志全部迁移' }
    },
  },

  // ── 28. flatten ──────────────────────────────────────────────────────
  {
    id: '28-flatten',
    files: {
      'src/flatten.js': [
        '// Spec: flatten(arr) 把嵌套数组递归展平为一维，保持顺序；',
        '// 非数组元素原样保留；空数组返回 []。',
        '// 例：flatten([1,[2,[3,4]],[],5]) === [1,2,3,4,5]',
        'function flatten(arr) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { flatten }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { flatten } = require("./flatten")',
        'console.log(JSON.stringify(flatten([1, [2, [3, 4]], [], 5])))',
      ]),
    },
    issue:
      '实现任务：src/flatten.js 的 flatten 抛 "not implemented"。按 Spec 实现递归展平，使程序输出 "[1,2,3,4,5]"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('[1,2,3,4,5]')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '展平正确' }
    },
  },

  // ── 29. threshold ────────────────────────────────────────────────────
  {
    id: '29-threshold',
    files: {
      'src/gate.js': [
        'function isEligible(score, min) {',
        '  // BUG: 比较方向写反了（<= 应为 >=）',
        '  return score <= min',
        '}',
        'module.exports = { isEligible }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { isEligible } = require("./gate")',
        'console.log(isEligible(49, 50), isEligible(50, 50), isEligible(51, 50))',
      ]),
    },
    issue:
      'Bug 修复：isEligible(score, min) 表示 score 达到 min 即合格（边界 50 合格）。src/gate.js 的比较方向写反了。修复使程序输出 "false true true"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('false true true')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '边界判断正确' }
    },
  },

  // ── 30. simple-hash ──────────────────────────────────────────────────
  {
    id: '30-simple-hash',
    files: {
      'src/hash.js': [
        '// Spec: simpleHash(s)：h 初始为 0，对每个字符 ch：',
        '//   h = (h * 31 + ch.charCodeAt(0)) % 2147483648  (2^31)',
        '// 返回最终 h。',
        'function simpleHash(s) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { simpleHash }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { simpleHash } = require("./hash")',
        'console.log(simpleHash("hello"), simpleHash("dsh-mcp"))',
      ]),
    },
    issue:
      '实现任务：src/hash.js 的 simpleHash 抛 "not implemented"。按 Spec（h = h*31 + charCode，模 2^31）实现，使程序输出两个非负整数（hello 与 dsh-mcp 的哈希值）。',
    verify(dir) {
      const h = (s) => {
        let x = 0
        for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) % 2147483648
        return x
      }
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = `${h('hello')} ${h('dsh-mcp')}`
      if (!r.stdout.includes(want)) return { ok: false, detail: `输出不对: ${r.stdout.trim()} (期望 ${want})` }
      return { ok: true, detail: '哈希值与 spec 一致' }
    },
  },

  // ── 31. extract-text-utils ───────────────────────────────────────────
  {
    id: '31-extract-text-utils',
    files: {
      'src/a.js': [
        'function toSlug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }',
        'console.log("a:", toSlug("Hello World"))',
        '',
      ].join('\n'),
      'src/b.js': [
        'function toSlug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }',
        'console.log("b:", toSlug("DeepSeek Harness MCP!"))',
        '',
      ].join('\n'),
    },
    issue:
      '重构任务：src/a.js 与 src/b.js 重复了完全相同的 toSlug 实现。提取到新文件 src/shared/text.js（导出 toSlug），两个文件改为 require 调用，输出不变（a: hello-world / b: deepseek-harness-mcp）。',
    verify(dir) {
      const t = read(dir, 'src/shared/text.js') ?? ''
      if (!t.includes('toSlug')) return { ok: false, detail: 'shared/text.js 缺少 toSlug' }
      for (const f of ['src/a.js', 'src/b.js']) {
        const c = read(dir, f) ?? ''
        if (c.includes('toLowerCase().replace')) return { ok: false, detail: `${f} 仍内联实现` }
        if (!c.includes('shared/text')) return { ok: false, detail: `${f} 未引入 shared/text` }
      }
      for (const [f, want] of [['src/a.js', 'a: hello-world'], ['src/b.js', 'b: deepseek-harness-mcp']]) {
        const r = run(dir, f)
        if (r.status !== 0) return { ok: false, detail: `${f} 退出码 ${r.status}: ${r.stderr}` }
        if (!r.stdout.includes(want)) return { ok: false, detail: `${f} 输出 ${r.stdout}` }
      }
      return { ok: true, detail: '两处已提取到共享模块' }
    },
  },

  // ── 32. async-order ──────────────────────────────────────────────────
  {
    id: '32-async-order',
    files: {
      'src/pipe.js': [
        'async function step1() { return "A" }',
        'async function step2() { return "B" }',
        'function run() {',
        '  // BUG: 解构顺序与 Promise.all 的数组顺序不一致',
        '  return Promise.all([step2(), step1()]).then(([a, b]) => a + b)',
        '}',
        'module.exports = { run }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { run } = require("./pipe")',
        'run().then((v) => console.log(v))',
      ]),
    },
    issue:
      'Bug 修复：run() 应输出 "AB"（step1 结果在前），实际输出 "BA"。修复 src/pipe.js 中 Promise.all 数组与解构的顺序不一致问题。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (r.stdout.trim() !== 'AB') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '顺序正确 AB' }
    },
  },

  // ── 33. off-by-one ───────────────────────────────────────────────────
  {
    id: '33-off-by-one',
    files: {
      'src/looper.js': [
        'function collect(n) {',
        '  // BUG: 边界少 1：collect(n) 应返回 0..n（含 n）',
        '  const out = []',
        '  for (let i = 0; i < n; i++) out.push(i)',
        '  return out',
        '}',
        'module.exports = { collect }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { collect } = require("./looper")',
        'console.log(collect(5).join(","))',
      ]),
    },
    issue:
      'Bug 修复：collect(n) 应收集 0 到 n（含 n），但当前漏掉了 n。修复 src/looper.js 的循环边界，使程序输出 "0,1,2,3,4,5"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('0,1,2,3,4,5')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '边界包含 n' }
    },
  },

  // ── 34. merge-config ─────────────────────────────────────────────────
  {
    id: '34-merge-config',
    files: {
      'src/merge.js': [
        'function merge(base, overrides) {',
        '  // BUG: 浅合并，嵌套对象整个被覆盖',
        '  return { ...base, ...overrides }',
        '}',
        'module.exports = { merge }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { merge } = require("./merge")',
        'const out = merge(',
        '  { db: { host: "localhost", port: 5432 }, debug: false },',
        '  { db: { host: "prod" }, debug: true },',
        ')',
        'console.log(JSON.stringify(out))',
      ]),
    },
    issue:
      'Bug 修复：merge(base, overrides) 应深合并：嵌套对象逐键合并（db.host 覆盖为 "prod" 但 db.port 保留 5432）。当前浅合并把整个 db 对象替换掉了。修复 src/merge.js，使输出为 {"db":{"host":"prod","port":5432},"debug":true}。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      let out
      try {
        out = JSON.parse(r.stdout.trim())
      } catch {
        return { ok: false, detail: `输出不是 JSON: ${r.stdout}` }
      }
      if (out?.db?.host !== 'prod') return { ok: false, detail: `db.host 不对: ${r.stdout}` }
      if (out?.db?.port !== 5432) return { ok: false, detail: `db.port 丢失: ${r.stdout}` }
      if (out?.debug !== true) return { ok: false, detail: `debug 不对: ${r.stdout}` }
      return { ok: true, detail: '深合并正确' }
    },
  },

  // ── 35. error-propagation ────────────────────────────────────────────
  {
    id: '35-error-propagation',
    files: {
      'src/load.js': [
        'async function fetchData() { throw new Error("connection refused") }',
        'function load() {',
        '  // BUG: 吞掉了错误，调用方无法感知失败',
        '  return fetchData().catch(() => null)',
        '}',
        'module.exports = { load }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { load } = require("./load")',
        'load()',
        '  .then((v) => console.log("v =", v))',
        '  .catch((e) => console.log("ERR", e.message))',
      ]),
    },
    issue:
      'Bug 修复：src/load.js 的 load 用 .catch(() => null) 吞掉了 fetchData 的错误，main 打印 "v = null" 而不是错误。修复使错误向调用方传播，程序输出 "ERR connection refused"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('ERR') || !r.stdout.includes('connection refused'))
        return { ok: false, detail: `错误未传播: ${r.stdout}` }
      return { ok: true, detail: '错误正确传播' }
    },
  },

  // ── 36. double-encoding ──────────────────────────────────────────────
  {
    id: '36-double-encoding',
    files: {
      'src/url.js': [
        'function buildUrl(base, query) {',
        '  // BUG: 对参数编码了两次',
        '  return base + "?q=" + encodeURIComponent(encodeURIComponent(query))',
        '}',
        'module.exports = { buildUrl }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { buildUrl } = require("./url")',
        'console.log(buildUrl("http://x", "a b&c"))',
      ]),
    },
    issue:
      'Bug 修复：buildUrl 对查询参数编码了两次，期望只编码一次。修复 src/url.js，使程序输出 "http://x?q=a%20b%26c"（而不是 %2520 / %2526）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('http://x?q=a%20b%26c'))
        return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '单次编码正确' }
    },
  },

  // ── 37. dir-walk ─────────────────────────────────────────────────────
  {
    id: '37-dir-walk',
    files: {
      'src/tree.js': [
        '// Spec: listFiles(dir)：递归遍历目录，返回 dir 下所有 .js 文件',
        '// 的路径（相对 dir，含子目录前缀，如 "sub/b.js"），按字典序排序。',
        '// 例：listFiles("src/data") 应返回 ["a.js","c.js","sub/b.js"]。',
        'function listFiles(dir) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { listFiles }',
        '',
      ].join('\n'),
      'src/data/a.js': ['// fixture a', ''].join('\n'),
      'src/data/c.js': ['// fixture c', ''].join('\n'),
      'src/data/sub/b.js': ['// fixture b', ''].join('\n'),
      ...MAIN([
        'const { listFiles } = require("./tree")',
        'console.log(listFiles("src/data").join("\\n"))',
      ]),
    },
    issue:
      '实现任务：src/tree.js 的 listFiles 抛 "not implemented"。按 Spec 递归遍历目录（可用 node:fs 的 readdirSync / statSync），使程序输出三行：a.js、c.js、sub/b.js（字典序）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const lines = r.stdout.trim().split('\n')
      if (lines.length !== 3) return { ok: false, detail: `行数不对: ${r.stdout}` }
      if (lines[0] !== 'a.js' || lines[1] !== 'c.js' || lines[2] !== 'sub/b.js')
        return { ok: false, detail: `顺序/内容不对: ${r.stdout}` }
      return { ok: true, detail: '3 个文件按字典序列出' }
    },
  },

  // ── 38. priority-order ───────────────────────────────────────────────
  {
    id: '38-priority-order',
    files: {
      'src/bus.js': [
        'const handlers = []',
        'function on(fn) { handlers.push(fn) }',
        'function emit(x) {',
        '  // BUG: 反序执行了，应先注册的先执行',
        '  for (const h of [...handlers].reverse()) h(x)',
        '}',
        'module.exports = { on, emit }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { on, emit } = require("./bus")',
        'on(() => console.log("first"))',
        'on(() => console.log("second"))',
        'emit()',
      ]),
    },
    issue:
      'Bug 修复：bus 的事件处理器应先注册先执行，但 emit 反序执行。修复 src/bus.js，使程序按顺序输出 "first" 然后是 "second"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      const i1 = r.stdout.indexOf('first')
      const i2 = r.stdout.indexOf('second')
      if (i1 === -1 || i2 === -1 || i1 > i2)
        return { ok: false, detail: `顺序不对: ${r.stdout}` }
      return { ok: true, detail: '先注册先执行' }
    },
  },

  // ── 39. split-util ───────────────────────────────────────────────────
  {
    id: '39-split-util',
    files: {
      'src/lib/utils.js': [
        'function formatDate(d) { return d.toISOString().slice(0, 10) }',
        'function toSlug(s) { return s.toLowerCase().replace(/\\s+/g, "-") }',
        'function toMoney(n) { return "$" + n.toFixed(2) }',
        'module.exports = { formatDate, toSlug, toMoney }',
        '',
      ].join('\n'),
      'src/a.js': [
        'const { formatDate } = require("./lib/utils")',
        'console.log("a:", formatDate(new Date("2026-01-02T00:00:00Z")))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { toSlug } = require("./lib/utils")',
        'console.log("b:", toSlug("Hello World"))',
        '',
      ].join('\n'),
      'src/c.js': [
        'const { toMoney } = require("./lib/utils")',
        'console.log("c:", toMoney(12.5))',
        '',
      ].join('\n'),
    },
    issue:
      '重构任务：src/lib/utils.js 混了三种职责（日期/字符串/金额）。拆分为 src/lib/date.js（formatDate）、src/lib/string.js（toSlug）、src/lib/number.js（toMoney），删除 utils.js，更新 src/a.js、src/b.js、src/c.js 三个调用方。输出不变（a: 2026-01-02 / b: hello-world / c: $12.50）。',
    verify(dir) {
      if (read(dir, 'src/lib/utils.js') !== null)
        return { ok: false, detail: 'utils.js 仍存在' }
      if (!(read(dir, 'src/lib/date.js') ?? '').includes('formatDate'))
        return { ok: false, detail: 'date.js 缺少 formatDate' }
      if (!(read(dir, 'src/lib/string.js') ?? '').includes('toSlug'))
        return { ok: false, detail: 'string.js 缺少 toSlug' }
      if (!(read(dir, 'src/lib/number.js') ?? '').includes('toMoney'))
        return { ok: false, detail: 'number.js 缺少 toMoney' }
      for (const f of ['src/a.js', 'src/b.js', 'src/c.js']) {
        const c = read(dir, f) ?? ''
        if (c.includes('./lib/utils')) return { ok: false, detail: `${f} 仍引用 utils` }
      }
      for (const [f, want] of [
        ['src/a.js', 'a: 2026-01-02'],
        ['src/b.js', 'b: hello-world'],
        ['src/c.js', 'c: $12.50'],
      ]) {
        const r = run(dir, f)
        if (r.status !== 0) return { ok: false, detail: `${f} 退出码 ${r.status}: ${r.stderr}` }
        if (!r.stdout.includes(want)) return { ok: false, detail: `${f} 输出 ${r.stdout}` }
      }
      return { ok: true, detail: '3 个职责文件拆分完成' }
    },
  },

  // ── 40. priority-compare ─────────────────────────────────────────────
  {
    id: '40-priority-compare',
    files: {
      'src/sorter.js': [
        'function byPriority(a, b) {',
        '  // BUG: 用了 name 排序，忽略了 priority 字段',
        '  return a.name.localeCompare(b.name)',
        '}',
        'module.exports = { byPriority }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { byPriority } = require("./sorter")',
        'const users = [',
        '  { name: "low", priority: 1 },',
        '  { name: "high", priority: 3 },',
        '  { name: "mid", priority: 2 },',
        ']',
        'console.log(users.sort(byPriority).map((u) => u.name).join(","))',
      ]),
    },
    issue:
      'Bug 修复：byPriority 应该按 priority 降序排列，但实际按 name 字母序排列。修复 src/sorter.js 的比较器，使程序输出 "high,mid,low"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('high,mid,low')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '按优先级降序' }
    },
  },

  // ── 41. memoize ──────────────────────────────────────────────────────
  {
    id: '41-memoize',
    files: {
      'src/memo.js': [
        '// Spec: memoize(fn) 返回带缓存的包装函数：',
        '//   用 JSON.stringify(参数数组) 作为缓存 key；',
        '//   命中缓存直接返回缓存值，不调用原 fn；',
        '//   不同 key 分别缓存。',
        'function memoize(fn) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { memoize }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { memoize } = require("./memo")',
        'let calls = 0',
        'const f = memoize((a, b) => { calls++; return a + b })',
        'console.log(f(1, 2), f(1, 2), f(2, 3), "calls=" + calls)',
      ]),
    },
    issue:
      '实现任务：src/memo.js 的 memoize 抛 "not implemented"。按 Spec 实现缓存包装，使程序输出 "3 3 5 calls=2"（(1,2) 只计算一次，(2,3) 计算一次）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('3 3 5 calls=2'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '缓存命中正确' }
    },
  },

  // ── 42. dry-run ──────────────────────────────────────────────────────
  {
    id: '42-dry-run',
    files: {
      'src/deploy.js': [
        'function deploy(plan, dryRun) {',
        '  // BUG: 忽略了 dryRun 参数，总是执行实际修改',
        '  plan.applied = true',
        '  return plan',
        '}',
        'module.exports = { deploy }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { deploy } = require("./deploy")',
        'const p = deploy({ applied: false }, true)',
        'console.log(p.applied)',
      ]),
    },
    issue:
      'Bug 修复：deploy(plan, dryRun=true) 是预演模式，不应修改 plan。但 src/deploy.js 忽略了 dryRun 参数。修复后程序输出 "false"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'false') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: 'dryRun 模式不修改 plan' }
    },
  },

  // ── 43. sort-keys ────────────────────────────────────────────────────
  {
    id: '43-sort-keys',
    files: {
      'src/report.js': [
        'function summarize(users) {',
        '  // BUG: 未按键排序，输出顺序依赖插入顺序',
        '  const out = {}',
        '  for (const u of users) out[u.name] = u.score',
        '  return out',
        '}',
        'module.exports = { summarize }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { summarize } = require("./report")',
        'const out = summarize([',
        '  { name: "bob", score: 2 },',
        '  { name: "ada", score: 1 },',
        '  { name: "cy", score: 3 },',
        '])',
        'console.log(JSON.stringify(out))',
      ]),
    },
    issue:
      'Bug 修复：summarize 的返回对象应按键名升序（ada、bob、cy），但当前按插入顺序（bob、ada、cy）。修复 src/report.js，使程序输出 {"ada":1,"bob":2,"cy":3}。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('{"ada":1,"bob":2,"cy":3}'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '键名升序' }
    },
  },

  // ── 44. retry ────────────────────────────────────────────────────────
  {
    id: '44-retry',
    files: {
      'src/retry.js': [
        '// Spec: retry(fn, attempts)：attempts >= 1。依次尝试调用 fn()，',
        '// 若 fn 抛错且还有剩余次数则重试；全部失败抛出最后一次的错误；',
        '// 成功立即返回结果。',
        'function retry(fn, attempts) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { retry }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { retry } = require("./retry")',
        'let tries = 0',
        'const f = () => { tries++; if (tries < 3) throw new Error("flaky"); return "ok" }',
        'console.log(retry(f, 5), "tries=" + tries)',
      ]),
    },
    issue:
      '实现任务：src/retry.js 的 retry 抛 "not implemented"。按 Spec 实现重试逻辑，使程序输出 "ok tries=3"（fn 前两次抛错，第三次成功）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('ok tries=3')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '重试 3 次成功' }
    },
  },

  // ── 45. money-precision ──────────────────────────────────────────────
  {
    id: '45-money-precision',
    files: {
      'src/money.js': [
        'function calcTotal(prices) {',
        '  // BUG: 直接浮点累加，产生 0.30000000000000004',
        '  return prices.reduce((s, p) => s + p, 0)',
        '}',
        'module.exports = { calcTotal }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { calcTotal } = require("./money")',
        'console.log(calcTotal([0.1, 0.2]))',
      ]),
    },
    issue:
      'Bug 修复：金额计算必须精确。calcTotal([0.1, 0.2]) 应返回两位小数字符串 "0.30"，但当前浮点累加输出 0.30000000000000004。修复 src/money.js（建议换算成整数分计算后 toFixed(2)），使程序输出 "0.30"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== '0.30') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '金额精确到分' }
    },
  },

  // ── 46. inject-deps ──────────────────────────────────────────────────
  {
    id: '46-inject-deps',
    files: {
      'src/store.js': [
        'const rows = {}',
        'function save(id, v) { rows[id] = v }',
        'function load(id) { return rows[id] }',
        'module.exports = { save, load }',
        '',
      ].join('\n'),
      'src/app.js': [
        'const store = require("./store")',
        'function run() {',
        '  store.save("a", 1)',
        '  return store.load("a")',
        '}',
        'module.exports = { run }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { run } = require("./app")',
        'console.log(run())',
      ]),
    },
    issue:
      '重构任务：让 store 成为可注入的依赖：src/store.js 改为导出 createStore() 工厂（每次调用返回独立实例）；src/app.js 的 run(store) 接收 store 参数而不是自己 require；main.js 用 createStore() 创建实例传入。程序仍输出 "1"。',
    verify(dir) {
      const s = read(dir, 'src/store.js') ?? ''
      const a = read(dir, 'src/app.js') ?? ''
      const m = read(dir, 'src/main.js') ?? ''
      if (!s.includes('createStore')) return { ok: false, detail: 'store.js 缺少 createStore' }
      if (!/run\s*\(\s*store\s*\)/.test(a)) return { ok: false, detail: 'app.js 的 run 未接受 store 参数' }
      if (a.includes('require("./store")')) return { ok: false, detail: 'app.js 仍自行 require store' }
      if (!m.includes('createStore')) return { ok: false, detail: 'main.js 未使用 createStore' }
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (r.stdout.trim() !== '1') return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '依赖已注入且输出正确' }
    },
  },

  // ── 47. cron-minutes ─────────────────────────────────────────────────
  {
    id: '47-cron-minutes',
    files: {
      'src/cron.js': [
        '// Spec: minutes(spec) 解析 cron 分钟字段，返回升序去重的分钟数组（0-59）：',
        '//   "*"    → 全部 0-59',
        '//   "5"    → [5]',
        '//   "*/15" → [0,15,30,45]',
        '//   "1,2,5-7" → [1,2,5,6,7]',
        '// 支持上述各形式（逗号分段；段内可为单值、a-b 范围、*/step）。',
        'function minutes(spec) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { minutes }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { minutes } = require("./cron")',
        'console.log(JSON.stringify(minutes("*/15")))',
        'console.log(JSON.stringify(minutes("1,2,5-7")))',
        'console.log(minutes("*").length)',
      ]),
    },
    issue:
      '实现任务：src/cron.js 的 minutes 抛 "not implemented"。按 Spec 实现 cron 分钟字段解析，使程序输出三行：[0,15,30,45]、[1,2,5,6,7]、60。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = ['[0,15,30,45]', '[1,2,5,6,7]', '60']
      for (const w of want) {
        if (!r.stdout.includes(w)) return { ok: false, detail: `缺少 ${w}: ${r.stdout}` }
      }
      return { ok: true, detail: '3 种 cron 表达式解析正确' }
    },
  },

  // ── 48. empty-input ──────────────────────────────────────────────────
  {
    id: '48-empty-input',
    files: {
      'src/stats.js': [
        'function average(nums) {',
        '  // BUG: 空数组时 reduce 无初始值崩溃',
        '  return nums.reduce((s, n) => s + n) / nums.length',
        '}',
        'module.exports = { average }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { average } = require("./stats")',
        'console.log(average([2, 4, 6]))',
        'console.log(average([]))',
      ]),
    },
    issue:
      'Bug 修复：average([]) 空数组时崩溃（reduce 无初始值）。修复 src/stats.js，使空数组返回 0，程序输出两行："4" 和 "0"，不崩溃。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const lines = r.stdout.trim().split('\n')
      if (lines.length !== 2 || lines[0] !== '4' || lines[1] !== '0')
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '空数组返回 0' }
    },
  },

  // ── 49. state-leak ───────────────────────────────────────────────────
  {
    id: '49-state-leak',
    files: {
      'src/tracker.js': [
        '// BUG: total 是静态变量，所有实例共享同一个计数',
        'class Tracker {',
        '  static total = 0',
        '  add(n) { Tracker.total += n }',
        '  get() { return Tracker.total }',
        '}',
        'module.exports = { Tracker }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { Tracker } = require("./tracker")',
        'const t1 = new Tracker()',
        'const t2 = new Tracker()',
        't1.add(5)',
        'console.log("t1:", t1.get())',
        't2.add(3)',
        'console.log("t1:", t1.get())',
      ]),
    },
    issue:
      'Bug 修复：每个 Tracker 实例应有独立的计数，但 total 是静态变量导致所有实例共享（t2.add(3) 污染了 t1 的计数）。修复 src/tracker.js，使程序两行都输出 "t1: 5"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const lines = r.stdout.trim().split('\n').filter((l) => l.length > 0)
      if (lines.length !== 2 || lines[0] !== 't1: 5' || lines[1] !== 't1: 5')
        return { ok: false, detail: `状态泄漏: ${r.stdout}` }
      return { ok: true, detail: '实例间计数隔离' }
    },
  },

  // ── 50. multi-bug ────────────────────────────────────────────────────
  {
    id: '50-multi-bug',
    files: {
      'src/invoice.js': [
        'function lineTotal(price, qty) {',
        '  // BUG 1: 数量写死为 1',
        '  return price * 1',
        '}',
        'function tax(amount) {',
        '  // BUG 2: 税率方向错：应为 0.05 加成',
        '  return amount * 0.95',
        '}',
        'function format(total) {',
        '  // BUG 3: 拼接顺序错',
        '  return total + " total:"',
        '}',
        'module.exports = { lineTotal, tax, format }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { lineTotal, tax, format } = require("./invoice")',
        'const t = lineTotal(10, 3)',
        'const withTax = t + tax(t)',
        'console.log(format(withTax))',
      ]),
    },
    issue:
      'Bug 修复：src/invoice.js 有三个独立 bug（数量写死、税率方向错、字符串拼接顺序错）。全部修复后程序输出 "total: 31.5"（10 × 3 = 30，加 5% 税 = 31.5）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'total: 31.5') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '3 个 bug 全部修复' }
    },
  },

  // ═══════════════════════ 第二批 HARD（51–100）═══════════════════════

  // ── 51. deep-trace (4-layer) ─────────────────────────────────────────
  {
    id: '51-deep-trace',
    files: {
      'src/main.js': [
        'const { orderTotal } = require("./service")',
        'orderTotal(1).then(console.log).catch((e) => console.log("ERR", e.message))',
        '',
      ].join('\n'),
      'src/service.js': [
        'const { findOrder } = require("./repo")',
        'async function orderTotal(id) {',
        '  const o = await findOrder(id)',
        '  return o.qty * o.price * (1 + o.tax)',
        '}',
        'module.exports = { orderTotal }',
        '',
      ].join('\n'),
      'src/repo.js': [
        'const { loadOrders } = require("./db")',
        'async function findOrder(id) {',
        '  const rows = await loadOrders()',
        '  const found = rows.find((r) => r.id === id)',
        '  // BUG: 返回时把 tax 字段丢掉了',
        '  return { id: found.id, qty: found.qty, price: found.price }',
        '}',
        'module.exports = { findOrder }',
        '',
      ].join('\n'),
      'src/db.js': [
        'async function loadOrders() {',
        '  return [',
        '    { id: 1, qty: 2, price: 100, tax: 0.05 },',
        '    { id: 2, qty: 1, price: 50, tax: 0.1 },',
        '  ]',
        '}',
        'module.exports = { loadOrders }',
        '',
      ].join('\n'),
    },
    issue:
      'Bug 修复：orderTotal(1) 应输出 210（2 × 100 × 1.05），当前输出 NaN。追踪 src/main.js → src/service.js → src/repo.js → src/db.js 四层数据流，找到字段在哪一层丢失并修复。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('210')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '4 层数据流完整' }
    },
  },

  // ── 52. cross-module-consistency ─────────────────────────────────────
  {
    id: '52-cross-module-consistency',
    files: {
      'src/config.js': ['module.exports = { MAX_RETRIES: 3 }', ''].join('\n'),
      'src/client.js': [
        '// BUG: 硬编码 5，未引用 config.MAX_RETRIES',
        'function maxRetries() { return 5 }',
        'module.exports = { maxRetries }',
        '',
      ].join('\n'),
      'src/retryer.js': [
        '// BUG: 硬编码 3，未引用 config.MAX_RETRIES',
        'function maxRetries() { return 3 }',
        'module.exports = { maxRetries }',
        '',
      ].join('\n'),
      ...MAIN([
        'const c = require("./client")',
        'const r = require("./retryer")',
        'const cfg = require("./config")',
        'console.log(c.maxRetries(), r.maxRetries(), "config=" + cfg.MAX_RETRIES)',
      ]),
    },
    issue:
      'Bug 修复：client.js 和 retryer.js 各自硬编码了重试次数（5 和 3），与 config.js 的 MAX_RETRIES=3 不一致。两个模块都应从 config 读取，使程序输出 "3 3 config=3"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('3 3 config=3')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '两处与 config 一致' }
    },
  },

  // ── 53. async-race ───────────────────────────────────────────────────
  {
    id: '53-async-race',
    files: {
      'src/worker.js': [
        'const delay = (ms) => new Promise((res) => setTimeout(res, ms))',
        'async function run() {',
        '  const out = []',
        '  const tasks = [',
        '    () => delay(30).then(() => out.push("A")),',
        '    () => delay(10).then(() => out.push("B")),',
        '    () => delay(20).then(() => out.push("C")),',
        '  ]',
        '  // BUG: 并发启动，完成顺序由延迟决定而不是任务顺序',
        '  await Promise.all(tasks.map((t) => t()))',
        '  return out',
        '}',
        'module.exports = { run }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { run } = require("./worker")',
        'run().then((o) => console.log(o.join(",")))',
      ]),
    },
    issue:
      'Bug 修复：run() 的返回值应保持任务声明顺序 "A,B,C"，但并发启动导致完成顺序按延迟（B,C,A）。修复 src/worker.js（例如串行 await，或结果按索引归位），使程序输出 "A,B,C"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (r.stdout.trim() !== 'A,B,C') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '结果顺序与任务顺序一致' }
    },
  },

  // ── 54. pagination ───────────────────────────────────────────────────
  {
    id: '54-pagination',
    files: {
      'src/page.js': [
        'function page(items, pageNum, pageSize) {',
        '  // BUG: 页码按 0 起算处理，但约定页码从 1 开始',
        '  return items.slice(pageNum * pageSize, (pageNum + 1) * pageSize)',
        '}',
        'module.exports = { page }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { page } = require("./page")',
        'const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]',
        'console.log(page(items, 1, 3).join(","))',
      ]),
    },
    issue:
      'Bug 修复：page(items, 1, 3) 应返回第 1 页（页码从 1 开始）[1,2,3]，当前却返回 [4,5,6]。修复 src/page.js 的偏移计算。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('1,2,3')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '页码从 1 起正确' }
    },
  },

  // ── 55. state-machine ────────────────────────────────────────────────
  {
    id: '55-state-machine',
    files: {
      'src/fsm.js': [
        '// Spec: 订单状态机。状态：new → paid → shipped → done；new 可取消 → cancelled。',
        '// transition(state, action)：action ∈ { pay, ship, finish, cancel }。',
        '// 合法转移返回新状态；非法转移返回 null。',
        '// 例：transition("new", "pay") === "paid"；transition("new", "finish") === null。',
        'function transition(state, action) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { transition }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { transition } = require("./fsm")',
        'console.log(transition("new", "pay"))',
        'console.log(transition("paid", "ship"))',
        'console.log(transition("shipped", "finish"))',
        'console.log(transition("new", "cancel"))',
        'console.log(transition("done", "pay"))',
      ]),
    },
    issue:
      '实现任务：src/fsm.js 的 transition 抛 "not implemented"。按 Spec 实现订单状态机，使程序输出五行：paid、shipped、done、cancelled、null。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const lines = r.stdout.trim().split('\n')
      const want = ['paid', 'shipped', 'done', 'cancelled', 'null']
      if (lines.length !== want.length || lines.some((l, i) => l.trim() !== want[i]))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '状态机全部转移正确' }
    },
  },

  // ── 56. csv-parser ───────────────────────────────────────────────────
  {
    id: '56-csv-parser',
    files: {
      'src/csv.js': [
        '// Spec: parseCsv(s) 解析 CSV 文本为二维数组：',
        '//   按 \\n 分行；每行按逗号分列；',
        '//   字段被双引号包裹时：逗号与换行按字面处理，双引号用 "" 转义；',
        '//   行尾无多余空行。',
        '// 例：parseCsv(\'a,"b,c",d\\n"x""y",z\') === [["a","b,c","d"],["x"y","z"]]',
        'function parseCsv(s) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { parseCsv }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { parseCsv } = require("./csv")',
        'console.log(JSON.stringify(parseCsv(\'a,"b,c",d\\n"x""y",z\')))',
      ]),
    },
    issue:
      '实现任务：src/csv.js 的 parseCsv 抛 "not implemented"。按 Spec 实现 CSV 解析（含引号包裹、双引号转义），使程序输出 [["a","b,c","d"],["x"y","z"]]。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = '[["a","b,c","d"],["x\\"y","z"]]'
      if (!r.stdout.includes(want)) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '引号/逗号/转义全部正确' }
    },
  },

  // ── 57. cache-invalidation ───────────────────────────────────────────
  {
    id: '57-cache-invalidation',
    files: {
      'src/cache.js': [
        'const cache = new Map()',
        'function get(key) { return cache.get(key) }',
        'function set(key, value) { cache.set(key, value) }',
        'function invalidate(key) {',
        '  // BUG: 删错了键',
        '  cache.delete(key + "_stale")',
        '}',
        'module.exports = { get, set, invalidate }',
        '',
      ].join('\n'),
      ...MAIN([
        'const c = require("./cache")',
        'c.set("k", 1)',
        'console.log("before:", c.get("k"))',
        'c.invalidate("k")',
        'console.log("after:", c.get("k"))',
      ]),
    },
    issue:
      'Bug 修复：invalidate("k") 后 get("k") 应返回 undefined（缓存已失效），但当前仍返回 1。修复 src/cache.js 的 invalidate，使程序输出 "before: 1" 和 "after: undefined"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('before: 1') || !r.stdout.includes('after: undefined'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '缓存正确失效' }
    },
  },

  // ── 58. drain-once ───────────────────────────────────────────────────
  {
    id: '58-drain-once',
    files: {
      'src/tq.js': [
        'const queue = []',
        'function enqueue(fn) { queue.push(fn) }',
        'function drain() {',
        '  // BUG: 处理完不清空队列，下次 drain 会把同一批再执行一遍',
        '  for (const fn of queue) fn()',
        '}',
        'module.exports = { enqueue, drain }',
        '',
      ].join('\n'),
      ...MAIN([
        'const tq = require("./tq")',
        'tq.enqueue(() => console.log("first"))',
        'tq.enqueue(() => console.log("second"))',
        'tq.drain()',
        'tq.drain()',
      ]),
    },
    issue:
      'Bug 修复：drain() 处理完应清空队列，第二次 drain 不应重复执行。当前同一批任务被执行了两次。修复 src/tq.js，使程序恰好输出两行：first、second（各一次）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      const lines = r.stdout.trim().split('\n')
      if (lines.length !== 2 || lines[0] !== 'first' || lines[1] !== 'second')
        return { ok: false, detail: `重复执行: ${r.stdout}` }
      return { ok: true, detail: 'drain 后队列清空' }
    },
  },

  // ── 59. throttle ─────────────────────────────────────────────────────
  {
    id: '59-throttle',
    files: {
      'src/throttle.js': [
        '// Spec: throttle(fn, interval, now)：interval 毫秒内最多执行一次 fn。',
        '// 首次调用立即执行；间隔期内调用被丢弃（不排队）；',
        '// now 是注入的时间函数（默认 Date.now），用于测试。',
        'function throttle(fn, interval, now) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { throttle }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { throttle } = require("./throttle")',
        'let t = 0',
        'let calls = 0',
        'const now = () => t',
        'const f = throttle(() => { calls++ }, 100, now)',
        'f(); f(); f()',
        't = 50',
        'f()',
        't = 100',
        'f()',
        'console.log("calls=" + calls)',
      ]),
    },
    issue:
      '实现任务：src/throttle.js 的 throttle 抛 "not implemented"。按 Spec 实现节流（时间注入 now 便于确定性验证），使程序输出 "calls=2"（t=0 首次执行、t=100 再次执行；中间 3 次调用被丢弃）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('calls=2')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '节流区间内丢弃调用' }
    },
  },

  // ── 60. ini-parser ───────────────────────────────────────────────────
  {
    id: '60-ini-parser',
    files: {
      'src/ini.js': [
        '// Spec: parseIni(s) 解析 INI 文本：',
        '//   ; 开头的行是注释，忽略；',
        '//   [section] 开头的行切换当前 section（键放入该 section 对象）；',
        '//   key=value 行：无 section 时放入顶层；',
        '//   返回 { key: value, section: { key: value } }。',
        'function parseIni(s) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { parseIni }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { parseIni } = require("./ini")',
        'console.log(JSON.stringify(parseIni("; comment\\nkey=top\\n[db]\\nhost=localhost\\nport=8080")))',
      ]),
    },
    issue:
      '实现任务：src/ini.js 的 parseIni 抛 "not implemented"。按 Spec 解析 INI，使程序输出 {"key":"top","db":{"host":"localhost","port":"8080"}}。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = '{"key":"top","db":{"host":"localhost","port":"8080"}}'
      if (!r.stdout.includes(want)) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: 'INI 解析正确' }
    },
  },

  // ── 61. index-offset ─────────────────────────────────────────────────
  {
    id: '61-index-offset',
    files: {
      'src/indexer.js': [
        'function findIndex(arr, value) {',
        '  // BUG: 返回的是"第几个"（1 起），不是数组索引',
        '  return arr.indexOf(value) + 1',
        '}',
        'module.exports = { findIndex }',
        '',
      ].join('\n'),
      'src/app.js': [
        'const { findIndex } = require("./indexer")',
        'function getItem(items, value) {',
        '  const i = findIndex(items, value)',
        '  return items[i]',
        '}',
        'module.exports = { getItem }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { getItem } = require("./app")',
        'console.log(getItem(["a", "b", "c"], "b"))',
      ]),
    },
    issue:
      'Bug 修复：getItem(["a","b","c"], "b") 应返回 "b"。但 findIndex 返回的是 1 起的"第几个"（2），app.js 当数组索引用，取到了 "c"。修复两处之一（indexer 应返回 0 起索引），使程序输出 "b"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'b') return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '索引偏移已修正' }
    },
  },

  // ── 62. deep-merge-arrays ────────────────────────────────────────────
  {
    id: '62-deep-merge-arrays',
    files: {
      'src/merge.js': [
        'function merge(base, overrides) {',
        '  const out = {}',
        '  for (const k of Object.keys(base)) {',
        '    if (overrides[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {',
        '      out[k] = merge(base[k], overrides[k])',
        '    } else {',
        '      out[k] = overrides[k] ?? base[k]',
        '    }',
        '  }',
        '  // BUG: 数组没有被覆盖——overrides 里的数组键不在 base 时丢了',
        '  return out',
        '}',
        'module.exports = { merge }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { merge } = require("./merge")',
        'const out = merge({ version: 1 }, { tags: ["c"] })',
        'console.log(JSON.stringify(out))',
      ]),
    },
    issue:
      'Bug 修复：merge({version:1}, {tags:["c"]}) 应输出 {"version":1,"tags":["c"]}。但当前实现只遍历 base 已有的键，overrides 里新出现的 tags 被丢弃（数组应整体替换）。修复 src/merge.js（需处理 overrides 中出现的新键、数组整体替换），使程序输出 {"version":1,"tags":["c"]}。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = '{"version":1,"tags":["c"]}'
      if (!r.stdout.includes(want)) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '数组整体替换且新键不丢' }
    },
  },

  // ── 63. fallback-chain ───────────────────────────────────────────────
  {
    id: '63-fallback-chain',
    files: {
      'src/resolver.js': [
        'const env = { get: () => undefined }',
        'const local = { get: (name) => ({ api_key: "local-key" }[name]) }',
        'function resolve(name) {',
        '  const fromEnv = env.get(name)',
        '  // BUG: 环境变量为空时没有继续尝试本地配置，直接返回了空值',
        '  return fromEnv',
        '}',
        'module.exports = { resolve }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { resolve } = require("./resolver")',
        'console.log(resolve("api_key"))',
      ]),
    },
    issue:
      'Bug 修复：resolve("api_key") 应按"环境变量 → 本地配置"回退链取值，环境变量为空时应回退到本地配置（"local-key"）。当前 env 为空时直接返回 undefined。修复 src/resolver.js，使程序输出 "local-key"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'local-key') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '回退链生效' }
    },
  },

  // ── 64. null-propagation ─────────────────────────────────────────────
  {
    id: '64-null-propagation',
    files: {
      'src/pipeline.js': [
        'function process(data) {',
        '  // BUG: 未检查 items 可能为空数组，空数组取 [0] 是 undefined 然后崩溃',
        '  const first = data.items[0]',
        '  return first.name.toUpperCase()',
        '}',
        'module.exports = { process }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { process } = require("./pipeline")',
        'console.log(process({ items: [] }))',
        'console.log(process({ items: [{ name: "ada" }] }))',
      ]),
    },
    issue:
      'Bug 修复：process({items:[]}) 崩溃（items[0] 是 undefined）。修复 src/pipeline.js：items 为空时返回 "EMPTY"，正常时返回首项 name 的大写。程序应输出两行："EMPTY" 和 "ADA"，不崩溃。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const lines = r.stdout.trim().split('\n')
      if (lines.length !== 2 || lines[0] !== 'EMPTY' || lines[1] !== 'ADA')
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '空输入优雅降级' }
    },
  },

  // ── 65. constant-drift ───────────────────────────────────────────────
  {
    id: '65-constant-drift',
    files: {
      'src/limits.js': ['module.exports = { MAX_ITEMS: 100 }', ''].join('\n'),
      'src/validation.js': [
        '// BUG: 自己硬编码了 50，与 limits.js 的 MAX_ITEMS=100 漂移',
        'function validateCount(n) { return n <= 50 }',
        'module.exports = { validateCount }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { validateCount } = require("./validation")',
        'console.log(validateCount(80))',
      ]),
    },
    issue:
      'Bug 修复：validateCount 的上限应来自 limits.js 的 MAX_ITEMS=100，但 validation.js 硬编码了 50。修复使其引用共享常量，程序输出 "true"（80 ≤ 100）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'true') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '与共享常量一致' }
    },
  },

  // ── 66. proxy-forward ────────────────────────────────────────────────
  {
    id: '66-proxy-forward',
    files: {
      'src/backend.js': [
        'function register(user) { return user.id + ":" + user.name }',
        'module.exports = { register }',
        '',
      ].join('\n'),
      'src/api.js': [
        'const { register } = require("./backend")',
        'function registerVia(user) {',
        '  // BUG: 只透传了 id，丢了 name',
        '  return register({ id: user.id })',
        '}',
        'module.exports = { registerVia }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { registerVia } = require("./api")',
        'console.log(registerVia({ id: 7, name: "Ada" }))',
      ]),
    },
    issue:
      'Bug 修复：registerVia 应完整透传用户字段，但只传了 id，name 丢失（输出 "7:undefined"）。修复 src/api.js 的透传，使程序输出 "7:Ada"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== '7:Ada') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '字段完整透传' }
    },
  },

  // ── 67. init-order ───────────────────────────────────────────────────
  {
    id: '67-init-order',
    files: {
      'src/app.js': [
        'const cfg = { load: () => ({ host: "localhost" }) }',
        'const db = { connect: (c) => "db-ok:" + c.host }',
        'function start() {',
        '  // BUG: 顺序反了——db 在 cfg 加载前就连接了',
        '  const dbStatus = db.connect(cfg)',
        '  const loaded = cfg.load()',
        '  return dbStatus + ":" + loaded.host',
        '}',
        'module.exports = { start }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { start } = require("./app")',
        'console.log(start())',
      ]),
    },
    issue:
      'Bug 修复：start() 中 db.connect 用了未加载的 cfg（load 还没调用，cfg 是空对象），输出 "db-ok:undefined:undefined"。调整初始化顺序：先 loadConfig 再 connect，使程序输出 "db-ok:localhost:localhost"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('db-ok:localhost:localhost'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '初始化顺序正确' }
    },
  },

  // ── 68. bidirectional-map ────────────────────────────────────────────
  {
    id: '68-bidirectional-map',
    files: {
      'src/bi.js': [
        'const fwd = new Map()',
        'const rev = new Map()',
        'function put(a, b) {',
        '  fwd.set(a, b)',
        '  // BUG: 忘了维护反向映射',
        '}',
        'function getByA(a) { return fwd.get(a) }',
        'function getByB(b) { return rev.get(b) }',
        'module.exports = { put, getByA, getByB }',
        '',
      ].join('\n'),
      ...MAIN([
        'const bi = require("./bi")',
        'bi.put("x", 1)',
        'console.log(bi.getByA("x"), bi.getByB(1))',
      ]),
    },
    issue:
      'Bug 修复：双向映射 put("x", 1) 后，getByB(1) 应返回 "x"。但 put 没有维护反向映射 rev，输出 "1 undefined"。修复 src/bi.js（put 中同步维护反向映射），使程序输出 "1 x"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== '1 x') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '双向映射一致' }
    },
  },

  // ── 69. metric-aggregation ───────────────────────────────────────────
  {
    id: '69-metric-aggregation',
    files: {
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
        '    // BUG: 把计数加到了总和上，而不是除以计数求平均',
        '    out[g] = sums[g] + counts[g]',
        '  }',
        '  return out',
        '}',
        'module.exports = { groupAvg }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { groupAvg } = require("./agg")',
        'const rows = [',
        '  { g: "a", v: 2 },',
        '  { g: "a", v: 4 },',
        '  { g: "b", v: 9 },',
        ']',
        'console.log(JSON.stringify(groupAvg(rows)))',
      ]),
    },
    issue:
      'Bug 修复：groupAvg 应返回各组平均值（a 组 (2+4)/2=3，b 组 9/1=9），当前却把计数加进了总和（输出 {"a":8,"b":10}）。修复 src/agg.js 的求平均逻辑，使输出 {"a":3,"b":9}。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = '{"a":3,"b":9}'
      if (!r.stdout.includes(want)) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '分组平均值正确' }
    },
  },

  // ── 70. legacy-compat ────────────────────────────────────────────────
  {
    id: '70-legacy-compat',
    files: {
      'src/legacy.js': [
        'function oldAdd(a, b, c) { return a + b + c }',
        'module.exports = { oldAdd }',
        '',
      ].join('\n'),
      'src/compat.js': [
        'const { oldAdd } = require("./legacy")',
        'function add(a, b) {',
        '  // BUG: 只传了两个参数给三参数的旧函数',
        '  return oldAdd(a, b)',
        '}',
        'module.exports = { add }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { add } = require("./compat")',
        'console.log(add(1, 2))',
      ]),
    },
    issue:
      'Bug 修复：新接口 add(a,b) 包装旧接口 oldAdd(a,b,c)，调用时没给第三个参数（undefined），输出 NaN。修复 src/compat.js 的兼容层，使程序输出 "3"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== '3') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '兼容层参数补齐' }
    },
  },

  // ── 71. sort-stability ───────────────────────────────────────────────
  {
    id: '71-sort-stability',
    files: {
      'src/ranker.js': [
        'function rankBy(users) {',
        '  // BUG: 分数相同时按 id 逆序排，违反了"同分保持原顺序"的契约',
        '  return [...users].sort((x, y) => y.score - x.score || y.id - x.id)',
        '}',
        'module.exports = { rankBy }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { rankBy } = require("./ranker")',
        'const users = [',
        '  { id: 1, score: 90 },',
        '  { id: 2, score: 90 },',
        '  { id: 3, score: 80 },',
        ']',
        'console.log(rankBy(users).map((u) => u.id).join(","))',
      ]),
    },
    issue:
      'Bug 修复：rankBy 的契约是同分保持原顺序（稳定排序）。当前比较器在同分时按 id 逆序排（90 分的两个用户顺序被颠倒：id 2 排到了 id 1 前面）。修复 src/ranker.js（去掉同分 tiebreak，保持稳定），使程序输出 "1,2,3"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== '1,2,3') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '同分保持原顺序' }
    },
  },

  // ── 72. path-normalize ───────────────────────────────────────────────
  {
    id: '72-path-normalize',
    files: {
      'src/safe.js': [
        'function cleanPath(p) {',
        '  // BUG: 只清理了开头一个 "../"，中间的 "../" 段没处理',
        '  return p.replace(/^\\.\\.\\//, "")',
        '}',
        'module.exports = { cleanPath }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { cleanPath } = require("./safe")',
        'console.log(cleanPath("../../etc/passwd"))',
      ]),
    },
    issue:
      'Bug 修复：cleanPath 应移除路径中所有前导 "../" 段（防目录穿越）。当前只删了一个。修复 src/safe.js，使程序输出 "etc/passwd"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'etc/passwd') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '前导 ../ 全部清理' }
    },
  },

  // ── 73. id-gen-race ──────────────────────────────────────────────────
  {
    id: '73-id-gen-race',
    files: {
      'src/ids.js': [
        'let seq = 0',
        'async function nextId() {',
        '  // BUG: 先读后改且中间有 await，两个并发调用读到同一个值',
        '  const current = seq',
        '  await Promise.resolve()',
        '  seq = current + 1',
        '  return current',
        '}',
        'module.exports = { nextId }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { nextId } = require("./ids")',
        'Promise.all([nextId(), nextId()]).then(([a, b]) => console.log(a + b))',
      ]),
    },
    issue:
      'Bug 修复：两个并发 nextId() 调用必须返回不同的值（[0,1]，和为 1）。当前异步竞态导致两者都读到 0（和为 0）。修复 src/ids.js（例如把"读-改-写"放在 await 之前同步完成），使程序输出 "1"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (r.stdout.trim() !== '1') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '并发 ID 不重复' }
    },
  },

  // ── 74. token-redact ─────────────────────────────────────────────────
  {
    id: '74-token-redact',
    files: {
      'src/log.js': [
        'function format(entry) {',
        '  // BUG: secret 字段未脱敏直接输出',
        '  return JSON.stringify(entry)',
        '}',
        'module.exports = { format }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { format } = require("./log")',
        'console.log(format({ user: "ada", secret: "sk-123" }))',
      ]),
    },
    issue:
      'Bug 修复：日志格式化必须对 secret 字段脱敏：输出中 secret 应显示为 "***"，绝不允许出现真实值 "sk-123"。修复 src/log.js，使输出包含 "***" 且不包含 "sk-123"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.includes('sk-123')) return { ok: false, detail: `密钥泄漏: ${r.stdout}` }
      if (!r.stdout.includes('***')) return { ok: false, detail: `未脱敏: ${r.stdout}` }
      return { ok: true, detail: 'secret 已脱敏' }
    },
  },

  // ── 75. feature-flag ─────────────────────────────────────────────────
  {
    id: '75-feature-flag',
    files: {
      'src/flags.js': [
        'const flags = { beta: false }',
        'function isEnabled(name) { return flags[name] }',
        'function setFlag(name, value) { flags[name] = value }',
        'module.exports = { isEnabled, setFlag }',
        '',
      ].join('\n'),
      'src/app.js': [
        '// BUG: 模块加载期就读了一次开关，之后 setFlag 不生效',
        'const { isEnabled } = require("./flags")',
        'const beta = isEnabled("beta")',
        'function run() { return beta ? "beta-on" : "beta-off" }',
        'module.exports = { run }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { setFlag } = require("./flags")',
        'const { run } = require("./app")',
        'setFlag("beta", true)',
        'console.log(run())',
      ]),
    },
    issue:
      'Bug 修复：app.js 在模块加载期就读取了 beta 开关（快照 false），之后 setFlag("beta", true) 不生效，输出 "beta-off"。修复 src/app.js：每次 run() 时读取最新开关值，使程序输出 "beta-on"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'beta-on') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '运行时读取最新开关' }
    },
  },

  // ── 76. percent-round ────────────────────────────────────────────────
  {
    id: '76-percent-round',
    files: {
      'src/math2.js': [
        'function percent(part, whole) {',
        '  // BUG: 向下取整，应四舍五入',
        '  return Math.floor((part / whole) * 100)',
        '}',
        'module.exports = { percent }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { percent } = require("./math2")',
        'console.log(percent(2, 3))',
      ]),
    },
    issue:
      'Bug 修复：percent(2, 3) 应四舍五入为 67，当前向下取整输出 66。修复 src/math2.js 的舍入方式，使程序输出 "67"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== '67') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '四舍五入正确' }
    },
  },

  // ── 77. batch-tail ───────────────────────────────────────────────────
  {
    id: '77-batch-tail',
    files: {
      'src/batcher.js': [
        'function submit(items, batchSize) {',
        '  const batches = []',
        '  // BUG: 余数批次（最后不满一批的）被丢弃',
        '  for (let i = 0; i + batchSize <= items.length; i += batchSize) {',
        '    batches.push(items.slice(i, i + batchSize))',
        '  }',
        '  return batches',
        '}',
        'module.exports = { submit }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { submit } = require("./batcher")',
        'console.log(JSON.stringify(submit([1, 2, 3, 4, 5, 6, 7], 3)))',
      ]),
    },
    issue:
      'Bug 修复：submit([1..7], 3) 应返回 [[1,2,3],[4,5,6],[7]]（余数也要成批），当前最后一个元素 7 被丢弃。修复 src/batcher.js 的循环边界，使输出包含 [7]。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      const want = '[[1,2,3],[4,5,6],[7]]'
      if (!r.stdout.includes(want)) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '余数批次保留' }
    },
  },

  // ── 78. singleton-bypass ─────────────────────────────────────────────
  {
    id: '78-singleton-bypass',
    files: {
      'src/dbconn.js': [
        'let created = 0',
        'function getInstance() {',
        '  // BUG: 没有复用已创建的实例，每次都新建',
        '  created++',
        '  return { created }',
        '}',
        'module.exports = { getInstance }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { getInstance } = require("./dbconn")',
        'const a = getInstance()',
        'const b = getInstance()',
        'console.log(a === b)',
      ]),
    },
    issue:
      'Bug 修复：getInstance() 必须是单例——多次调用应返回同一个实例。当前每次都新建。修复 src/dbconn.js（缓存实例，首次创建后复用），使程序输出 "true"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'true') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '单例复用' }
    },
  },

  // ── 79. tdd-multi ────────────────────────────────────────────────────
  {
    id: '79-tdd-multi',
    files: {
      'src/str.js': [
        'function toUpper(s) {',
        '  // BUG: 只大写第一个字符',
        '  return s.charAt(0).toUpperCase() + s.slice(1)',
        '}',
        'module.exports = { toUpper }',
        '',
      ].join('\n'),
      'src/num.js': [
        'function clamp(v, min, max) {',
        '  // BUG: 边界方向写反',
        '  if (v < max) return max',
        '  if (v > min) return min',
        '  return v',
        '}',
        'module.exports = { clamp }',
        '',
      ].join('\n'),
      'src/list.js': [
        'function dedupe(arr) {',
        '  // BUG: 用 Set 却把原数组返回了',
        '  return arr',
        '}',
        'module.exports = { dedupe }',
        '',
      ].join('\n'),
      'tests/run-tests.js': [
        'const assert = require("assert")',
        'const { toUpper } = require("../src/str")',
        'const { clamp } = require("../src/num")',
        'const { dedupe } = require("../src/list")',
        'assert.strictEqual(toUpper("hello world"), "HELLO WORLD")',
        'assert.strictEqual(clamp(5, 0, 10), 5)',
        'assert.strictEqual(clamp(-1, 0, 10), 0)',
        'assert.strictEqual(clamp(99, 0, 10), 10)',
        'assert.deepStrictEqual(dedupe([1, 2, 2, 3]), [1, 2, 3])',
        'console.log("ALL TESTS PASSED")',
        '',
      ].join('\n'),
    },
    issue:
      'Bug 修复：tests/run-tests.js 有 5 个断言，分布在 3 个模块（str.js 的 toUpper、num.js 的 clamp、list.js 的 dedupe）。运行 node tests/run-tests.js 定位全部失败并修复三个文件，使测试全绿输出 "ALL TESTS PASSED"。',
    verify(dir) {
      const r = run(dir, 'tests/run-tests.js')
      if (r.status !== 0) return { ok: false, detail: `测试退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('ALL TESTS PASSED')) return { ok: false, detail: r.stdout }
      return { ok: true, detail: '跨 3 模块 5 断言全绿' }
    },
  },

  // ── 80. validate-order (nested) ──────────────────────────────────────
  {
    id: '80-validate-order',
    files: {
      'src/validate.js': [
        '// Spec: validateOrder(o) 返回错误数组（无错返回 []），按字段顺序检查：',
        '//   o.customer 缺失或非对象 → "customer required"',
        '//   customer.name 非字符串 → "customer name required"',
        '//   customer.email 非字符串或不含 "@" → "customer email invalid"',
        '//   o.items 缺失或非数组或为空 → "items required"',
        '//   items 中存在 qty 非正整数 → "item qty invalid"',
        'function validateOrder(o) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { validateOrder }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { validateOrder } = require("./validate")',
        'console.log(JSON.stringify(validateOrder({})))',
        'console.log(JSON.stringify(validateOrder({ customer: { name: 1, email: "bad" }, items: [] })))',
        'console.log(JSON.stringify(validateOrder({ customer: { name: "ada", email: "a@x.com" }, items: [{ qty: 0 }] })))',
        'console.log(JSON.stringify(validateOrder({ customer: { name: "ada", email: "a@x.com" }, items: [{ qty: 2 }] })))',
      ]),
    },
    issue:
      '实现任务：src/validate.js 的 validateOrder 抛 "not implemented"。按 Spec 实现嵌套校验，使程序输出四行：["customer required","items required"]、["customer name required","customer email invalid","items required"]、["item qty invalid"]、[]。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = [
        '["customer required","items required"]',
        '["customer name required","customer email invalid","items required"]',
        '["item qty invalid"]',
        '[]',
      ]
      for (const w of want) {
        if (!r.stdout.includes(w)) return { ok: false, detail: `缺少 ${w}: ${r.stdout}` }
      }
      return { ok: true, detail: '嵌套校验 4 用例正确' }
    },
  },

  // ── 81. lru-cache ────────────────────────────────────────────────────
  {
    id: '81-lru-cache',
    files: {
      'src/lru.js': [
        '// Spec: LRUCache(capacity)：',
        '//   get(key) 命中返回并标记为最近使用；未命中返回 undefined；',
        '//   set(key, v) 插入；若键已存在则更新并标记最近使用；',
        '//   超出容量时驱逐最久未使用的键。',
        'class LRUCache {',
        '  constructor(capacity) { throw new Error("not implemented") }',
        '}',
        'module.exports = { LRUCache }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { LRUCache } = require("./lru")',
        'const c = new LRUCache(2)',
        'c.set("a", 1)',
        'c.set("b", 2)',
        'c.get("a")',
        'c.set("c", 3)',
        'console.log(c.get("a"), c.get("b"), c.get("c"))',
      ]),
    },
    issue:
      '实现任务：src/lru.js 的 LRUCache 抛 "not implemented"。按 Spec 实现 LRU 缓存（容量 2）：set a、set b、get a（a 变最近使用）、set c 时应驱逐最久未用的 b。程序输出 "1 undefined 3"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('1 undefined 3')) return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: 'LRU 驱逐正确' }
    },
  },

  // ── 82. round-robin ──────────────────────────────────────────────────
  {
    id: '82-round-robin',
    files: {
      'src/lb.js': [
        'let next = 0',
        'function pick(servers) {',
        '  // BUG: 轮转从第二个服务器开始，第一个永远轮不到',
        '  next = (next + 1) % servers.length',
        '  return servers[next]',
        '}',
        'module.exports = { pick }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { pick } = require("./lb")',
        'const servers = ["s1", "s2", "s3"]',
        'console.log(pick(servers), pick(servers), pick(servers))',
      ]),
    },
    issue:
      'Bug 修复：负载均衡轮转应从第一个服务器开始依次选择（s1、s2、s3），当前从 s2 开始，s1 永远轮不到。修复 src/lb.js 的轮转逻辑，使程序输出 "s1 s2 s3"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 's1 s2 s3') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '轮转覆盖全部节点' }
    },
  },

  // ── 83. dir-sync ─────────────────────────────────────────────────────
  {
    id: '83-dir-sync',
    files: {
      'src/syncer.js': [
        '// Spec: syncDirs(srcDir, dstDir)：把 srcDir 下的所有文件复制到 dstDir，',
        '// 保持子目录结构；先创建目录再写文件；返回复制的文件数。',
        '// 可用 node:fs 的 readdirSync / statSync / mkdirSync / copyFileSync。',
        'function syncDirs(srcDir, dstDir) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { syncDirs }',
        '',
      ].join('\n'),
      'src/seed/a.txt': ['hello-a', ''].join('\n'),
      'src/seed/sub/b.txt': ['hello-b', ''].join('\n'),
      ...MAIN([
        'const { syncDirs } = require("./syncer")',
        'const fs = require("fs")',
        'const count = syncDirs("src/seed", "out")',
        'console.log("copied=" + count)',
        'console.log(fs.existsSync("out/a.txt"), fs.existsSync("out/sub/b.txt"))',
      ]),
    },
    issue:
      '实现任务：src/syncer.js 的 syncDirs 抛 "not implemented"。按 Spec 递归复制目录树（src/seed → out），使程序输出 "copied=2" 和 "true true"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('copied=2') || !r.stdout.includes('true true'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      const b = read(dir, 'out/sub/b.txt')
      if (b === null || !b.includes('hello-b')) return { ok: false, detail: 'out/sub/b.txt 内容不符' }
      return { ok: true, detail: '目录树复制完整' }
    },
  },

  // ── 84. api-v2-migration ─────────────────────────────────────────────
  {
    id: '84-api-v2-migration',
    files: {
      'src/lib.js': [
        'function connect(cfg) {',
        '  return "conn:" + cfg.host + ":" + cfg.port',
        '}',
        'module.exports = { connect }',
        '',
      ].join('\n'),
      'src/a.js': [
        'const { connect } = require("./lib")',
        '// BUG: 旧签名 connect(host, port)',
        'console.log("a:", connect("localhost", 5432))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { connect } = require("./lib")',
        '// BUG: 旧签名 connect(host, port)',
        'console.log("b:", connect("localhost", 3306))',
        '',
      ].join('\n'),
      ...MAIN([
        'const { connect } = require("./lib")',
        '// BUG: 旧签名 connect(host, port)',
        'console.log("main:", connect("localhost", 27017))',
      ]),
    },
    issue:
      '迁移任务：lib.js 的 connect 已升级为新签名 connect(cfg)（cfg 是 {host, port} 对象）。src/a.js、src/b.js、src/main.js 三处仍用旧签名 connect(host, port)。更新全部调用方为新签名，使程序输出 "a: conn:localhost:5432"、"b: conn:localhost:3306"、"main: conn:localhost:27017"。',
    verify(dir) {
      for (const [f, want] of [
        ['src/a.js', 'a: conn:localhost:5432'],
        ['src/b.js', 'b: conn:localhost:3306'],
        ['src/main.js', 'main: conn:localhost:27017'],
      ]) {
        const r = run(dir, f)
        if (r.status !== 0) return { ok: false, detail: `${f} 退出码 ${r.status}: ${r.stderr}` }
        if (!r.stdout.includes(want)) return { ok: false, detail: `${f} 输出 ${r.stdout}` }
      }
      return { ok: true, detail: '3 处调用方全部迁移' }
    },
  },

  // ── 85. null-guard-multi ─────────────────────────────────────────────
  {
    id: '85-null-guard-multi',
    files: {
      'src/order.js': [
        'function total(order) {',
        '  return order.items.reduce((s, i) => s + i.price, 0)',
        '}',
        'function count(order) { return order.items.length }',
        'function desc(order) { return order.items.map((i) => i.name).join(",") }',
        'module.exports = { total, count, desc }',
        '',
      ].join('\n'),
      ...MAIN([
        'const o = require("./order")',
        'console.log(o.total(null))',
        'console.log(o.count({ items: [] }))',
        'console.log(o.desc({ items: [{ name: "x" }] }))',
      ]),
    },
    issue:
      'Bug 修复：src/order.js 的 3 个函数对空输入不防御：total(null) 直接崩溃。修复：order 为 null 或 items 为空时 total 返回 0、count 返回 0、desc 返回 ""；正常数据不受影响。程序应输出三行："0"、"0"、"x"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const lines = r.stdout.trim().split('\n')
      if (lines.length !== 3 || lines[0] !== '0' || lines[1] !== '0' || lines[2] !== 'x')
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '3 个入口空输入防御' }
    },
  },

  // ── 86. decode-multi ─────────────────────────────────────────────────
  {
    id: '86-decode-multi',
    files: {
      'src/decoder.js': [
        'function decode(s) {',
        '  // BUG: 数据被编码了两次，这里只解了一次',
        '  return decodeURIComponent(s)',
        '}',
        'module.exports = { decode }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { decode } = require("./decoder")',
        'console.log(decode("a%2520b"))',
      ]),
    },
    issue:
      'Bug 修复：decode 收到的数据是双重编码的（"a%2520b"）。需要解码两次才能得到原文 "a b"，当前只解了一次输出 "a%20b"。修复 src/decoder.js，使程序输出 "a b"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'a b') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '双重编码正确还原' }
    },
  },

  // ── 87. schema-migration ─────────────────────────────────────────────
  {
    id: '87-schema-migration',
    files: {
      'src/migrate.js': [
        'function migrate(data) {',
        '  // BUG: 只复制了顶层字段，contact.email 没有提升',
        '  return data.users.map((u) => ({ id: u.id, name: u.name }))',
        '}',
        'module.exports = { migrate }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { migrate } = require("./migrate")',
        'const old = { users: [{ id: 1, name: "Ada", contact: { email: "a@x.com", phone: "123" } }] }',
        'console.log(JSON.stringify(migrate(old)))',
      ]),
    },
    issue:
      '迁移任务：数据 schema 变更——旧格式 email 嵌在 contact.email，新格式要求提升为顶层 email 字段（contact 保留 phone、删除 email）。修复 src/migrate.js，使输出为 [{"id":1,"name":"Ada","email":"a@x.com","contact":{"phone":"123"}}]。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const want = '{"id":1,"name":"Ada","email":"a@x.com","contact":{"phone":"123"}}'
      if (!r.stdout.includes(want)) return { ok: false, detail: `输出不对: ${r.stdout}` }
      if (r.stdout.includes('"contact":{"email"')) return { ok: false, detail: 'contact.email 未移除' }
      return { ok: true, detail: 'email 提升且 contact 精简' }
    },
  },

  // ── 88. threshold-chain ──────────────────────────────────────────────
  {
    id: '88-threshold-chain',
    files: {
      'src/grade.js': [
        'function grade(score) {',
        '  // BUG: 第一个判断用 <= 把所有人都判成 A',
        '  if (score <= 90) return "A"',
        '  if (score >= 80) return "B"',
        '  if (score >= 70) return "C"',
        '  return "D"',
        '}',
        'module.exports = { grade }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { grade } = require("./grade")',
        'console.log([95, 85, 75, 65].map(grade).join(" "))',
      ]),
    },
    issue:
      'Bug 修复：grade 的分段应为 ≥90 得 A、≥80 得 B、≥70 得 C、其余 D。当前第一个判断方向错（<= 90），全部返回 A。修复 src/grade.js，使程序输出 "A B C D"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'A B C D') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '四档阈值正确' }
    },
  },

  // ── 89. deep-equal ───────────────────────────────────────────────────
  {
    id: '89-deep-equal',
    files: {
      'src/deep.js': [
        '// Spec: deepEqual(a, b)：',
        '//   对象递归比较键值（键顺序无关）；数组按顺序逐元素比较；',
        '//   基本类型用 ===（NaN 视为等于 NaN）；null/undefined 分别处理。',
        'function deepEqual(a, b) {',
        '  throw new Error("not implemented")',
        '}',
        'module.exports = { deepEqual }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { deepEqual } = require("./deep")',
        'console.log(deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }))',
        'console.log(deepEqual([1, [2, 3]], [1, [2, 3]]))',
        'console.log(deepEqual({ a: 1 }, { a: 1, b: 2 }))',
        'console.log(deepEqual(NaN, NaN))',
        'console.log(deepEqual({ a: null }, { a: undefined }))',
      ]),
    },
    issue:
      '实现任务：src/deep.js 的 deepEqual 抛 "not implemented"。按 Spec 实现深度相等比较，使程序输出五行："true"、"true"、"false"、"true"、"false"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      const lines = r.stdout.trim().split('\n')
      const want = ['true', 'true', 'false', 'true', 'false']
      if (lines.length !== 5 || lines.some((l, i) => l.trim() !== want[i]))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '深度比较 5 用例正确' }
    },
  },

  // ── 90. escape-html ──────────────────────────────────────────────────
  {
    id: '90-escape-html',
    files: {
      'src/esc.js': [
        'function escapeHtml(s) {',
        '  // BUG: 只转义了 & < >，漏了引号',
        '  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")',
        '}',
        'module.exports = { escapeHtml }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { escapeHtml } = require("./esc")',
        'console.log(escapeHtml(\'<a href="x" onclick=\' + String.fromCharCode(39) + \'y\' + String.fromCharCode(39) + \'>\'))',
      ]),
    },
    issue:
      'Bug 修复：escapeHtml 必须转义全部 5 个 HTML 特殊字符（& < > " \'），当前漏了引号（属性注入风险）。修复 src/esc.js，使输出包含 "&quot;" 和 "&#39;"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (!r.stdout.includes('&quot;') || !r.stdout.includes('&#39;'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '5 个字符全部转义' }
    },
  },

  // ── 91. chain-call ───────────────────────────────────────────────────
  {
    id: '91-chain-call',
    files: {
      'src/calc.js': [
        'class Calc {',
        '  constructor() { this.value = 0 }',
        '  add(n) { this.value += n; return this }',
        '  mult(n) { this.value *= n; return this }',
        '}',
        'module.exports = { Calc }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { Calc } = require("./calc")',
        'const c = new Calc()',
        'console.log(c.add(2).mult(3).value)',
        '// BUG: 错误复用了上一个实例，第二段计算被污染',
        'console.log(c.add(5).value)',
      ]),
    },
    issue:
      'Bug 修复：两段独立的计算共用了同一个 Calc 实例，第二段结果被第一段污染（期望 5，实际 11）。修复 src/main.js：每段计算应使用新的实例，使程序输出两行："6" 和 "5"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      const lines = r.stdout.trim().split('\n')
      if (lines.length !== 2 || lines[0] !== '6' || lines[1] !== '5')
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '实例隔离' }
    },
  },

  // ── 92. duplicate-keys ───────────────────────────────────────────────
  {
    id: '92-duplicate-keys',
    files: {
      'src/merge2.js': [
        'function mergeUsers(list) {',
        '  const out = {}',
        '  for (const u of list) {',
        '    // BUG: 整体替换，同 id 的后一条记录把前一条的字段全丢了',
        '    out[u.id] = u',
        '  }',
        '  return Object.values(out)',
        '}',
        'module.exports = { mergeUsers }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { mergeUsers } = require("./merge2")',
        'const out = mergeUsers([',
        '  { id: 1, name: "Ada", age: 36 },',
        '  { id: 1, age: 37 },',
        '])',
        'console.log(JSON.stringify(out))',
      ]),
    },
    issue:
      'Bug 修复：mergeUsers 对同 id 的记录应合并字段（后到的覆盖先到的同名字段，但保留先到的独有字段）：期望 [{id:1,name:"Ada",age:37}]。当前整体替换导致 name 丢失。修复 src/merge2.js，使输出含 "name":"Ada" 且 "age":37。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('"name":"Ada"') || !r.stdout.includes('"age":37'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '同 id 字段合并' }
    },
  },

  // ── 93. offset-rewrite ───────────────────────────────────────────────
  {
    id: '93-offset-rewrite',
    files: {
      'src/editor.js': [
        'function replaceLine(text, lineNo, newLine) {',
        '  // BUG: lineNo 约定是 1 起的行号，但这里直接当 0 起索引用',
        '  const lines = text.split("\\n")',
        '  lines[lineNo] = newLine',
        '  return lines.join("\\n")',
        '}',
        'module.exports = { replaceLine }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { replaceLine } = require("./editor")',
        'console.log(replaceLine("a\\nb\\nc", 2, "X"))',
      ]),
    },
    issue:
      'Bug 修复：replaceLine(text, 2, "X") 的 lineNo=2 表示第 2 行（1 起），应把 "b" 改为 "X" 输出 "a\\nX\\nc"。当前按 0 起索引改成了第 3 行（"c"）。修复 src/editor.js 的偏移，使程序输出 a、X、c 三行。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'a\nX\nc') return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '1 起行号正确' }
    },
  },

  // ── 94. dry-run-deep ─────────────────────────────────────────────────
  {
    id: '94-dry-run-deep',
    files: {
      'src/planner.js': [
        'const applied = []',
        'function apply(plan, dryRun) {',
        '  for (const step of plan.steps) {',
        '    // BUG: 只把结果收集放进返回数组的条件判断了，step 的副作用无条件执行',
        '    if (!dryRun) applied.push(step.id)',
        '    step.execute()',
        '  }',
        '  return applied',
        '}',
        'module.exports = { apply, applied }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { apply, applied } = require("./planner")',
        'const plan = { steps: [{ id: "s1", execute: () => applied.push("EXEC:" + "s1") }] }',
        'apply(plan, true)',
        'console.log(applied.join(","))',
      ]),
    },
    issue:
      'Bug 修复：apply(plan, dryRun=true) 是预演模式，任何副作用都不应执行（含 step.execute）。当前 push 被条件保护但 execute 照样执行，applied 被污染。修复 src/planner.js，使程序输出空字符串（什么都不执行）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== '') return { ok: false, detail: `副作用泄漏: ${r.stdout}` }
      return { ok: true, detail: 'dryRun 下零副作用' }
    },
  },

  // ── 95. expiry-cache ─────────────────────────────────────────────────
  {
    id: '95-expiry-cache',
    files: {
      'src/tcache.js': [
        '// Spec: TimedCache(ttlMs, now)：',
        '//   set(key, v) 存储并记录当前时间；',
        '//   get(key) 未过期（now - 存入时间 < ttlMs）返回 v，否则返回 undefined。',
        '// now 是注入的时间函数，用于确定性验证。',
        'class TimedCache {',
        '  constructor(ttlMs, now) { throw new Error("not implemented") }',
        '}',
        'module.exports = { TimedCache }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { TimedCache } = require("./tcache")',
        'let t = 0',
        'const now = () => t',
        'const c = new TimedCache(100, now)',
        'c.set("k", "v1")',
        't = 99',
        'console.log("near:", c.get("k"))',
        't = 100',
        'console.log("expired:", c.get("k"))',
      ]),
    },
    issue:
      '实现任务：src/tcache.js 的 TimedCache 抛 "not implemented"。按 Spec 实现带过期时间的缓存（时间注入），使程序输出 "near: v1" 和 "expired: undefined"（t=100 时恰好达到 ttl 应视为过期）。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}: ${r.stderr}` }
      if (!r.stdout.includes('near: v1') || !r.stdout.includes('expired: undefined'))
        return { ok: false, detail: `输出不对: ${r.stdout}` }
      return { ok: true, detail: '过期边界正确' }
    },
  },

  // ── 96. escape-regex ─────────────────────────────────────────────────
  {
    id: '96-escape-regex',
    files: {
      'src/matcher.js': [
        'function hasMatch(pattern, text) {',
        '  // BUG: 直接把用户输入当正则，"." 等特殊字符变成通配',
        '  return new RegExp(pattern).test(text)',
        '}',
        'module.exports = { hasMatch }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { hasMatch } = require("./matcher")',
        'console.log(hasMatch("a.b", "axb"))',
      ]),
    },
    issue:
      'Bug 修复：hasMatch 的 pattern 是字面字符串，"." 应按字面匹配。当前把用户输入直接当作正则（"." 变成任意字符通配），hasMatch("a.b", "axb") 错误返回 true。修复 src/matcher.js（转义正则特殊字符），使程序输出 "false"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'false') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '字面匹配' }
    },
  },

  // ── 97. config-freeze ────────────────────────────────────────────────
  {
    id: '97-config-freeze',
    files: {
      'src/settings.js': [
        'const settings = { theme: "dark", lang: "en" }',
        'function get() {',
        '  // BUG: 返回内部引用，外部可直接篡改',
        '  return settings',
        '}',
        'module.exports = { get }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { get } = require("./settings")',
        'const s = get()',
        's.theme = "light"',
        'console.log(get().theme)',
      ]),
    },
    issue:
      'Bug 修复：get() 返回的是内部对象引用，外部修改 s.theme 后内部配置被污染。修复 src/settings.js：get 返回副本（或冻结对象），使程序输出 "dark"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== 'dark') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '配置只读' }
    },
  },

  // ── 98. dedupe-sort ──────────────────────────────────────────────────
  {
    id: '98-dedupe-sort',
    files: {
      'src/dd.js': [
        'function dedupeSorted(arr) {',
        '  // BUG: 用 Set 去重但没排序，输入乱序时输出乱序',
        '  return [...new Set(arr)]',
        '}',
        'module.exports = { dedupeSorted }',
        '',
      ].join('\n'),
      ...MAIN([
        'const { dedupeSorted } = require("./dd")',
        'console.log(dedupeSorted([3, 1, 3, 2, 1]).join(","))',
      ]),
    },
    issue:
      'Bug 修复：dedupeSorted 的契约是"去重且升序"。当前只去重未排序，输出 "3,1,2"。修复 src/dd.js，使程序输出 "1,2,3"。',
    verify(dir) {
      const r = run(dir, 'src/main.js')
      if (r.status !== 0) return { ok: false, detail: `main 退出码 ${r.status}` }
      if (r.stdout.trim() !== '1,2,3') return { ok: false, detail: `输出不对: ${r.stdout.trim()}` }
      return { ok: true, detail: '去重且升序' }
    },
  },

  // ── 99. counter-shared ───────────────────────────────────────────────
  {
    id: '99-counter-shared',
    files: {
      'src/registry.js': [
        'const fs = require("fs")',
        'const path = require("path")',
        'const FILE = path.join(__dirname, ".seq.json")',
        'function register() {',
        '  // BUG: 序列号持久化到磁盘文件，不同进程（a.js、b.js）共享同一序列',
        '  const cur = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : 0',
        '  const next = cur + 1',
        '  fs.writeFileSync(FILE, JSON.stringify(next))',
        '  return next',
        '}',
        'module.exports = { register }',
        '',
      ].join('\n'),
      'src/a.js': [
        'const { register } = require("./registry")',
        'console.log("a:", register())',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { register } = require("./registry")',
        'console.log("b:", register())',
        '',
      ].join('\n'),
    },
    issue:
      'Bug 修复：register() 的契约是"每次调用独立编号，从 1 开始"。但当前实现把序列号持久化到了磁盘文件，不同进程共享同一序列：先跑 a.js 得 1，再跑 b.js 得 2。修复 src/registry.js（改为进程内内存计数，不落盘），使 a.js 和 b.js 各自输出 "a: 1" 和 "b: 1"。',
    verify(dir) {
      for (const [f, want] of [['src/a.js', 'a: 1'], ['src/b.js', 'b: 1']]) {
        const r = run(dir, f)
        if (r.status !== 0) return { ok: false, detail: `${f} 退出码 ${r.status}` }
        if (!r.stdout.includes(want)) return { ok: false, detail: `${f} 输出 ${r.stdout}` }
      }
      return { ok: true, detail: '两文件各自从 1 开始' }
    },
  },

  // ── 100. multi-refactor-bug ──────────────────────────────────────────
  {
    id: '100-multi-refactor-bug',
    files: {
      'src/util.js': [
        'function formatName(name) {',
        '  // BUG: 忘了 trim，首尾空格泄漏',
        '  return name.toUpperCase()',
        '}',
        'function formatPrice(n) {',
        '  // BUG: 金额少两位小数（丢精度）',
        '  return "$" + n',
        '}',
        'function formatDate(d) {',
        '  return d.toISOString().slice(0, 10)',
        '}',
        'module.exports = { formatName, formatPrice, formatDate }',
        '',
      ].join('\n'),
      'src/a.js': [
        'const { formatName } = require("./util")',
        'console.log("a:", formatName("  Ada  "))',
        '',
      ].join('\n'),
      'src/b.js': [
        'const { formatPrice } = require("./util")',
        'console.log("b:", formatPrice(12.5))',
        '',
      ].join('\n'),
      'src/c.js': [
        'const { formatDate } = require("./util")',
        'console.log("c:", formatDate(new Date("2026-07-08T00:00:00Z")))',
        '',
      ].join('\n'),
    },
    issue:
      'Bug 修复：src/util.js 有两个 bug：formatName 输出首尾带空格（应 "ADA"）、formatPrice 输出 "$12.5" 缺少两位小数（应 "$12.50"）。formatDate 正常。修复两个 bug，程序输出三行："a: ADA"、"b: $12.50"、"c: 2026-07-08"。',
    verify(dir) {
      for (const [f, want] of [
        ['src/a.js', 'a: ADA'],
        ['src/b.js', 'b: $12.50'],
        ['src/c.js', 'c: 2026-07-08'],
      ]) {
        const r = run(dir, f)
        if (r.status !== 0) return { ok: false, detail: `${f} 退出码 ${r.status}: ${r.stderr}` }
        if (!r.stdout.includes(want)) return { ok: false, detail: `${f} 输出 ${r.stdout}` }
      }
      return { ok: true, detail: '两个 bug 修复、正常函数不受影响' }
    },
  },
]

export const BENCH_TASKS = TASKS
