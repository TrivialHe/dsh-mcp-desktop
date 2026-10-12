import {spawnSync} from 'node:child_process';
import { writeFileSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const name='codex-desktop-session-bridge';
export function apply(ctx) {
  writeFileSync(fileURLToPath(new URL('./runtime/desktop-plugin-health.json',import.meta.url)),JSON.stringify({stage:'mounted'}));
  ctx.inject(['connection','webServer','workspaceRegistry'], child => {
    child.effect(async () => {
      writeFileSync(fileURLToPath(new URL('./runtime/desktop-plugin-health.json',import.meta.url)),JSON.stringify({stage:'services-ready',port:child.webServer.port}));
      const origin=`http://127.0.0.1:${child.webServer.port}`;
      const response=await fetch(child.connection.authenticatedUrl(origin),{redirect:'manual',signal:AbortSignal.timeout(10000)});
      const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
      await response.body?.cancel();
      if(response.status!==303||!cookie) throw new Error('Desktop bridge authentication failed');
      const path=fileURLToPath(new URL('./runtime/desktop-connection.json',import.meta.url));
      writeFileSync(path,JSON.stringify({origin,cookie}),{mode:0o600});
      if(process.platform==='win32'){const user=process.env.USERDOMAIN+'\\'+process.env.USERNAME;const acl=spawnSync('icacls.exe',[path,'/inheritance:r','/grant:r',user+':(F)'],{windowsHide:true,stdio:'ignore'});if(acl.status!==0){unlinkSync(path);throw new Error('Cannot restrict desktop connection credentials');}}
      const repairPath=fileURLToPath(new URL('./runtime/desktop-grouping-repair.json',import.meta.url));
      if(existsSync(repairPath)){const repair=JSON.parse(readFileSync(repairPath,'utf8'));const workspace=child.workspaceRegistry.get(repair.workspaceId);if(!workspace)throw new Error('Repair workspace not found');for(const id of repair.sessionIds)await workspace.attachSession(id);writeFileSync(fileURLToPath(new URL('./runtime/desktop-grouping-repair-result.json',import.meta.url)),JSON.stringify({attached:repair.sessionIds}));unlinkSync(repairPath);}
      child.effect(()=>()=>{try {unlinkSync(path);} catch {}});
    });
  });
}





