import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';

const data=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const pack=data(await readFile(new URL('../components/avatar-pack.ts',import.meta.url),'utf8'));
const source=(await readFile(new URL('../app/api/avatar/route.ts',import.meta.url),'utf8'))
  .replace("'next/server'",JSON.stringify(import.meta.resolve('next/server.js')))
  .replace("'../../../components/avatar-pack'",JSON.stringify(pack));
let version=0;
const reload=()=>import(data(source+'\n// reload '+version++));
const request=(method,query='',body)=>new Request('http://localhost/api/avatar'+query,{method,body,headers:{host:'localhost','x-studio-code':'test-code'}});
function form(packName){
  const input=new FormData();
  input.set('pack',packName);input.set('consent','yes');
  input.set('photo',new File([Uint8Array.from([255,216,255,0])],'test.jpg',{type:'image/jpeg'}));
  return input;
}
test('Tripo packs recover saved state, enforce credit limits and preserve partial results',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'evervoice-test-'));
  const originalFetch=globalThis.fetch,originalNow=Date.now;
  process.env.EVERVOICE_AVATAR_DIR=dir;process.env.TRIPO_API_KEY='mock';process.env.STUDIO_ACCESS_CODE='test-code';
  let credits=0,now=1000,riggable=true,fail='',serial=0;
  Date.now=()=>now;
  const tasks=new Map(), calls=[];
  globalThis.fetch=async(url,options)=>{
    const path=new URL(url).pathname;
    calls.push(path);
    if(path==='/mesh.glb')return new Response('glTF mock');
    if(path.endsWith('/balance'))return Response.json({code:0,data:{balance:credits}});
    if(path.endsWith('/files'))return Response.json({code:0,data:{file_token:'file_1'}});
    if(path.includes('/tasks/')){
      const stage=tasks.get(path.split('/').at(-1));
      return Response.json({code:0,data:{status:stage===fail?'failed':'success',output:{model_url:'https://asset.example/mesh.glb',riggable,rig_type:'biped'}}});
    }
    const input=JSON.parse(options.body);
    const stage=input.animation?.split(':').at(-1)||path.split('/').at(-1);
    const id='task-'+serial++;tasks.set(id,stage);
    if(input.animation)assert.equal(input.animate_in_place,true);
    return Response.json({code:0,data:{task_id:id}});
  };
  try{
    let route=await reload();
    assert.equal((await route.GET(request('GET','?quote=1'))).status,200);
    assert.equal((await route.POST(request('POST','',form('full')))).status,402);
    assert.equal(calls.some(path=>path.endsWith('/files')),false);
    credits=175;
    const concurrent=await Promise.all([route.POST(request('POST','',form('essentials'))),route.POST(request('POST','',form('essentials')))]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    route=await reload();
    assert.equal((await (await route.GET(request('GET'))).json()).stage,'generate');
    async function tick(){now+=2500;return (await route.PATCH(request('PATCH'))).json();}
    assert.equal((await tick()).stage,'check');assert.equal((await tick()).stage,'rig');
    let job=await tick();assert.equal(job.stage,'ready');assert.deepEqual(job.assets,['mesh','rig']);
    let before=calls.length;
    assert.equal((await route.GET(request('GET','?key='+job.key+'&asset=rig'))).status,200);
    assert.equal(calls.length,before);
    riggable=false;
    assert.equal((await route.POST(request('POST','',form('full')))).status,200);
    await tick();job=await tick();assert.equal(job.stage,'failed');assert.deepEqual(job.assets,['mesh']);
    riggable=true;fail='agree';
    assert.equal((await route.POST(request('POST','',form('full')))).status,200);
    for(const stage of ['check','rig','idle','agree','failed'])assert.equal((await tick()).stage,stage);
    job=await (await route.GET(request('GET'))).json();
    assert.deepEqual(job.assets,['mesh','rig','idle']);assert.equal(job.retry,true);
    fail='';
    const retry=new FormData();retry.set('retry','yes');
    assert.equal((await route.POST(request('POST','',retry))).status,200);
    for(const stage of ['greeting','walk','ready'])assert.equal((await tick()).stage,stage);
    job=await (await route.GET(request('GET'))).json();
    assert.deepEqual(job.assets,['mesh','rig','idle','agree','greeting','walk']);
  }finally{globalThis.fetch=originalFetch;Date.now=originalNow;await rm(dir,{recursive:true,force:true});}
});
test('scene direction gives reflective messages no walk and ties zoom cues to steps',async()=>{
  const {direction,timeline,cueWeight}=await import(data(await readFile(new URL('../components/scene-direction.ts',import.meta.url),'utf8')));
  const words='Congratulations! Look around. We are proud of you. Enjoy today.';
  assert.deepEqual(direction(words,'Wedding'),{tone:'celebratory',backdrop:'reception'});
  assert.equal(direction(words,'Personal wishes').tone,'reflective');
  assert.equal(timeline(words,30,'reflective').some(c=>c.kind==='walk'),false);
  const step=timeline(words,30,'celebratory').find(c=>c.kind==='walk');
  assert.ok(step);assert.equal(cueWeight(step.start,step),0);assert.equal(cueWeight(step.start+step.length/2,step),1);
});
