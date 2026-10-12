import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('installer handles empty profile and is idempotent',()=>{const home=mkdtempSync(join(tmpdir(),'dsh-install-test-'));try{const profile=join(home,'profiles','desktop');mkdirSync(profile,{recursive:true});writeFileSync(join(profile,'package.json'),'{}');const patch=join(profile,'cordis.patch.yml');writeFileSync(patch,'[]\n');const args=[fileURLToPath(new URL('./install.mjs',import.meta.url)),'--home',home,'--no-register'];const first=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(first.status,0,first.stderr);const one=readFileSync(patch,'utf8');assert.match(one,/BEGIN dsh-mcp-desktop/);assert.doesNotMatch(one,/^\[\]/);const second=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(second.status,0,second.stderr);assert.equal(readFileSync(patch,'utf8'),one);}finally{rmSync(home,{recursive:true});}});
