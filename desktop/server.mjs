import {readFileSync} from 'node:fs';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {z} from 'zod';
import {fileURLToPath} from 'node:url';
import {createDshMcpServer} from '../dist/server.js';
import {DesktopBridge} from './bridge.mjs';
const bridge=new DesktopBridge(fileURLToPath(new URL('./runtime/desktop-connection.json',import.meta.url)));
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const server=createDshMcpServer({version});
const id={session_id:z.string().min(1)};
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
function tool(name,description,schema,fn){server.registerTool(name,{description,inputSchema:z.object(schema)},async args=>{try{return result(await fn(args));}catch(error){return {content:[{type:'text',text:error.code==='ENOENT'?'DSH desktop connection unavailable. Start or restart DSH desktop with the local bridge plugin.':error.message}],isError:true};}});}
tool('dsh_desktop_start','Create a visible task in the running local DSH desktop. Native desktop permissions and model apply. Return a session ID and admission receipt; use dsh_desktop_wait to verify completion.',{cwd:z.string(),title:z.string(),task:z.string().optional()},args=>bridge.start(args));
tool('dsh_desktop_send','Continue the exact DSH desktop session, preserving context. Queue by default; steer inserts into an active turn. A receipt is not completion.',{...id,task:z.string().min(1),mode:z.enum(['queue','steer']).default('queue')},args=>bridge.send(args.session_id,args.task,args.mode));
tool('dsh_desktop_status','Observe a native desktop session: live text, recent event types, running state and final answer.',id,args=>bridge.status(args.session_id));
tool('dsh_desktop_wait','Wait up to 60 seconds for a turn/end newer than the send receipt after_seq. Timeout means still pending; never resend automatically.',{...id,after_seq:z.number().int(),request_id:z.string().min(1),seconds:z.number().int().min(1).max(60).default(30)},args=>bridge.wait(args.session_id,args.after_seq,args.seconds,args.request_id));
tool('dsh_desktop_interrupt','Cancel the specified desktop session; does not delete its history.',id,args=>bridge.rpc('session/cancel',{request:{sessionId:args.session_id}}));
serveStdio(()=>server);
process.on('exit',()=>bridge.close());



