'use client';

import {useEffect,useRef,useState} from 'react';
import {Button} from './button';
import {MediaCapture} from './media-recorder';
import {GlideEntry} from './glide-entry';
import {localBank} from './studio-bank';
import {voiceRequest,audioForm} from './voice-entry';

const starterPrompts=[
  'Who are the people you want to preserve stories for?',
  'Tell us about a small memory that still makes you smile.',
  'Share a joke or a phrase your family knows is yours.',
  'What would you like someone you love to hear on a special day?',
];

type Answer={id:string;prompt:string;title:string;blob:Blob;url:string;selected:boolean};

export function OnboardingVoice({name,notes,onNotes,onBusy}:{
  name:string;notes:string;onNotes:(notes:string)=>void;onBusy:(busy:boolean)=>void;
}){
  const [answers,setAnswers]=useState<Answer[]>([]);
  const [texts,setTexts]=useState<Record<string,string>>({});
  const [savedTexts,setSavedTexts]=useState<Record<string,string>>({});
  const [followups,setFollowups]=useState<Record<string,string>>({});
  const [transcriptTakes,setTranscriptTakes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [authorized,setAuthorized]=useState(false);
  const [prepare,setPrepare]=useState(false);
  const [code,setCode]=useState('');
  const [local,setLocal]=useState(true);
  const [voice,setVoice]=useState<{name:string;requiresVerification:boolean}>();
  const urls=useRef(new Set<string>());

  useEffect(()=>{
    setLocal(['localhost','127.0.0.1'].includes(location.hostname));
    try{
      const saved=JSON.parse(localStorage.getItem('evervoice-enrolled-voice')||'null');
      if(saved?.id)setVoice(saved);
      const journal=JSON.parse(localStorage.getItem('evervoice-interview-journal')||'{}');
      setTexts(journal);
      setSavedTexts(journal);
      setFollowups(JSON.parse(localStorage.getItem('evervoice-interview-followups')||'{}'));
    }catch{}
    const previews=urls.current;
    let active=true;
    localBank<Array<Omit<Answer,'url'|'selected'> & {interviewPrompt?:string}>>('readonly',store=>store.getAll()).then(takes=>{
      if(!active)return;
      setAnswers(takes.filter(take=>take.interviewPrompt&&take.blob).map(take=>{
        const url=URL.createObjectURL(take.blob);
        previews.add(url);
        return {...take,prompt:take.interviewPrompt!,url,selected:false};
      }));
    }).catch(()=>{if(active)setNotice('Could not load past interview recordings.');});
    return ()=>{
      active=false;
      previews.forEach(url=>URL.revokeObjectURL(url));
    };
  },[]);

  function working(value:boolean){
    setBusy(value);
    onBusy(value);
  }

  async function saveRecording(prompt:string,blob:Blob){
    const id=crypto.randomUUID();
    const number=answers.filter(answer=>answer.prompt===prompt).length+1;
    const title='Interview · '+prompt+' · Take '+number;
    await localBank('readwrite',store=>store.put({
      id,title,interviewPrompt:prompt,recipient:'',occasion:'Voice interview',
      words:'',mood:'Warm',source:'Original recording',blob,
    }));
    const url=URL.createObjectURL(blob);
    urls.current.add(url);
    setAnswers(current=>[...current,{id,prompt,title,blob,url,selected:true}]);
    setAuthorized(false);
  }

  async function deleteRecording(answer:Answer){
    if(!window.confirm('Delete this original recording from this browser?'))return;
    working(true);
    try{
      await localBank('readwrite',store=>store.delete(answer.id));
      URL.revokeObjectURL(answer.url);
      urls.current.delete(answer.url);
      setAnswers(current=>current.filter(item=>item.id!==answer.id));
      setTranscriptTakes(current=>Object.fromEntries(
        Object.entries(current).filter(([,id])=>id!==answer.id)
      ));
      setAuthorized(false);
      setNotice('Recording deleted from this browser.');
    }catch{setNotice('Could not delete this recording. It is still available.');}
    finally{working(false);}
  }

  async function transcribe(answer:Answer){
    working(true);
    try{
      const result=await voiceRequest('transcribe',audioForm(answer.blob),code);
      if(typeof result.text!=='string'||!result.text.trim())throw Error('No words were detected in this answer.');
      setTexts(current=>({...current,[answer.prompt]:result.text.trim().slice(0,1800)}));
      setTranscriptTakes(current=>({...current,[answer.prompt]:answer.id}));
      setNotice('Transcript added. Review it, then choose Save reviewed answer.');
    }catch(error){setNotice(error instanceof Error?error.message:'Could not transcribe this answer.');}
    finally{working(false);}
  }

  async function saveAnswer(prompt:string){
    const text=texts[prompt]?.trim();
    if(!text)return;
    working(true);
    try{
      const takeId=transcriptTakes[prompt];
      if(takeId)await localBank('readwrite',store=>{
        const request=store.get(takeId);
        request.onsuccess=()=>{if(request.result)store.put({...request.result,words:text});};
        return request;
      });
      const next={...savedTexts,[prompt]:text};
      localStorage.setItem('evervoice-interview-journal',JSON.stringify(next));
      setSavedTexts(next);
      setNotice('Reviewed answer saved.');
    }catch{setNotice('Could not save this answer.');}
    finally{working(false);}
  }

  async function askFollowup(prompt:string){
    working(true);
    try{
      const result=await voiceRequest('interview-followup',{text:JSON.stringify({prompt,answer:savedTexts[prompt]})},code);
      const next={...followups,[prompt]:result.text};
      localStorage.setItem('evervoice-interview-followups',JSON.stringify(next));
      setFollowups(next);
      setNotice('');
    }catch{setNotice('A follow-up is unavailable. You can continue with the starter prompts.');}
    finally{working(false);}
  }

  const selected=answers.filter(answer=>answer.selected);
  const bytes=selected.reduce((total,answer)=>total+answer.blob.size,0);

  async function clone(){
    if(!authorized||!selected.length||bytes>4_000_000)return;
    working(true);
    try{
      const form=new FormData();
      form.set('consent','yes');
      form.set('name',(name.trim()||'My preserved voice').slice(0,80));
      selected.forEach(answer=>form.append('audio',audioForm(answer.blob).get('audio')!));
      const result=await voiceRequest('clone',form,code);
      const enrolled={id:result.voiceId,name:form.get('name') as string,requiresVerification:result.requiresVerification,prepareSamples:prepare};
      setVoice(enrolled);
      setAuthorized(false);
      try{
        localStorage.setItem('evervoice-enrolled-voice',JSON.stringify(enrolled));
        if(local&&prepare&&!enrolled.requiresVerification)sessionStorage.setItem('evervoice-prepare-onboarding',enrolled.id);
      }catch{
        setNotice('Voice created. Browser storage is unavailable. Save this ElevenLabs voice ID: '+enrolled.id);
        return;
      }
      setNotice(enrolled.requiresVerification?'Complete verification in ElevenLabs, then confirm it in Studio’s Voice bank.':'Your preserved voice is ready for Studio.');
    }catch(error){setNotice(error instanceof Error?error.message:'Could not create the voice.');}
    finally{working(false);}
  }

  return <section className="space-y-4 rounded-xl border border-[var(--border)] p-4" aria-label="Preserve your voice">
    <h3 className="display text-2xl">Preserve your voice</h3>
    <p>Answer any of these prompts aloud. Play back your answers, retake them, or choose which ones to use for your clone.</p>
    {starterPrompts.map(starter=><div key={starter} className="space-y-4">
      {[starter,...(followups[starter]?[followups[starter]]:[])].map(prompt=><div className="space-y-2 border-t border-[var(--border)] pt-3" key={prompt}>
        <label>{prompt}<textarea rows={3} maxLength={1800} disabled={busy} value={texts[prompt]||''} onChange={e=>setTexts(current=>({...current,[prompt]:e.target.value}))}/></label>
        <GlideEntry voice={false} label="this answer" value={texts[prompt]||''} onChange={text=>setTexts(current=>({...current,[prompt]:text}))} maxLength={1800} disabled={busy}/>
        <MediaCapture disabled={busy} onBusy={working} onSave={blob=>saveRecording(prompt,blob)}
          label={answers.some(answer=>answer.prompt===prompt)?'Retake answer':'Record answer'}/>
        {answers.filter(answer=>answer.prompt===prompt).map(answer=><div className="rounded-lg border border-[var(--border)] p-2" key={answer.id}>
          <p className="text-sm">{answer.title} · {(answer.blob.size/1_000_000).toFixed(2)} MB</p>
          <audio className="w-full" controls src={answer.url}/>
          <label className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={answer.selected} onChange={e=>{
            setAnswers(current=>current.map(item=>item.id===answer.id?{...item,selected:e.target.checked}:item));
            setAuthorized(false);
          }}/> Use this take for my clone</label>
          <div className="flex flex-wrap gap-2">
            <Button icon="text" variant="outline" disabled={busy} onClick={()=>void transcribe(answer)}>Transcribe with ElevenLabs</Button>
            <Button icon="delete" variant="outline" disabled={busy} onClick={()=>void deleteRecording(answer)}>Delete recording</Button>
          </div>
        </div>)}
        <Button icon="save" variant="outline" disabled={busy||!texts[prompt]?.trim()} onClick={()=>void saveAnswer(prompt)}>Save reviewed answer</Button>
        {prompt===starter&&!followups[starter]&&<Button icon="draft" variant="outline" disabled={busy||!savedTexts[prompt]||texts[prompt]?.trim()!==savedTexts[prompt]} onClick={()=>void askFollowup(prompt)}>Ask Gemini for a follow-up</Button>}
      </div>)}
    </div>)}
    {notes&&<details><summary>Earlier speaking notes</summary>
      <label>Speaking notes<textarea rows={4} maxLength={1800} disabled={busy} value={notes} onChange={e=>onNotes(e.target.value)}/></label>
      <GlideEntry label="speaking notes" value={notes} onChange={onNotes} maxLength={1800} disabled={busy} code={code}/>
    </details>}
    {!local&&<label>Studio access code<input type="password" value={code} disabled={busy} onChange={e=>setCode(e.target.value)}/></label>}
    {voice?<p>{voice.name} · {voice.requiresVerification?'Verification required':'Voice ready'}</p>:<>
      <p>{selected.length} selected · {(bytes/1_000_000).toFixed(2)} MB of 4 MB</p>
      {!selected.length&&<p className="text-sm">Record or select at least one answer to unlock authorization.</p>}
      {bytes>4_000_000&&<p className="text-sm">Deselect takes until the total is 4 MB or less. Your recordings stay saved.</p>}
      <label className="flex items-start gap-2"><input type="checkbox" checked={authorized} disabled={busy||!selected.length} onChange={e=>setAuthorized(e.target.checked)}/> I authorize ElevenLabs to use these selected recordings to create my voice clone.</label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={prepare} disabled={busy} onChange={e=>setPrepare(e.target.checked)}/> Use my profile and transcripts with Gemini and my clone with ElevenLabs to prepare ten future messages in Studio.</label>
      <Button icon="secure" disabled={busy||!authorized||!selected.length||bytes>4_000_000} onClick={()=>void clone()}>Create my voice clone</Button>
    </>}
    {!local&&prepare&&<p>In hosted Studio, enter your access code and start preparation from Future messages.</p>}
    <p role="status">{notice}</p>
  </section>;
}
