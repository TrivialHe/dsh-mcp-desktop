import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
const server = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], { cwd: fileURLToPath(new URL('.', import.meta.url)), windowsHide: true, stdio: ['pipe','pipe','pipe'] });
let nextId = 1;
const pending = new Map();
createInterface({ input: server.stdout }).on('line', line => {
  try { const msg = JSON.parse(line); if (pending.has(msg.id)) { const { resolve, reject, timer } = pending.get(msg.id); clearTimeout(timer); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); } } catch {}
});
server.stderr.on('data', data => process.stderr.write(data));
server.on('exit', code => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Server exited: ' + code)); } pending.clear(); });
function request(method, params, timeout = 240000) {
  const id = nextId++;
  return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP request timeout')); }, timeout); pending.set(id, {resolve, reject, timer}); server.stdin.write(JSON.stringify({jsonrpc:'2.0', id, method, params}) + '\n'); });
}
try {
  console.log('INITIALIZE', JSON.stringify(await request('initialize', {protocolVersion:'2025-11-25', capabilities:{}, clientInfo:{name:'codex-install-check',version:'1.0.0'}})));
  server.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  console.log('TOOLS', (await request('tools/list', {})).tools.map(t => t.name).join(', '));
  console.log('STATUS', JSON.stringify(await request('tools/call', {name:'dsh_status',arguments:{}})));
  const call=async(name,args)=>{const r=await request('tools/call',{name,arguments:args});if(r.isError)throw new Error(r.content[0].text);return JSON.parse(r.content[0].text);};
  const a=await call('dsh_desktop_start',{cwd:process.cwd(),title:'Codex MCP 桌面工具验收',task:'这只是连接测试。禁止使用任何工具、读写文件或执行命令。请记住数字 8426，仅回复：桌面MCP连接成功。'});
  console.log('START',JSON.stringify(a));
  const first=await call('dsh_desktop_wait',{session_id:a.session_id,after_seq:a.after_seq,request_id:a.request_id,seconds:30});
  console.log('FIRST',JSON.stringify(first));
  if(first.wait_outcome!=='completed'||!first.answer.includes('连接成功'))throw new Error('First turn did not pass');
  const receipt=await call('dsh_desktop_send',{session_id:a.session_id,task:'禁止使用工具。上一轮要求记住的数字是什么？只回复数字。'});
  const second=await call('dsh_desktop_wait',{session_id:a.session_id,after_seq:receipt.after_seq,request_id:receipt.request_id,seconds:30});
  console.log('SECOND',JSON.stringify(second));
  if(second.wait_outcome!=='completed'||!second.answer.includes('8426'))throw new Error('Same-session context did not pass');
  const {writeFileSync}=await import('node:fs');writeFileSync(new URL('./runtime/smoke-session.json',import.meta.url),JSON.stringify({session_id:a.session_id}));
  console.log('PASS: MCP desktop creation, streaming and same-session followup.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { server.stdin.end(); server.kill(); }
