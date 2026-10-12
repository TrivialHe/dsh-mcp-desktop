import test from 'node:test';
import assert from 'node:assert/strict';
import {DesktopBridge} from './bridge.mjs';
test('desktop task binds to WorkspaceView.workspaceId and verifies membership',async()=>{
 const b=new DesktopBridge('unused');let attached=false;const calls=[];
 b.rpc=async(method,args)=>{calls.push({method,args});if(method==='workspace/create')return {workspace:{workspaceId:'workspace-real',path:'D:/example-project',sessionIds:attached?['session-new']:[]}};if(method==='session/create'){assert.deepEqual(args.request,{workspaceId:'workspace-real'});attached=true;return {sessionId:'session-new'};}return {};};
 b.observe=async()=>({});
 const result=await b.start({cwd:'D:/example-project',title:'test'});
 assert.equal(result.workspace_id,'workspace-real');assert.equal(calls.filter(x=>x.method==='workspace/create').length,2);
});
