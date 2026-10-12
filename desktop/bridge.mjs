import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {WebClient} from './web-client.mjs';
export class DesktopBridge {
  constructor(path){this.path=path;this.sessions=new Map();}
  credentials(){const value=JSON.parse(readFileSync(this.path,'utf8'));const url=new URL(value.origin);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('Only the local DSH desktop connection is supported');return value;}
  async rpc(method,args){return new WebClient(this.credentials()).rpc(method,args);}
  async observe(id){
    const existing=this.sessions.get(id);if(existing&&!existing.disconnected)return existing;
    existing?.client.close();
    const client=new WebClient(this.credentials());
    const state={id,client,events:[],answer:'',partial_text:'',last_seq:-1,finish_reason:null,disconnected:false,turn_requests:new Set(),completed_requests:new Set()};
    this.sessions.set(id,state);
    try {
      await client.connect(()=>{state.disconnected=true;});
      const snapshot=await client.subscribe('session/follow',{request:{address:{kind:'session',sessionId:id},maxMessages:100,assistantStream:true}},frame=>{
        if(frame.type==='assistant-stream'){const c=frame.frame.chunk;if(c?.type==='text-delta')state.partial_text=(state.partial_text+(c.text??c.delta??'')).slice(-16000);}
        else if(frame.type==='event')this.event(state,frame.event);
      });
      state.last_seq=Math.max(state.last_seq,snapshot.cursor);
      for(const {event} of snapshot.records)this.event(state,event);
      return state;
    } catch(error){state.disconnected=true;client.close();throw error;}
  }
  event(state,event){
    state.last_seq=Math.max(state.last_seq,event.seq);
    state.events.push({seq:event.seq,type:event.type});if(state.events.length>100)state.events.shift();
    if(event.type==='turn/start'){state.answer='';state.partial_text='';state.finish_reason=null;state.turn_requests.clear();}
    if(event.type==='user/message'&&event.data.source?.rpcId)state.turn_requests.add(event.data.source.rpcId);
    if(event.type==='assistant/message')state.answer=(event.data.message?.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    if(event.type==='turn/end'){state.finish_reason=event.data.reason;for(const id of state.turn_requests)state.completed_requests.add(id);}
  }
  async start({cwd,title,task}){
    if(!/^(?:[A-Za-z]:[\\/]|\/)/.test(cwd))throw new Error('cwd must be absolute');
    const workspace=(await this.rpc('workspace/create',{request:{path:cwd}})).workspace;
    if(!workspace.workspaceId)throw new Error('DSH workspace response is missing workspaceId');
    const created=await this.rpc('session/create',{request:{workspaceId:workspace.workspaceId}});
    const grouped=(await this.rpc('workspace/create',{request:{path:cwd}})).workspace;
    if(!grouped.sessionIds.includes(created.sessionId))throw new Error('Session '+created.sessionId+' was created but workspace membership could not be verified');
    await this.rpc('session/rename',{request:{sessionId:created.sessionId,title}});
    await this.observe(created.sessionId);
    const receipt=task?await this.send(created.sessionId,task):{};
    return {session_id:created.sessionId,workspace_id:workspace.workspaceId,cwd:workspace.path,title,...receipt};
  }
  async send(id,task,mode='queue'){
    const state=await this.observe(id);const after_seq=state.last_seq;
    const request_id=randomUUID();
    await this.rpc('session/prompt',{request:{sessionId:id,requestId:request_id,mode,content:[{type:'text',text:task}],clientTimeZone:'Asia/Shanghai'}});
    return {session_id:id,request_id,accepted:true,after_seq};
  }
  async status(id){const s=await this.observe(id);const row=(await this.rpc('session/list',{_request:{}})).items.find(x=>x.sessionId===id);if(!row)throw new Error('Session not found');return {session_id:id,running:row.running,answer:s.answer,partial_text:s.partial_text,finish_reason:s.finish_reason,last_seq:s.last_seq,events:s.events};}
  async wait(id,after_seq=-1,seconds=30,request_id){
    const state=await this.observe(id);const deadline=Date.now()+seconds*1000;
    do {
      const end=state.events.find(e=>e.type==='turn/end'&&e.seq>after_seq);
      if(end&&(!request_id||state.completed_requests.has(request_id)))return {...await this.status(id),wait_outcome:'completed'};
      if(state.disconnected)throw new Error('Desktop connection lost; reconnect without resending the task');
      await new Promise(resolve=>setTimeout(resolve,150));
    }while(Date.now()<deadline);
    return {...await this.status(id),wait_outcome:'timeout'};
  }
  close(){for(const s of this.sessions.values())s.client.close();this.sessions.clear();}
}
