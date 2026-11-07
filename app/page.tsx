'use client';
import dynamic from 'next/dynamic';
import {useEffect,useRef,useState} from 'react';
import {AudioLines,Mic,Play,Square,Film,Sparkles,Upload,Lock,ArrowUpRight} from 'lucide-react';
import {createClient,type Session} from '@supabase/supabase-js';
import {Player} from '@remotion/player';
import {Button} from '../components/button';
import type {Motion} from '../components/avatar';
import {FamilyMessage} from '../video/message';
const Avatar=dynamic(()=>import('../components/avatar'),{ssr:false,loading:()=> <div className="h-72 sm:h-96"/>});
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const cloud=url&&key?createClient(url,key):null;
const demo='Maya, look at you. I always knew you would go far. I just hoped it would be somewhere with free parking. Seriously, kiddo. I am so proud of you.';
const recap='Before you go, remember: mitochondria are the powerhouse of the cell. The real powerhouse of this room is whoever remembered to plug in my laptop.';
type Alignment={characters:string[];character_end_times_seconds:number[]};
type Take={id:string;title:string;recipient:string;occasion:string;words:string;mood:string;source:'Original recording'|'Approved synthetic'|'Device voice demo';blob?:Blob;alignment?:Alignment};
const demoTake:Take={id:'demo',title:'For Maya, on graduation day',recipient:'Maya',occasion:'Graduation day',words:demo,mood:'Warm',source:'Device voice demo'};
async function localBank<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open('evervoice-studio',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('takes',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  try{return await new Promise<T>((resolve,reject)=>{
    const tx=db.transaction('takes',mode), result=operation(tx.objectStore('takes'));
    tx.oncomplete=()=>resolve(result.result);
    tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export default function Studio(){
  const [tab,setTab]=useState('Message studio'),[take,setTake]=useState<Take>(demoTake),[bank,setBank]=useState<Take[]>([]);
  const [audioUrl,setAudioUrl]=useState(''),[playing,setPlaying]=useState(false),[duration,setDuration]=useState(15);
  const [recipient,setRecipient]=useState('Maya'),[occasion,setOccasion]=useState('Graduation day'),[words,setWords]=useState(demo),[mood,setMood]=useState('Warm');
  const [joke,setJoke]=useState('I just hoped it would be somewhere with free parking.'),[memory,setMemory]=useState('I call Maya kiddo. I want her to know how proud I am.');
  const [recording,setRecording]=useState(false),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[code,setCode]=useState(''),[consent,setConsent]=useState(false),[cloneConsent,setCloneConsent]=useState(false);
  const [email,setEmail]=useState(''),[session,setSession]=useState<Session|null>(null);
  const player=useRef<HTMLAudioElement>(null), recorder=useRef<MediaRecorder>(null), audioGraph=useRef<{context:AudioContext;analyser:AnalyserNode;data:Uint8Array<ArrayBuffer>}|null>(null);
  const motion=useRef<Motion>({level:0,mood:'Warm',playing:false}), lastBoundary=useRef(0);
  useEffect(()=>{
    localBank('readonly',s=>s.getAll()).then(setBank).catch(()=>setNotice('This browser could not open the local voice bank.'));
    try{
      const notes=JSON.parse(localStorage.getItem('evervoice-interview') || '{}');
      if(typeof notes.joke==='string')setJoke(notes.joke);
      if(typeof notes.memory==='string')setMemory(notes.memory);
    }catch{}
    if(!cloud)return;
    const {data}=cloud.auth.onAuthStateChange((_event,session)=>setSession(session));
    return ()=>data.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    const blob=take.blob;
    if(!blob){setAudioUrl('');return;}
    const objectUrl=URL.createObjectURL(blob);
    setAudioUrl(objectUrl);
    return ()=>URL.revokeObjectURL(objectUrl);
  },[take]);
  useEffect(()=>{
    let id:number;
    const animate=()=>{
      const audio=player.current, graph=audioGraph.current;
      let level=0;
      if(playing && audio && graph && !audio.paused){
        graph.analyser.getByteTimeDomainData(graph.data);
        let sum=0;
        for(const value of graph.data)sum+=((value-128)/128)**2;
        const index=take.alignment?.character_end_times_seconds.findIndex(end=>end>=audio.currentTime)??-1;
        const vowel=index>=0 && /[aeiou]/i.test(take.alignment?.characters[index] || '');
        level=Math.min(1,Math.sqrt(sum/graph.data.length)*7+(vowel?.16:0));
      }else if(playing && !take.blob){
        const since=performance.now()-lastBoundary.current;
        level=since<370?.3+Math.sin(since/45)**2*.5:.08;
      }
      motion.current={level,playing,mood:take.mood};
      id=requestAnimationFrame(animate);
    };
    id=requestAnimationFrame(animate);
    return ()=>cancelAnimationFrame(id);
  },[playing,take]);
  function stop(){player.current?.pause();window.speechSynthesis?.cancel();setPlaying(false);}
  function open(next:Take){stop();setCloneConsent(false);setDuration(15);setTake(next);}
  function play(){
    if(playing){stop();return;}
    if(take.blob){void player.current?.play().catch(()=>setNotice('Playback failed. Try the audio controls.'));return;}
    if(!window.speechSynthesis){setNotice('Device speech is unavailable. Upload a recording to play it here.');return;}
    const voice=new SpeechSynthesisUtterance(take.words);
    voice.rate=.9;
    voice.onstart=()=>{lastBoundary.current=performance.now();setPlaying(true);};
    voice.onboundary=()=>{lastBoundary.current=performance.now();};
    voice.onend=voice.onerror=()=>setPlaying(false);
    window.speechSynthesis.speak(voice);
  }
  function connectAudio(){
    if(!audioGraph.current && player.current && window.AudioContext){
      const context=new AudioContext(),analyser=context.createAnalyser();
      context.createMediaElementSource(player.current).connect(analyser);
      analyser.connect(context.destination);
      audioGraph.current={context,analyser,data:new Uint8Array(analyser.fftSize)};
    }
    void audioGraph.current?.context.resume();
    setPlaying(true);
  }
  async function saveLocal(next:Take){
    await localBank('readwrite',s=>s.put(next));
    setBank(previous=>[next,...previous.filter(item=>item.id!==next.id)]);
    open(next);
  }
  function makeTake(blob:Blob,source:Take['source'],alignment?:Alignment):Take {
    return {id:crypto.randomUUID(),title:recipient?'For '+recipient+' · '+(occasion||'Personal message'):occasion||'Personal message',recipient,occasion,words,mood,source,blob,alignment};
  }
  async function capture(){
    let stream:MediaStream|undefined;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mic=new MediaRecorder(stream), chunks:Blob[]=[];
      recorder.current=mic;
      mic.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      mic.onstop=()=>{
        stream?.getTracks().forEach(track=>track.stop());
        setRecording(false);
        if(chunks.length)void saveLocal(makeTake(new Blob(chunks,{type:mic.mimeType}),'Original recording')).then(()=>setNotice('Original recording saved on this device.')).catch(()=>setNotice('Could not save the recording.'));
      };
      mic.start();setRecording(true);
    }catch{stream?.getTracks().forEach(track=>track.stop());setNotice('Microphone unavailable. Import an audio file instead.');}
  }
  async function api(action:string,payload:FormData|object){
    const response=await fetch('/api/'+action,{method:'POST',headers:{'x-studio-code':code,...(payload instanceof FormData?{}:{'Content-Type':'application/json'})},body:payload instanceof FormData?payload:JSON.stringify(payload)});
    const result=await response.json();
    if(!response.ok)throw Error(result.error || 'The request failed.');
    return result;
  }
  async function perform(action:string){
    setBusy(action);setNotice('');
    try{
      if(action==='draft'){
        const result=await api('draft',{text:JSON.stringify({recipient,occasion,joke,memory,mood})});
        setWords(result.text);setConsent(false);setTab('Message studio');setNotice('Draft ready. Read and edit it before approving.');
      }else if(action==='speak'){
        const result=await api('speak',{text:words,approved:consent});
        const bytes=Uint8Array.from(atob(result.audio),char=>char.charCodeAt(0));
        await saveLocal(makeTake(new Blob([bytes],{type:'audio/mpeg'}),'Approved synthetic',result.alignment));
        setNotice('Approved audio saved. Press play to hear it.');
      }else if(take.blob){
        const form=new FormData();
        form.set('audio',take.blob,'evervoice.'+(take.blob.type.includes('mp4')?'m4a':take.blob.type.includes('mpeg')?'mp3':take.blob.type.includes('wav')?'wav':'webm'));
        if(action==='clone'){form.set('consent',cloneConsent?'yes':'no');form.set('name',take.title);}
        const result=await api(action,form);
        if(action==='transcribe'){setWords(result.text);setConsent(false);setNotice('Transcript added to the editor. Review it before use.');}
        else setNotice('Voice ID: '+result.voiceId+'. '+(result.requiresVerification?'Complete verification in ElevenLabs first. ':'')+'The studio owner can set this as ELEVENLABS_VOICE_ID.');
      }
    }catch(error){setNotice(error instanceof Error?error.message:'Action failed.');}finally{setBusy('');}
  }
  async function cloudSave(){
    if(!cloud||!session||!take.blob||take.source==='Device voice demo')return;
    const path=session.user.id+'/'+take.id;
    setBusy('cloud');
    try{
      const upload=await cloud.storage.from('evervoice').upload(path,take.blob);
      if(upload.error)throw upload.error;
      const row=await cloud.from('messages').insert({id:take.id,user_id:session.user.id,title:take.title,recipient:take.recipient,occasion:take.occasion,words:take.words,mood:take.mood,source:take.source,consent_at:new Date().toISOString()});
      if(row.error){await cloud.storage.from('evervoice').remove([path]);throw row.error;}
      setNotice('A private copy was saved to your cloud library.');
    }catch(error){setNotice(error instanceof Error?error.message:'Cloud save failed.');}finally{setBusy('');}
  }
  async function cloudLoad(){
    if(!cloud||!session)return;
    setBusy('cloud');
    try{
      const result=await cloud.from('messages').select('*').order('created_at',{ascending:false});
      if(result.error)throw result.error;
      for(const item of result.data){
        const file=await cloud.storage.from('evervoice').download(session.user.id+'/'+item.id);
        if(file.error)throw file.error;
        const next:Take={id:item.id,title:item.title,recipient:item.recipient,occasion:item.occasion,words:item.words,mood:item.mood,source:item.source,blob:file.data};
        await localBank('readwrite',s=>s.put(next));
      }
      setBank(await localBank('readonly',s=>s.getAll()));setNotice('Cloud messages loaded onto this device.');
    }catch{setNotice('Could not load all cloud messages.');}finally{setBusy('');}
  }
  async function remove(item:Take){
    try{
      await localBank('readwrite',s=>s.delete(item.id));
      setBank(items=>items.filter(entry=>entry.id!==item.id));
      if(take.id===item.id)open(demoTake);
      setNotice('Local copy deleted.');
    }catch{setNotice('Could not delete the local copy.');}
  }
  function exportProps(){
    const extension=take.blob?.type.includes('mp4')?'m4a':take.blob?.type.includes('mpeg')?'mp3':take.blob?.type.includes('wav')?'wav':'webm';
    const props={recipient:take.recipient,occasion:take.occasion,words:take.words,audioUrl:audioUrl?'http://localhost:3000/authorized-take.'+extension:'',seconds:duration};
    const file=URL.createObjectURL(new Blob([JSON.stringify(props,null,2)],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=file;link.download='film-props.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(file),1000);
  }
  const tabs=['Message studio','Voice bank','Personality','Family film'];
  return <main className="mx-auto max-w-7xl px-5 pb-16 sm:px-9">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#405749] py-6">
      <div className="flex items-center gap-3 font-semibold tracking-wide"><span className="rounded-full bg-[#d6f09c] p-2 text-[#18261e]"><AudioLines size={20}/></span> EverVoice <span className="kicker">Studio</span></div>
      <span className="kicker">BioHacks 2026 · Quality of Life</span>
    </header>
    <div className="py-10 sm:py-14"><div className="kicker">A voice worth keeping</div><h1 className="display mt-3 text-5xl sm:text-8xl">Keep the way you say it.</h1><p className="mt-4 max-w-xl text-[#bcd1c4]">Save the laugh, the pause, and the words you want them to hear. A voice and message studio for people living with ALS.</p></div>
    <nav aria-label="Studio sections" className="mb-6 flex flex-wrap gap-2">{tabs.map(item=><Button key={item} aria-pressed={tab===item} variant={tab===item?'default':'outline'} onClick={()=>setTab(item)}>{item}</Button>)}</nav>
    <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
      <section className="panel" aria-label="Playback stage">
        <div className="mb-3 flex flex-wrap justify-between gap-2 kicker"><span>Alex Chen / Fictional case</span><span>{take.source}</span></div>
        <div className="stage"><Avatar motion={motion}/><p className="px-6 pb-5 text-center text-sm text-[#e1eddf]">{take.words || take.title}</p></div>
        <h2 className="display mt-4 text-3xl">{take.title}</h2>
        <div className="mt-4 flex flex-wrap gap-2"><Button onClick={play}>{playing?<Square size={17}/>:<Play size={17}/>} {playing?'Stop':'Play message'}</Button>{audioUrl&&<a className="self-center px-3 text-sm" href={audioUrl} download>Save audio <ArrowUpRight size={14} className="inline"/></a>}</div>
        <audio ref={player} src={audioUrl||undefined} controls={Boolean(audioUrl)} hidden={!audioUrl} onPlay={connectAudio} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onLoadedMetadata={event=>{const value=event.currentTarget.duration;setDuration(Number.isFinite(value)?value:15);}}/>
      </section>
      <section className="panel space-y-4" aria-label={tab}>
        {tab==='Message studio'&&<>
          <div className="kicker">01 / Make a message</div><h2 className="display text-4xl">Give the moment a voice.</h2>
          <div className="grid grid-cols-2 gap-3"><label>Recipient<input value={recipient} onChange={e=>setRecipient(e.target.value)}/></label><label>Occasion<input value={occasion} onChange={e=>setOccasion(e.target.value)}/></label></div>
          <label>Message or transcript<textarea rows={5} maxLength={3500} value={words} onChange={e=>{setWords(e.target.value);setConsent(false);}}/></label>
          <label>Expression<select value={mood} onChange={e=>setMood(e.target.value)}><option>Warm</option><option>Playful</option><option>Serious</option></select></label>
          <div className="flex flex-wrap gap-2"><Button disabled={recording} onClick={capture}><Mic size={16}/> Record original</Button><Button variant="outline" disabled={!recording} onClick={()=>recorder.current?.stop()}><Square size={16}/> Stop &amp; save</Button></div>
          <label><span><Upload size={15} className="inline"/> Import original audio</span><input type="file" accept="audio/*" onChange={e=>{const file=e.target.files?.[0];if(file)void saveLocal(makeTake(file,'Original recording')).catch(()=>setNotice('Import failed.'));e.target.value='';}}/></label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I approve this wording and authorize using the studio’s preserved voice.</label>
          <Button variant="outline" disabled={!consent||Boolean(busy)} onClick={()=>perform('speak')}><AudioLines size={16}/> Generate preserved voice</Button>
        </>}
        {tab==='Voice bank'&&<>
          <div className="kicker">02 / Keep your originals</div><h2 className="display text-4xl">The voice bank.</h2>
          <p className="text-[#bcd1c4]">Recordings are stored in this browser unless you choose private cloud backup.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>open(demoTake)}>Maya’s graduation</Button><Button variant="outline" onClick={()=>open({...demoTake,id:'recap',title:'Alex’s classroom recap',recipient:'Class',occasion:'Biology recap',mood:'Playful',words:recap})}>Classroom recap</Button></div>
          {bank.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#405749] pt-3"><div><div>{item.title}</div><small className="text-[#bcd1c4]">{item.source}</small></div><div className="flex gap-2"><Button variant="outline" onClick={()=>open(item)}>Open</Button><Button variant="outline" onClick={()=>remove(item)}>Delete local</Button></div></div>)}
          {take.blob&&<><Button variant="outline" disabled={Boolean(busy)} onClick={()=>perform('transcribe')}>Transcribe selected audio</Button>{take.source==='Original recording'&&<><label className="flex items-start gap-2"><input type="checkbox" checked={cloneConsent} onChange={e=>setCloneConsent(e.target.checked)}/> The speaker owns this recording and has authorized creating a synthetic voice from it.</label><Button variant="outline" disabled={!cloneConsent||Boolean(busy)} onClick={()=>perform('clone')}>Create authorized voice</Button></>}</>}
          {cloud&&<div className="space-y-2 border-t border-[#405749] pt-4">{session?<div className="flex flex-wrap gap-2"><Button disabled={!take.blob||Boolean(busy)} onClick={cloudSave}>Back up selected audio</Button><Button variant="outline" disabled={Boolean(busy)} onClick={cloudLoad}>Load private library</Button><Button variant="outline" onClick={()=>cloud.auth.signOut()}>Sign out</Button></div>:<><label>Email for private backup<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><Button onClick={async()=>{const result=await cloud.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});setNotice(result.error?.message||'Check your email for a sign-in link.');}}>Send sign-in link</Button></>}</div>}
        </>}
        {tab==='Personality'&&<>
          <div className="kicker">03 / Capture the little things</div><h2 className="display text-4xl">How do you say it?</h2><p className="text-[#bcd1c4]">The details you supply guide the draft. Use your own jokes, nicknames and memories.</p>
          <label>What joke would they recognize as yours?<textarea rows={3} value={joke} onChange={e=>setJoke(e.target.value)}/></label>
          <label>What do you want them to remember? How do you usually tell them?<textarea rows={4} value={memory} onChange={e=>setMemory(e.target.value)}/></label>
          <div className="flex flex-wrap gap-2"><Button onClick={()=>{localStorage.setItem('evervoice-interview',JSON.stringify({joke,memory}));setNotice('Personality notes saved on this device.');}}>Save notes</Button><Button variant="outline" disabled={Boolean(busy)} onClick={()=>perform('draft')}><Sparkles size={16}/> Draft with Gemini</Button></div>
          <p className="text-sm text-[#bcd1c4]">Gemini receives the interview notes and occasion when you ask for a draft.</p>
        </>}
        {tab==='Family film'&&<>
          <div className="kicker">04 / A moment for someone</div><h2 className="display text-4xl">Family film.</h2><p className="text-[#bcd1c4]">Preview a keepsake with the selected message. Pick an original recording or approved synthetic audio to include sound.</p>
          <Player key={take.id} component={FamilyMessage} inputProps={{recipient:take.recipient,occasion:take.occasion,words:take.words,audioUrl}} durationInFrames={Math.max(30,Math.ceil(duration*30))} compositionWidth={960} compositionHeight={540} fps={30} controls style={{width:'100%',borderRadius:16,overflow:'hidden'}}/>
          <Button variant="outline" onClick={exportProps}><Film size={16}/> Download film settings</Button>
        </>}
        <details className="border-t border-[#405749] pt-4"><summary className="cursor-pointer text-sm"><Lock size={14} className="inline"/> Studio access for AI tools</summary><label className="mt-2">Studio access code<input type="password" autoComplete="off" value={code} onChange={e=>setCode(e.target.value)}/></label></details>
        <p role="status" className="min-h-6 break-words text-sm text-[#d6f09c]">{busy?'Working…':recording?'Recording now…':notice}</p>
      </section>
    </div>
    <aside className="mt-6 grid gap-3 rounded-2xl border border-[#405749] p-5 sm:grid-cols-[1fr_auto]"><div><div className="kicker">The case for everyday communication</div><p className="mt-2 text-sm text-[#bcd1c4]">Alex stopped giving his afternoon recap as speaking became more effortful. A saved message gives him another way to deliver it.</p></div><div className="self-center"><span className="display text-3xl">165 → 118</span><span className="ml-2 text-xs text-[#bcd1c4]">words/min, 9 a.m. → 4 p.m.</span></div></aside>
  </main>;
}
