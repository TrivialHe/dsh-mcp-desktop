#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{home:{type:'string'},'no-register':{type:'boolean',default:false},name:{type:'string',default:'dsh-desktop'}}});
const home=resolve(values.home||process.env.DSH_HOME||join(homedir(),'.dsh'));
const profile=join(home,'profiles','desktop');
if(!existsSync(join(profile,'package.json')))throw new Error('DSH desktop profile not found. Start DSH desktop first, or pass --home.');
const plugin=fileURLToPath(new URL('./session-plugin.mjs',import.meta.url));
const runtime=fileURLToPath(new URL('./runtime/',import.meta.url));
mkdirSync(runtime,{recursive:true,mode:0o700});
const patch=join(profile,'cordis.patch.yml');
const source=existsSync(patch)?readFileSync(patch,'utf8'):'';
const begin='# BEGIN dsh-mcp-desktop',end='# END dsh-mcp-desktop';
const block=`${begin}\n- insert:\n    - id: codex-desktop-session-bridge\n      name: ${JSON.stringify(plugin.replaceAll('\\','/'))}\n${end}`;
if(/id:\s*codex-desktop-session-bridge/.test(source)&&!source.includes(begin))throw new Error('An unmanaged desktop bridge already exists. Keep the running installation, or remove that entry before installing this checkout.');
if(!source.includes(block)){
 const backup=patch+'.dsh-mcp-desktop.backup';if(existsSync(patch)&&!existsSync(backup))copyFileSync(patch,backup);
 let next=source.trim()==='[]'?'':source;
 if(next.includes(begin)){const start=next.indexOf(begin),finish=next.indexOf(end,start);if(finish<0)throw new Error('Incomplete managed patch block');next=next.slice(0,start)+block+next.slice(finish+end.length);}else next=next.trimEnd()+'\n\n'+block+'\n';
 writeFileSync(patch,next,'utf8');
}
if(!values['no-register']){
 const result=spawnSync('codex',['mcp','add',values.name,'--',process.execPath,fileURLToPath(new URL('./server.mjs',import.meta.url))],{shell:false,windowsHide:true,stdio:'inherit'});
 if(result.error)throw new Error('Codex executable unavailable. Use --no-register and configure MCP manually.');if(result.status!==0)process.exit(result.status??1);
}
console.log('Desktop plugin configured. Restart DSH desktop, then restart your Codex session.');
