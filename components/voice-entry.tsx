'use client';

import {useEffect,useState,type ReactNode} from 'react';
import {Button} from './button';
import {MediaCapture} from './media-recorder';
import {localBank} from './studio-bank';

export function audioForm(blob:Blob){
  const form=new FormData();
  const extension=blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm';
  form.append('audio',blob,'answer.'+extension);
  return form;
}

export async function voiceRequest(action:string,body:FormData|object,code=''){
  const isForm=body instanceof FormData;
  const response=await fetch('/api/'+action,{
    method:'POST',headers:{'x-studio-code':code,...(!isForm?{'Content-Type':'application/json'}:{})},
    body:isForm?body:JSON.stringify(body),
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'The request failed.');
  return result;
}

export function VoiceEntry({label,disabled,code='',onInsert,leading}:{
  label:string;disabled?:boolean;code?:string;onInsert:(text:string)=>boolean;leading?:ReactNode;
}){
  const [clip,setClip]=useState<{id:string;blob:Blob}>();
  const [url,setUrl]=useState('');
  const [review,setReview]=useState<string>();
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [accessCode,setAccessCode]=useState('');
  const [local,setLocal]=useState(true);

  useEffect(()=>{setLocal(['localhost','127.0.0.1'].includes(location.hostname));},[]);
  useEffect(()=>{
    if(!clip)return;
    const next=URL.createObjectURL(clip.blob);
    setUrl(next);
    return ()=>URL.revokeObjectURL(next);
  },[clip]);

  async function transcribe(){
    if(!clip)return;
    setWorking(true);
    setError('');
    try{
      const result=await voiceRequest('transcribe',audioForm(clip.blob),code||accessCode);
      if(typeof result.text!=='string'||!result.text.trim())throw Error('No speech was detected. Your recording is saved.');
      setReview(result.text);
    }catch(error){setError(error instanceof Error?error.message:'Could not transcribe this answer.');}
    finally{setWorking(false);}
  }

  async function insert(){
    if(!clip||!review?.trim())return;
    setWorking(true);
    try{
      await localBank('readwrite',store=>{
        const request=store.get(clip.id);
        request.onsuccess=()=>{if(request.result)store.put({...request.result,words:review.trim()});};
        return request;
      });
      window.dispatchEvent(new Event('evervoice-bank-changed'));
      if(onInsert(review.trim()))setReview(undefined);
    }catch{setError('Could not save the reviewed transcript.');}
    finally{setWorking(false);}
  }

  return <div className="space-y-2">
    <MediaCapture leading={leading} label={'Record answer · '+label} disabled={disabled||working} onSave={async blob=>{
      const id=crypto.randomUUID();
      await localBank('readwrite',store=>store.put({
        id,blob,title:'Voice answer · '+label,recipient:'',occasion:'Voice notes',words:'',mood:'Warm',source:'Original recording',
      }));
      window.dispatchEvent(new Event('evervoice-bank-changed'));
      setClip({id,blob});
      setReview(undefined);
      setError('');
    }}/>
    {clip&&<>
      <audio controls src={url||undefined} className="w-full"/>
      {!local&&!code&&<label>Studio access code<input type="password" value={accessCode} onChange={e=>setAccessCode(e.target.value)}/></label>}
      <Button icon="text" variant="outline" disabled={disabled||working} onClick={()=>void transcribe()}>Transcribe with ElevenLabs</Button>
    </>}
    {review!==undefined&&<>
      <label>Review transcript<textarea value={review} disabled={working} onChange={e=>setReview(e.target.value)}/></label>
      <Button icon="next" disabled={disabled||working||!review.trim()} onClick={()=>void insert()}>Insert reviewed transcript</Button>
    </>}
    {error&&<p role="status" className="text-sm">{error}</p>}
  </div>;
}
