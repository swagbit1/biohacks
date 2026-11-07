import {timingSafeEqual,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {NextResponse} from 'next/server';
import {assetKeys,clips,packCost,type Asset,type Clip,type Pack} from '../../../components/avatar-pack';

type Stage='generate'|'check'|'rig'|Clip;
type Job={key:string;pack:Pack;rigVersion:string;stage:Stage;id?:string;status:'active'|'submitting'|'ready'|'failed';assets:Asset[];mesh?:string;rig?:string;progress:number;error?:string};
type Output={model_url?:string;riggable?:boolean;rig_type?:string};
const folder=process.env.EVERVOICE_AVATAR_DIR||join(process.cwd(),'.evervoice-avatars');
const stateFile=join(folder,'job.json');
const shared=globalThis as typeof globalThis&{evervoicePackLock?:boolean};
let nextPoll=0;
const json=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function authorized(request:Request){
  if(process.env.VERCEL) return json({error:'Run photo generation in the local studio.'},503);
  const expected=Buffer.from(process.env.STUDIO_ACCESS_CODE||'');
  const supplied=Buffer.from(request.headers.get('x-studio-code')||'');
  if(!process.env.TRIPO_API_KEY)return json({error:'Set TRIPO_API_KEY in .env.local.'},503);
  if(!expected.length){
    const host=request.headers.get('host')||'';
    const origin=request.headers.get('origin');
    if(process.env.TRIPO_LOCAL_ONLY==='1'&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)&&(!origin||origin==='http://'+host))return;
    return json({error:'Set a studio access code or start the loopback-only avatar server.'},403);
  }
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return json({error:'Enter the studio access code.'},401);
}
async function tripo<T>(path:string,payload?:object|FormData):Promise<T>{
  const headers:Record<string,string>={Authorization:'Bearer '+process.env.TRIPO_API_KEY?.trim()};
  if(payload && !(payload instanceof FormData))headers['Content-Type']='application/json';
  const response=await fetch('https://openapi.tripo3d.ai/v3'+path,{method:payload?'POST':'GET',headers,body:payload instanceof FormData?payload:payload?JSON.stringify(payload):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Tripo returned HTTP '+response.status+'. Check your API key, credits and account limits.');
  const result=await response.json();
  if(result.code!==0||!result.data)throw Error('Tripo rejected the task (code '+String(result.code)+'). Check your credits and task history.');
  return result.data;
}
async function submit(path:string,input:object){
  const result=await tripo<{task_id:string}>(path,input);
  if(!result.task_id)throw Error('Tripo did not return a task ID.');
  return result.task_id;
}

async function load():Promise<Job|undefined>{
  try{return JSON.parse(await readFile(stateFile,'utf8'));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
}
async function persist(job:Job){
  await mkdir(folder,{recursive:true});
  await writeFile(stateFile+'.tmp',JSON.stringify(job),{mode:0o600});
  await rename(stateFile+'.tmp',stateFile);
  await writeFile(join(folder,job.key+'.json'),JSON.stringify(job),{mode:0o600});
}
function snapshot(job?:Job){
  if(!job)return json({stage:'empty',assets:[]});
  return json({key:job.key,pack:job.pack,stage:job.status==='active'?job.stage:job.status,assets:job.assets,progress:job.progress,
    error:job.status==='submitting'?'A submission may have reached Tripo. Check your Tripo history before retrying.':job.error,
    retry:job.status==='failed'&&job.stage!=='generate'&&Boolean(job.mesh)});
}
async function start(job:Job,stage:Stage,path:string,input:object){
  job.stage=stage;job.status='submitting';job.id=undefined;job.error=undefined;job.progress=0;
  await persist(job);
  try{job.id=await submit(path,input);}
  catch(error){job.error=(error as Error).message;await persist(job);throw error;}
  job.status='active';nextPoll=Date.now()+2200;
  await persist(job);
}
async function advance(job:Job,stage:Stage){
  if(stage==='check')return start(job,stage,'/animations/rig-check',{input:job.mesh});
  if(stage==='rig')return start(job,stage,'/animations/rig',{input:job.mesh,model:job.rigVersion,rig_type:'biped',spec:'mixamo'});
  if(stage==='generate')throw Error('Choose a photo to generate a model.');
  return start(job,stage,'/animations/retarget',{input:job.rig,animation:'preset:biped:'+clips[stage],out_format:'glb',animate_in_place:true});
}
async function balance(){const data=await tripo<{balance:number}>('/account/balance');if(!Number.isFinite(data.balance))throw Error('Tripo did not return a balance.');return data.balance;}
async function save(job:Job,asset:Asset,output?:Output){
  if(job.assets.includes(asset))return;
  const url=new URL(output?.model_url||'');if(url.protocol!=='https:')throw Error('Invalid asset URL.');
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Could not download the model. Try Check job again.');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.toString('ascii',0,4)!=='glTF')throw Error('Tripo returned an invalid GLB.');
  await writeFile(join(folder,job.key+'-'+asset+'.glb'),bytes,{mode:0o600});
  job.assets.push(asset);await persist(job);
}
export async function GET(request:Request){
  const query=new URL(request.url).searchParams;
  const localHost=/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.get('host')||'');
  if(process.env.VERCEL||!localHost)return json({error:'Avatar packs are available on localhost.'},403);
  try{
    if(query.has('quote')){const denied=authorized(request);return denied||json({balance:await balance(),cost:packCost});}
    let job=await load();
    const asset=query.get('asset') as Asset|null,key=query.get('key')||'';
    if(!asset)return snapshot(job);
    if(!assetKeys.includes(asset)||!/^[a-f0-9-]{36}$/.test(key))return json({error:'Asset unavailable.'},404);
    if(job?.key!==key){
      try{job=JSON.parse(await readFile(join(folder,key+'.json'),'utf8'));}
      catch{return json({error:'Asset unavailable.'},404);}
    }
    if(!job?.assets.includes(asset))return json({error:'Asset unavailable.'},404);
    const bytes=await readFile(join(folder,job.key+'-'+asset+'.glb'));
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'model/gltf-binary','Cache-Control':'private, max-age=3600'}});
  }catch(error){return json({error:(error as Error).message},502);}
}
export async function POST(request:Request){
  const denied=authorized(request);if(denied)return denied;
  if(shared.evervoicePackLock)return json({error:'An avatar request is already in progress.'},409);
  shared.evervoicePackLock=true;
  try{
    const previous=await load();
    if(previous&&['active','submitting'].includes(previous.status))return json({error:'Check the existing avatar job before starting another.'},409);
    const form=await request.formData();
    if(form.get('retry')==='yes'){
      if(!previous||previous.status!=='failed'||!previous.mesh||previous.stage==='generate')return json({error:'No confirmed failed stage to retry.'},409);
      const cost=previous.stage==='check'?0:previous.stage==='rig'?25:10;
      if(await balance()<cost)return json({error:'Insufficient credits to retry this stage.'},402);
      await advance(previous,previous.stage);return snapshot(previous);
    }
    const pack=form.get('pack');
    if(pack!=='full'&&pack!=='essentials')return json({error:'Choose an avatar pack.'},400);
    const photo=form.get('photo');
    if(form.get('consent')!=='yes'||!(photo instanceof File)||!photo.size||photo.size>4_000_000)return json({error:'Confirm permission and choose a JPG or PNG under 4 MB.'},400);
    const bytes=new Uint8Array(await photo.slice(0,8).arrayBuffer());
    const jpeg=photo.type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=photo.type==='image/png'&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
    if(!jpeg&&!png)return json({error:'Choose a valid JPG or PNG.'},400);
    const available=await balance();
    if(available<packCost[pack])return json({error:'This pack needs '+packCost[pack]+' credits. Shortfall: '+(packCost[pack]-available)+'.'},402);
    const upload=new FormData();upload.set('file',photo,jpeg?'reference.jpg':'reference.png');
    const {file_token}=await tripo<{file_token:string}>('/files',upload);
    if(!file_token)throw Error('Tripo did not return a file token.');
    const job:Job={key:randomUUID(),pack,rigVersion:'v1.0-20240301',stage:'generate',status:'submitting',assets:[],progress:0};
    await start(job,'generate','/generation/image-to-model',{input:file_token,model:'P2-20260801',texture:true});
    return snapshot(job);
  }catch(error){return json({error:(error as Error).message},502);}finally{shared.evervoicePackLock=false;}
}
export async function PATCH(request:Request){
  const denied=authorized(request);if(denied)return denied;
  if(shared.evervoicePackLock||Date.now()<nextPoll)return snapshot(await load());
  shared.evervoicePackLock=true;
  try{
    const job=await load();
    if(!job?.id||job.status!=='active')return snapshot(job);
    const task=await tripo<{status:string;progress?:number;output?:Output}>('/tasks/'+encodeURIComponent(job.id));
    job.progress=task.progress||0;
    if(['failed','cancelled','banned','expired','unknown'].includes(task.status)){
      job.status='failed';job.error=job.stage+' task '+task.status+'. Saved assets are still available.';await persist(job);return snapshot(job);
    }
    if(task.status!=='success')return snapshot(job);
    if(job.stage==='generate'){
      job.mesh=job.id;await save(job,'mesh',task.output);await advance(job,'check');
    }else if(job.stage==='check'){
      if(!task.output?.riggable||task.output.rig_type!=='biped'){
        job.status='failed';job.error='The mesh did not pass the humanoid rig check. You can still use the textured model.';await persist(job);
      }else await advance(job,'rig');
    }else if(job.stage==='rig'){
      job.rig=job.id;await save(job,'rig',task.output);
      if(job.pack==='full')await advance(job,'idle');else{job.status='ready';await persist(job);}
    }else{
      const order=Object.keys(clips) as Clip[];
      const stage=job.stage;await save(job,stage,task.output);
      const next=order[order.indexOf(stage)+1];
      if(next)await advance(job,next);else{job.status='ready';await persist(job);}
    }
    return snapshot(job);
  }catch(error){return json({error:(error as Error).message},502);}
  finally{nextPoll=Date.now()+2200;shared.evervoicePackLock=false;}
}
