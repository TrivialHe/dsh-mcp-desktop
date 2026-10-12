import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DesktopBridge} from './bridge.mjs';
function fixture(){const b=new DesktopBridge('unused');const s={id:'session-test',client:{close(){}},events:[],answer:'',partial_text:'',last_seq:-1,finish_reason:null,disconnected:false,turn_requests:new Set(),completed_requests:new Set()};b.sessions.set(s.id,s);b.rpc=async()=>({items:[{sessionId:s.id,running:false}]});return {b,s};}
test('queued request does not complete when an earlier turn ends',async()=>{const {b,s}=fixture();b.event(s,{type:'turn/start',seq:1,data:{}});b.event(s,{type:'user/message',seq:2,data:{source:{rpcId:'older'}}});b.event(s,{type:'turn/end',seq:3,data:{reason:{kind:'completed'}}});assert.equal((await b.wait(s.id,0,0,'queued')).wait_outcome,'timeout');b.event(s,{type:'turn/start',seq:4,data:{}});b.event(s,{type:'user/message',seq:5,data:{source:{rpcId:'queued'}}});b.event(s,{type:'assistant/message',seq:6,data:{message:{content:[{type:'text',text:'verified'}]}}});b.event(s,{type:'turn/end',seq:7,data:{reason:{kind:'completed'}}});const r=await b.wait(s.id,0,1,'queued');assert.equal(r.wait_outcome,'completed');assert.equal(r.answer,'verified');});
test('disconnection fails without automatically resending',async()=>{const {b,s}=fixture();let sends=0;b.rpc=async()=>{sends++;};b.observe=async()=>s;s.disconnected=true;await assert.rejects(b.wait(s.id,0,1,'x'),/without resending/);assert.equal(sends,0);});
test('remote credential origins are rejected',()=>{const dir=mkdtempSync(join(tmpdir(),'dsh-bridge-test-'));try {const path=join(dir,'connection.json');writeFileSync(path,JSON.stringify({origin:'https://example.com',cookie:'test-only'}));const b=new DesktopBridge(path);assert.throws(()=>b.credentials(),/Only the local/);}finally{rmSync(dir,{recursive:true});}});


