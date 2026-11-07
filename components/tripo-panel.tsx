'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './button';
import {assetNames,packCost,type Asset,type Pack} from './avatar-pack';
export type SavedPack={key:string;assets:Asset[]};
type Job=SavedPack&{stage:string;progress?:number;error?:string;retry?:boolean};
export const packAsset=(key:string,asset:Asset)=>'/api/avatar?key='+encodeURIComponent(key)+'&asset='+asset;
const terminal=['empty','ready','failed','submitting'];
export default function TripoPanel({code,onModel,onPack}:{code:string;onModel:(blob:Blob)=>void;onPack:(pack:SavedPack)=>void}){
  const [photo,setPhoto]=useState<File>(),[preview,setPreview]=useState(''),[consent,setConsent]=useState(false);
  const [pack,setPack]=useState<Pack>('essentials'),[balance,setBalance]=useState<number>(),[job,setJob]=useState<Job>();
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef(false);
  useEffect(()=>{
    if(!photo){setPreview('');return;}
    const url=URL.createObjectURL(photo);setPreview(url);return ()=>URL.revokeObjectURL(url);
  },[photo]);
  async function request(method='GET',query='',body?:FormData){
    const response=await fetch('/api/avatar'+query,{method,body,headers:{'x-studio-code':code},cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Avatar request failed.');
    return result;
  }
  useEffect(()=>{
    let active=true;
    let timer:ReturnType<typeof setTimeout>;
    async function poll(method:string){
      try{
        const next:Job=await request(method);
        if(!active)return;
        setJob(next);
        if(!terminal.includes(next.stage))timer=setTimeout(()=>void poll('PATCH'),2500);
        else if(['ready','failed'].includes(next.stage)&&next.assets.includes('rig'))onPack(next);
      }catch(error){if(active)setNotice((error as Error).message);}
    }
    const resume=()=>{clearTimeout(timer);void poll('GET');};
    resume();window.addEventListener('evervoice:tripo-check',resume);
    return ()=>{active=false;clearTimeout(timer);window.removeEventListener('evervoice:tripo-check',resume);};
  },[code,onPack]);
  async function act(kind:'quote'|'generate'|'retry'){
    if(pending.current)return;
    pending.current=true;setBusy(true);setNotice('');
    try{
      if(kind==='quote'){setBalance((await request('GET','?quote=1')).balance);return;}
      const form=new FormData();
      if(kind==='retry')form.set('retry','yes');
      else if(photo&&consent){form.set('photo',photo);form.set('consent','yes');form.set('pack',pack);}
      else return;
      setJob(await request('POST','',form));setBalance(undefined);
      window.dispatchEvent(new Event('evervoice:tripo-check'));
    }catch(error){setNotice((error as Error).message);}finally{pending.current=false;setBusy(false);}
  }
  const running=Boolean(job&&!terminal.includes(job.stage));
  return <div className="space-y-4">
    <div className="kicker">05 / Make it personal</div><h2 className="display text-4xl">Photo avatar.</h2>
    <p>Use a clear full-body A-pose photo with both hands visible.</p>
    <label>Motion pack<select value={pack} onChange={e=>{setPack(e.target.value as Pack);setConsent(false);}}>
      <option value="essentials">Essentials · 135 credits · local motion</option><option value="full">Full Motion · 175 credits · four Tripo clips</option>
    </select></label>
    <Button variant="outline" disabled={busy} onClick={()=>void act('quote')}>Check available credits</Button>
    {balance!==undefined&&<p>{balance} available · estimated {packCost[pack]} credits{balance<packCost[pack]?' · short by '+(packCost[pack]-balance):''}</p>}
    <label>Reference photo (JPG or PNG, under 4 MB)<input type="file" accept="image/jpeg,image/png" onChange={e=>{setPhoto(e.target.files?.[0]);setConsent(false);}}/></label>
    {preview&&<img src={preview} className="max-h-44 rounded-xl" alt="Selected avatar reference"/>}
    <label className="flex items-start gap-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I have permission to upload this photo and authorize the selected paid pack.</label>
    <div className="flex flex-wrap gap-2">
      <Button disabled={!photo||!consent||busy||running||job?.stage==='submitting'||balance===undefined||balance<packCost[pack]} onClick={()=>void act('generate')}>Generate my avatar</Button>
      <Button variant="outline" onClick={()=>window.dispatchEvent(new Event('evervoice:tripo-check'))}>Check job</Button>
      {job?.retry&&<Button variant="outline" disabled={busy} onClick={()=>void act('retry')}>Retry failed stage (up to 25 credits)</Button>}
    </div>
    {running&&<progress className="w-full" max={100} value={job?.progress||0}/>}
    <p role="status">{notice||job?.error||(job?.stage==='ready'?'Avatar pack saved.':running?'Preparing '+job?.stage+'…':'')}</p>
    {!!job?.assets.length&&<div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={()=>onPack(job)}>Use saved pack</Button>
      {job.assets.map(asset=><a key={asset} href={packAsset(job.key,asset)} download={asset+'.glb'}>{assetNames[asset]}</a>)}
    </div>}
    <a href="/avatar-testing">Open Avatar Testing</a>
    <label>Import a GLB<input type="file" accept=".glb,model/gltf-binary" onChange={e=>{const file=e.target.files?.[0];if(file)onModel(file);e.target.value='';}}/></label>
  </div>;
}
