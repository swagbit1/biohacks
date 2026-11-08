'use client';
import dynamic from 'next/dynamic';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AudioLines,Mic,Square,Film,Sparkles,Upload,Lock} from 'lucide-react';
import {createClient,type Session} from '@supabase/supabase-js';
import {Player} from '@remotion/player';
import {Button} from '../../components/button';
import {StudioPlayer} from '../../components/studio-player';
import {localBank} from '../../components/studio-bank';
import {GlideEntry} from '../../components/glide-entry';
import {VoiceEntry} from '../../components/voice-entry';
import {ExtraStories,savedPreservationNotes} from '../../components/preservation-notes';
import {EventVideos} from '../../components/event-videos';
import {insertGlideSentence} from '../../speechgen/lib/insertSentence';
const GlideTyping=dynamic(()=>import('../../speechgen/components/GlideTyping'),{ssr:false});
import TripoPanel,{packAsset,type SavedPack} from '../../components/tripo-panel';
import {demoMessages} from '../../components/demo-messages';
import {audioPauses,direction,timeline,type Tone,type Backdrop} from '../../components/scene-direction';
const TripoViewer=dynamic(()=>import('../../components/tripo-viewer'),{ssr:false});
import type {Motion} from '../../components/avatar';
import {FamilyMessage} from '../../video/message';
const Avatar = dynamic(
  () => import('../../components/avatar'),
  { ssr: false, loading: () => <div className="h-72 sm:h-96"/> }
);const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const cloud=url&&key?createClient(url,key):null;
const cinematicScript="Maya, look at you! A graduate. I always knew you'd go far, kiddo. I just hoped it'd be somewhere with free parking.\n\nOkay, seriously. I'm so proud of you. I know how much work went into getting here, including all the stuff nobody sees when you walk across that stage. Take a second. Look around. Let yourself enjoy this. You earned it.\n\nAnd when people ask what comes next? It's okay to say you don't know yet. Be curious. Ask the awkward question. Call home when you need a familiar voice. And if your first plan doesn't work, try another. That's basically the scientific method. See? I got biology into your graduation speech.\n\nWherever you go next, I hope you find good people, work that matters to you and, if we're really lucky, free parking. I love you, Maya. Congratulations!";
const demo='Maya, look at you. I always knew you would go far. I just hoped it would be somewhere with free parking. Seriously, kiddo. I am so proud of you.';
const recap="Okay, before you go! Quick recap. Mitochondria are the powerhouse of the cell. The real powerhouse of this room? Whoever remembered to plug in my laptop. Thank you. See you tomorrow!";
type EnrolledVoice={id:string;name:string;requiresVerification:boolean;prepareSamples?:boolean};
const voiceStorageKey='evervoice-enrolled-voice';
type Alignment={characters:string[];character_end_times_seconds:number[]};
type Take={id:string;title:string;recipient:string;occasion:string;words:string;mood:string;source:'Original recording'|'Approved synthetic'|'Device voice demo'|'Event draft';blob?:Blob;alignment?:Alignment;sampleId?:string;eventId?:string};
type StudioEvent={id:string;occasion:string;recipient:string;date:string;words:string;mood:string;future?:boolean;sampleVoiceId?:string};
type SampleDraft={title:string;recipient:string;words:string};
const demoTake:Take={id:'demo',title:'For Maya, on graduation day',recipient:'Maya',occasion:'Graduation day',words:demo,mood:'Playful',source:'Device voice demo'};
export default function Studio(){
  const [savedPack,setSavedPack]=useState<SavedPack>();
  const [front,setFront]=useState<'x'|'z'>();
  const [cameraReset,setCameraReset]=useState(0);
  const [tone,setTone]=useState<Tone>(),[backdrop,setBackdrop]=useState<Backdrop>();
  const [pauses,setPauses]=useState<number[]>([]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/avatar',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(pack=>{
      if(pack?.assets?.includes('rig')&&localStorage.getItem('evervoice-disabled-pack')!==pack.key)setSavedPack(pack);
    }).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  const activatePack=useCallback((pack:SavedPack)=>{
    localStorage.removeItem('evervoice-disabled-pack');
    setSavedPack(pack);
  },[]);
  const [model,setModel]=useState<Blob>(),[modelUrl,setModelUrl]=useState('');
  useEffect(()=>{
    if(!('caches' in window))return;
    let active=true;
    caches.open('evervoice-avatar-v1').then(cache=>cache.match('/saved-avatar.glb')).then(file=>file?.blob()).then(blob=>{if(active&&blob)setModel(blob);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  const saveModel=useCallback((blob:Blob)=>{
    setModel(blob);
    setSavedPack(undefined);
    if('caches' in window)void caches.open('evervoice-avatar-v1').then(cache=>cache.put('/saved-avatar.glb',new Response(blob))).catch(()=>setNotice('Avatar opened, but browser storage is unavailable. Save the GLB for later.'));
  },[]);

  useEffect(()=>{
    if(!model){setModelUrl('');return;}
    const objectUrl=URL.createObjectURL(model);setModelUrl(objectUrl);
    return ()=>URL.revokeObjectURL(objectUrl);
  },[model]);
  const [tab,setTab]=useState('Message studio'),[take,setTake]=useState<Take>(demoTake),[bank,setBank]=useState<Take[]>([]);
  const [cinemaReady,setCinemaReady]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    Promise.all(['standing-relax.glb','greeting.glb','idle.glb','maya-graduation.wav'].map(name=>fetch('/avatar-testing-assets/'+name,{method:'HEAD',signal:controller.signal}))).then(results=>setCinemaReady(results.every(result=>result.ok))).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  const demoId=take.sampleId||(take.source==='Device voice demo'?take.id:undefined);
  const sample=demoMessages.find(item=>item.id===take.id);
  const originalMaya=cinemaReady&&take.id==='demo';
  const transcript=originalMaya?cinematicScript:take.words;
  const savedBase=savedPack?.assets.includes('idle')?'idle':savedPack?.assets.includes('rig')?'rig':'mesh';
  const avatarUrl=savedPack?packAsset(savedPack.key,savedBase):modelUrl||(cinemaReady?'/avatar-testing-assets/standing-relax.glb':'');
  const scene=direction(transcript,take.occasion,tone,backdrop);
  const stageClips=savedPack?{
    greeting:savedPack.assets.includes('greeting')?packAsset(savedPack.key,'greeting'):undefined,
    agree:savedPack.assets.includes('agree')?packAsset(savedPack.key,'agree'):undefined,
    walk:savedPack.assets.includes('walk')?packAsset(savedPack.key,'walk'):undefined,
  }:!modelUrl&&cinemaReady?{greeting:'/avatar-testing-assets/greeting.glb',accent:'/avatar-testing-assets/idle.glb'}:{};

  const [recordedUrl,setAudioUrl]=useState(''),[playing,setPlaying]=useState(false),[duration,setDuration]=useState(15);
  const [recipient,setRecipient]=useState('Maya'),[occasion,setOccasion]=useState('Graduation day'),[words,setWords]=useState(demo),[mood,setMood]=useState('Warm');
  const [events,setEvents]=useState<StudioEvent[]>([]);
  const [eventId,setEventId]=useState<string>();
  const [eventName,setEventName]=useState('');
  const [eventRecipient,setEventRecipient]=useState('');
  const [eventDate,setEventDate]=useState('');
  const activeEvent=events.find(item=>item.id===eventId);
  const [styleExamples,setStyleExamples]=useState('');
  const [profileContext,setProfileContext]=useState<Record<string,unknown>>({});
  const [videoBusy,setVideoBusy]=useState(false);
  const [glideOpen,setGlideOpen]=useState(false);
  const messageEditor=useRef<HTMLTextAreaElement>(null);
  const draftCursor=useRef<number | undefined>(undefined);
  const [replacementId,setReplacementId]=useState<string>();
  const [joke,setJoke]=useState(''),[memory,setMemory]=useState('');
  const [recording,setRecording]=useState(false),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[code,setCode]=useState(''),[consent,setConsent]=useState(false),[cloneConsent,setCloneConsent]=useState(false);
  const [prepareSamples,setPrepareSamples]=useState(false);
  const [sampleProgress,setSampleProgress]=useState('');
  const [cloneIds,setCloneIds]=useState<string[]>([]);
  const [voiceName,setVoiceName]=useState('Alex');
  const [enrolledVoice,setEnrolledVoice]=useState<EnrolledVoice>();
  const selectedSamples=bank.filter(item=>cloneIds.includes(item.id)&&item.source==='Original recording'&&item.blob);
  const sampleBytes=selectedSamples.reduce((total,item)=>total+(item.blob?.size ?? 0),0);
  const [localStudio,setLocalStudio]=useState(false);
  const [email,setEmail]=useState(''),[session,setSession]=useState<Session|null>(null);
  const player=useRef<HTMLAudioElement>(null), recorder=useRef<MediaRecorder>(null), audioGraph=useRef<{context:AudioContext;analyser:AnalyserNode;data:Uint8Array<ArrayBuffer>}|null>(null);
  const motion=useRef<Motion>({level:0,mood:'Warm',playing:false}), lastBoundary=useRef(0);
  useEffect(()=>{
    setLocalStudio(['localhost','127.0.0.1'].includes(location.hostname));
    localBank('readonly',s=>s.getAll()).then(items=>{
      setBank(items);
      const replacement=items.find(item=>item.sampleId==='demo'&&item.blob);
      if(replacement)setTake(current=>current===demoTake?replacement:current);
    }).catch(()=>setNotice('This browser could not open the local voice bank.'));
    localBank<StudioEvent[]>('readonly',s=>s.getAll(),'events').then(setEvents)
      .catch(()=>setNotice('This browser could not open saved events.'));
    try{
      const voice=JSON.parse(localStorage.getItem(voiceStorageKey) || 'null');
      if(typeof voice?.id==='string' && typeof voice.name==='string' && typeof voice.requiresVerification==='boolean')setEnrolledVoice(voice);
      const notes=JSON.parse(localStorage.getItem('evervoice-interview') || '{}');
      if(typeof notes.joke==='string')setJoke(notes.joke);
      if(typeof notes.memory==='string')setMemory(notes.memory);
      if(typeof notes.styleExamples==='string')setStyleExamples(notes.styleExamples);
      const profile=JSON.parse(localStorage.getItem('evervoice-profile') || '{}');
      setProfileContext({name:profile.name,traits:profile.traits,humour:profile.humour,phrases:profile.phrases,lovedOnes:profile.lovedOnes});
    }catch{}
    if(!cloud)return;
    const {data}=cloud.auth.onAuthStateChange((_event,session)=>setSession(session));
    return ()=>data.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    const refresh=()=>{void localBank<Take[]>('readonly',store=>store.getAll()).then(setBank).catch(()=>setNotice('Could not refresh Voice bank.'));};
    window.addEventListener('evervoice-bank-changed',refresh);
    return ()=>window.removeEventListener('evervoice-bank-changed',refresh);
  },[]);
  const sampleAudio=sample?'/demo-messages/'+sample.id+'.wav':
    originalMaya?'/avatar-testing-assets/maya-graduation.wav':
    take.id==='recap'?'/demo-messages/classroom-recap.wav':'';
  const audioUrl=sampleAudio||recordedUrl;
  const cues=useMemo(()=>timeline(transcript,duration,scene.tone,take.alignment?.character_end_times_seconds,pauses),[transcript,duration,scene.tone,take.alignment,pauses]);
  useEffect(()=>{
    setPauses([]);
    if(!take.blob||take.alignment)return;
    let active=true;
    audioPauses(take.blob).then(values=>{if(active)setPauses(values);}).catch(()=>{});
    return ()=>{active=false;};
  },[take.blob,take.alignment]);
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
  function open(next:Take){stop();draftCursor.current=undefined;setReplacementId(undefined);setConsent(false);setCloneConsent(false);setDuration(15);setTone(undefined);setBackdrop(undefined);setTake(next);}
  async function saveEvent(event:StudioEvent){
    await localBank('readwrite',s=>s.put(event),'events');
    setEvents(current=>[event,...current.filter(item=>item.id!==event.id)]);
  }
  function editEvent(event:StudioEvent,selectedTake?:Take){
    open(selectedTake||bank.find(item=>item.eventId===event.id)||{
      id:event.id,title:event.occasion,recipient:event.recipient,occasion:event.occasion,
      words:event.words,mood:event.mood,source:'Event draft',eventId:event.id,
    });
    setEventId(event.id);
    setRecipient(event.recipient);
    setOccasion(event.occasion);
    setWords(event.words);
    setMood(event.mood);
    setTab('Message studio');
  }
  async function createEvent(){
    if(!eventName.trim()||!eventRecipient.trim())return;
    const event={id:crypto.randomUUID(),occasion:eventName.trim(),recipient:eventRecipient.trim(),date:eventDate,words:'',mood:'Warm',future:tab==='Future messages'};
    setBusy('event');
    try{
      await saveEvent(event);
      setEventName('');setEventRecipient('');setEventDate('');
      editEvent(event);
      setNotice('Event created. Write, glide type, or record your message.');
    }catch{setNotice('Could not create the event on this device.');}finally{setBusy('');}
  }
  async function saveEventDraft(){
    if(!activeEvent||!occasion.trim()||!recipient.trim())return;
    setBusy('event');
    try{
      await saveEvent({...activeEvent,occasion:occasion.trim(),recipient:recipient.trim(),words,mood});
      setNotice('Event draft saved on this device.');
    }catch{setNotice('Could not save the event draft.');}finally{setBusy('');}
  }
  function openSample(next:Take){
    setEventId(undefined);
    open(bank.find(item=>item.sampleId===next.id&&item.blob)||next);
  }
  function insertGlideText(sentence:string){
    if(busy)return false;
    const result=insertGlideSentence(words,sentence,draftCursor.current);
    if(!result.ok){
      setNotice('The message has room for '+result.remaining+' more characters. Shorten the draft or Glide sentence and try again.');
      return false;
    }
    setWords(result.text);
    setConsent(false);
    setNotice('Glide sentence inserted. Review the message before generating speech.');
    requestAnimationFrame(()=>{
      messageEditor.current?.focus();
      messageEditor.current?.setSelectionRange(result.caret,result.caret);
      draftCursor.current=result.caret;
    });
    return true;
  }
  function editSample(){
    setEventId(undefined);
    setReplacementId(demoId);
    setRecipient(take.recipient);
    setOccasion(take.occasion);
    setMood(take.mood);
    setWords(transcript);
    setConsent(false);
    setTab('Message studio');
  }
  function play(){
    if(playing){stop();return;}
    if(audioUrl){void player.current?.play().catch(()=>setNotice('Playback failed. Try playing the message again.'));return;}
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
    return {id:crypto.randomUUID(),title:recipient?'For '+recipient+' · '+(occasion||'Personal message'):occasion||'Personal message',recipient,occasion,words,mood,source,blob,alignment,eventId};
  }
  async function capture(){
    let stream:MediaStream|undefined;
    setBusy('microphone');
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mic=new MediaRecorder(stream), chunks:Blob[]=[];
      recorder.current=mic;
      mic.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      mic.onstop=()=>{
        stream?.getTracks().forEach(track=>track.stop());
        setRecording(false);
        if(chunks.length){
          setBusy('recording');
          void saveLocal(makeTake(new Blob(chunks,{type:mic.mimeType}),'Original recording'))
            .then(()=>setNotice('Original recording saved on this device.'))
            .catch(()=>setNotice('Could not save the recording.'))
            .finally(()=>setBusy(''));
        }
      };
      mic.start();setRecording(true);
    }catch{stream?.getTracks().forEach(track=>track.stop());setNotice('Microphone unavailable. Import an audio file instead.');}finally{setBusy('');}
  }
  async function api(action:string,payload:FormData|object){
    const response=await fetch('/api/'+action,{method:'POST',headers:{'x-studio-code':code,...(payload instanceof FormData?{}:{'Content-Type':'application/json'})},body:payload instanceof FormData?payload:JSON.stringify(payload)});
    const result=await response.json();
    if(!response.ok)throw Error(result.error || 'The request failed.');
    return result;
  }
  function storeVoice(voice:EnrolledVoice){
    setEnrolledVoice(voice);
    setConsent(false);
    try{
      localStorage.setItem(voiceStorageKey,JSON.stringify(voice));
      return true;
    }catch{return false;}
  }
  async function preparePersonalSamples(voice:EnrolledVoice){
    if(voice.requiresVerification)return;
    setBusy('samples');
    setTab('Future messages');
    setNotice('');
    try{
      const savedEvents=await localBank<StudioEvent[]>('readonly',s=>s.getAll(),'events');
      let samples=savedEvents.filter(item=>item.sampleVoiceId===voice.id);
      if(samples.length!==10){
        setSampleProgress('Drafting ten messages with Gemini…');
        const {drafts}=await api('draft-samples',{text:JSON.stringify({
          profile:JSON.stringify(profileContext).slice(0,1800),
          memories:memory.slice(0,650),joke:joke.slice(0,350),speakingExamples:savedPreservationNotes().slice(0,2200),
        })}) as {drafts:SampleDraft[]};
        samples=drafts.map((draft,index)=>({
          id:'personal-'+voice.id+'-'+index,
          occasion:draft.title,recipient:draft.recipient,words:draft.words,
          mood:'Warm',date:'',future:true,sampleVoiceId:voice.id,
        }));
        // Commit the whole set before making any paid speech requests.
        await localBank('readwrite',store=>{
          for(const sample of samples.slice(0,-1))store.put(sample);
          return store.put(samples[samples.length-1]);
        },'events');
        setEvents(current=>[...samples,...current.filter(item=>item.sampleVoiceId!==voice.id)]);
      }
      const savedTakes=await localBank<Take[]>('readonly',s=>s.getAll());
      let ready=0;
      for(const sample of samples){
        if(!savedTakes.some(item=>item.eventId===sample.id&&item.source==='Approved synthetic'&&item.blob)){
          setSampleProgress('Preparing audio · '+ready+' of 10 ready');
          const result=await api('speak',{text:sample.words,approved:true,voiceId:voice.id,requiresEnrolledVoice:true,expression:sample.mood});
          const bytes=Uint8Array.from(atob(result.audio),char=>char.charCodeAt(0));
          const next:Take={
            id:crypto.randomUUID(),title:sample.occasion,recipient:sample.recipient,
            occasion:sample.occasion,words:sample.words,mood:sample.mood,
            source:'Approved synthetic',eventId:sample.id,
            blob:new Blob([bytes],{type:'audio/mpeg'}),alignment:result.alignment,
          };
          await localBank('readwrite',s=>s.put(next));
          setBank(current=>[next,...current]);
        }
        ready++;
      }
      setNotice('All ten personalized messages are ready to play or download.');
    }catch(error){
      setNotice((error instanceof Error?error.message:'Could not prepare messages.')+' Saved messages are kept. Use Prepare missing audio to resume.');
    }finally{
      setSampleProgress('');
      setBusy('');
    }
  }
  useEffect(()=>{
    if(!enrolledVoice||enrolledVoice.requiresVerification||!localStudio)return;
    try{
      if(sessionStorage.getItem('evervoice-prepare-onboarding')!==enrolledVoice.id)return;
      sessionStorage.removeItem('evervoice-prepare-onboarding');
    }catch{return;}
    void preparePersonalSamples(enrolledVoice);
  });
  async function perform(action:string){
    setBusy(action);setNotice('');
    try{
      if(action==='draft'){
        const result=await api('draft',{text:JSON.stringify({
          recipient,occasion,mood,date:activeEvent?.date,
          profile: Object.fromEntries(Object.entries(profileContext).map(([field,value])=>[
            field,Array.isArray(value)?value.filter(item=>typeof item==='string').slice(0,12).map(item=>item.slice(0,40)):
              typeof value==='string'?value.slice(0,250):undefined,
          ])),
          memories:memory.slice(0,650),joke:joke.slice(0,350),
          speakingExamples:savedPreservationNotes().slice(0,1800),occasionNotes:activeEvent?words.slice(0,350):undefined,
        })});
        if(activeEvent)await saveEvent({...activeEvent,recipient,occasion,words:result.text,mood});
        draftCursor.current=undefined;
        setWords(result.text);setConsent(false);setTab('Message studio');setNotice('Draft ready. Read and edit it before approving.');
      }else if(action==='speak'){
        if(activeEvent&&(!enrolledVoice||enrolledVoice.requiresVerification)){
          setNotice('Preserve and verify your voice in Voice bank before generating an event message.');
          return;
        }
        if(activeEvent)await saveEvent({...activeEvent,recipient,occasion,words,mood});
        const result=await api('speak',{text:words,approved:consent,voiceId:enrolledVoice?.id,requiresEnrolledVoice:Boolean(activeEvent),expression:mood});
        const bytes=Uint8Array.from(atob(result.audio),char=>char.charCodeAt(0));
        const generated=makeTake(new Blob([bytes],{type:'audio/mpeg'}),'Approved synthetic',result.alignment);
        if(replacementId){
          generated.id=bank.find(item=>item.sampleId===replacementId)?.id||generated.id;
          generated.sampleId=replacementId;
          generated.title=take.title;
        }
        await saveLocal(generated);
        setNotice(replacementId?'ElevenLabs audio now plays for this sample.':'Approved audio saved. Press play to hear it.');
      }else if(action==='clone' || ((action==='transcribe'||action==='personality-transcribe') && take.blob)){
        const form=new FormData();
        const samples=action==='clone'?selectedSamples:[take];
        for(const sample of samples){
          const audio=sample.blob;
          if(audio)form.append('audio',audio,'evervoice.'+(audio.type.includes('mp4')?'m4a':audio.type.includes('mpeg')?'mp3':audio.type.includes('wav')?'wav':'webm'));
        }
        if(action==='clone'){
          form.set('consent',cloneConsent?'yes':'no');
          form.set('name',voiceName.trim());
        }
        const result=await api(action==='personality-transcribe'?'transcribe':action,form);
        if(action==='personality-transcribe'){
          setStyleExamples(current=>[current,result.text].filter(Boolean).join('\n\n').slice(0,1800));
          setTab('Personality');
          setNotice('Review the transcript, remove anything private, then save your notes.');
        }else if(action==='transcribe'){
          draftCursor.current=undefined;
          setWords(result.text);
          setConsent(false);
          setTab('Message studio');
          setNotice('Transcript added to the editor. Review it before use.');
        }else{
          const voice={id:result.voiceId,name:voiceName.trim(),requiresVerification:result.requiresVerification,prepareSamples};
          const saved=storeVoice(voice);
          setCloneIds([]);
          setCloneConsent(false);
          setNotice((result.requiresVerification?'Complete verification in ElevenLabs before generating speech.':'Voice ready for approved messages on any avatar.')+(!saved?' Browser storage was unavailable. Save this voice ID: '+result.voiceId:''));
          if(prepareSamples&&!voice.requiresVerification)await preparePersonalSamples(voice);
        }
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
    const props={recipient:take.recipient,occasion:take.occasion,words:transcript,audioUrl:sampleAudio?location.origin+audioUrl:audioUrl?'http://localhost:3000/authorized-take.'+extension:'',seconds:duration};
    const file=URL.createObjectURL(new Blob([JSON.stringify(props,null,2)],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=file;link.download='film-props.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(file),1000);
  }
  const personalSamples=events.filter(item=>item.sampleVoiceId&&item.sampleVoiceId===enrolledVoice?.id);
  const samplesReady=personalSamples.filter(sample=>bank.some(item=>item.eventId===sample.id&&item.source==='Approved synthetic'&&item.blob)).length;
  const tabs=[
    ['Message studio','text'],['My Events','events'],['Future messages','heart'],
    ['Voice bank','voice'],['Personality','memories'],['Family film','film'],['Photo avatar','avatar'],
  ] as const;
  const eventForm=(
    <form onSubmit={e=>{e.preventDefault();void createEvent();}}>
      <label>Event name<input required maxLength={100} placeholder="Our anniversary" value={eventName} onChange={e=>setEventName(e.target.value)}/></label>
      <GlideEntry code={code} label="event name" value={eventName} onChange={setEventName} maxLength={100}/>
      <label>Recipient<input required maxLength={100} placeholder="Jordan" value={eventRecipient} onChange={e=>setEventRecipient(e.target.value)}/></label>
      <GlideEntry code={code} label="event recipient" value={eventRecipient} onChange={setEventRecipient} maxLength={100}/>
      <label>Date (optional)<input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)}/></label>
      <Button icon="add" type="submit" disabled={Boolean(busy)||!eventName.trim()||!eventRecipient.trim()}>Create event</Button>
    </form>
  );
  return <main className="studio-shell mx-auto max-w-[1600px] px-4 pb-4 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#405749] py-3">
      <div className="flex items-center gap-3 font-semibold tracking-wide"><span className="rounded-full bg-[#d6f09c] p-2 text-[#18261e]"><AudioLines size={20}/></span> EverVoice <span className="kicker">Studio</span></div>
      <span className="kicker">BioHacks 2026 · Quality of Life</span>
    </header>
    <nav aria-label="Studio sections" className="studio-nav flex flex-wrap gap-2 py-2">{tabs.map(([item,icon])=><Button icon={icon} key={item} disabled={Boolean(busy)||recording||videoBusy} aria-pressed={tab===item} variant={tab===item?'default':'outline'} onClick={()=>setTab(item)}>{item}</Button>)}</nav>
    <div className="studio-workspace grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <StudioPlayer title={take.title} source={sampleAudio?'ElevenLabs synthetic voice':take.source}
        backdrop={scene.backdrop} audio={player} audioUrl={audioUrl} playing={playing} onToggle={play}
        media={<audio ref={player} src={audioUrl||undefined} hidden onPlay={connectAudio} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onLoadedMetadata={event=>{const value=event.currentTarget.duration;setDuration(Number.isFinite(value)?value:15);}}/>}
        options={<>
          <details><summary>Read transcript</summary><p className="whitespace-pre-line">{transcript}</p></details>
          {audioUrl&&<a className="block py-2 underline" href={audioUrl} download>Download audio</a>}
        {avatarUrl&&<div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-sm">Drag to orbit. Scroll or pinch to zoom.</span><Button icon="reset" variant="outline" onClick={()=>setCameraReset(value=>value+1)}>Reset camera</Button>{(modelUrl||savedPack)&&<Button icon="camera" variant="outline" onClick={()=>setFront((front||(savedPack?'x':'z'))==='x'?'z':'x')}>Change facing</Button>}</div>}
        {demoId==='personal-wishes'&&<p className="mt-2 text-sm">Fictional personal wishes sample. Separate from any legal will.</p>}
        <details className="mt-3"><summary>Scene direction</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label>Tone<select value={tone||''} onChange={e=>setTone(e.target.value as Tone||undefined)}><option value="">Automatic · {scene.tone}</option><option>celebratory</option><option>warm</option><option>reflective</option></select></label>
          <label>Backdrop<select value={backdrop||''} onChange={e=>setBackdrop(e.target.value as Backdrop||undefined)}><option value="">Automatic · {scene.backdrop.replaceAll('-',' ')}</option><option value="living-room">Living room</option><option value="reception">Reception</option><option value="kitchen">Kitchen</option><option value="study">Study</option></select></label>
        </div></details>
          {(modelUrl||savedPack)&&<Button icon="avatar" variant="outline" onClick={()=>{if(savedPack)localStorage.setItem('evervoice-disabled-pack',savedPack.key);setSavedPack(undefined);setModel(undefined);if('caches' in window)void caches.open('evervoice-avatar-v1').then(cache=>cache.delete('/saved-avatar.glb')).catch(()=>{});}}>Use demo avatar</Button>}
        {demoId&&<Button icon="voice" className="mt-2" variant="outline" disabled={Boolean(busy)||recording||videoBusy} onClick={editSample}>Replace sample voice with ElevenLabs</Button>}
        </>}>
          {avatarUrl?<TripoViewer key={avatarUrl} url={avatarUrl} motion={motion} cinematic={{audio:player,clips:stageClips,cues,tone:scene.tone,front:front||(savedPack||!modelUrl?'x':'z'),reset:cameraReset}}/>:<Avatar motion={motion}/>}
      </StudioPlayer>
      <section className="panel studio-pane min-w-0 space-y-2" aria-label={tab}>
        {tab==='Message studio'&&<>
          <h1 className="display text-2xl">Message studio</h1>
          {activeEvent&&<div className="rounded-xl border border-[var(--border)] p-4">
            <p className="font-semibold">{activeEvent.occasion}{activeEvent.future?' · Future message':''}</p>
            {(!enrolledVoice||enrolledVoice.requiresVerification)&&<p className="text-sm">Preserve and verify your voice before generating this message.</p>}
            {(!enrolledVoice||enrolledVoice.requiresVerification)&&<Button icon="record" variant="outline" disabled={Boolean(busy)||recording} onClick={()=>setTab('Voice bank')}>Set up my voice</Button>}
            <Button variant="outline" disabled={Boolean(busy)||recording||!occasion.trim()||!recipient.trim()} onClick={()=>perform('draft')}><Sparkles size={16}/> Draft from my personality</Button>
            {activeEvent.date&&<p className="text-sm text-[var(--muted)]">{activeEvent.date}</p>}
            <Button icon="save" variant="outline" disabled={Boolean(busy)||recording||!occasion.trim()||!recipient.trim()} onClick={saveEventDraft}>Save event draft</Button>
            <Button icon="add" variant="outline" disabled={Boolean(busy)||recording||videoBusy} onClick={()=>{setEventId(undefined);open(demoTake);setRecipient('');setOccasion('');setWords('');setMood('Warm');}}>Start a separate message</Button>
          </div>}
          <div className="grid grid-cols-2 gap-2">
            <label>Recipient<input maxLength={100} disabled={Boolean(busy)} value={recipient} onChange={e=>setRecipient(e.target.value)}/></label>

            <label>Occasion<input maxLength={100} disabled={Boolean(busy)} value={occasion} onChange={e=>setOccasion(e.target.value)}/></label>

          </div>
          <details className="studio-options">
            <summary>Glide or record event details</summary>
            <GlideEntry code={code} label="recipient" value={recipient} onChange={setRecipient} maxLength={100} disabled={Boolean(busy)}/>
            <GlideEntry code={code} label="occasion" value={occasion} onChange={setOccasion} maxLength={100} disabled={Boolean(busy)}/>
          </details>
          <label>Message or transcript<textarea ref={messageEditor} rows={3} maxLength={3500} disabled={Boolean(busy)} value={words}
            onSelect={e=>{draftCursor.current=e.currentTarget.selectionStart;}}
            onBlur={e=>{draftCursor.current=e.currentTarget.selectionStart;}}
            onChange={e=>{draftCursor.current=e.currentTarget.selectionStart;setWords(e.target.value);setConsent(false);}}/></label>
          <Button icon="glide" variant="outline" aria-expanded={glideOpen} aria-controls="studio-glide" onClick={()=>setGlideOpen(!glideOpen)}>Glide type</Button>
          {glideOpen&&<div id="studio-glide"><GlideTyping insertLabel="Insert into message" onSentenceReady={insertGlideText}/></div>}
          <details className="studio-options">
            <summary>Recording and voice options</summary>
          <VoiceEntry label="message" code={code} disabled={Boolean(busy)||recording||videoBusy} onInsert={insertGlideText}/>
          <label className="block">Voice delivery<select value={mood} onChange={e=>setMood(e.target.value)}><option value="Warm">Warm · conversational</option><option value="Playful">Playful · more animated</option><option value="Serious">Serious · slower and steadier</option></select></label>
          <div className="flex flex-wrap gap-2"><Button disabled={recording||Boolean(busy)||videoBusy} onClick={capture}><Mic size={16}/> Record original</Button><Button variant="outline" disabled={!recording} onClick={()=>recorder.current?.stop()}><Square size={16}/> Stop &amp; save</Button></div>
          <label><span><Upload size={15} className="inline"/> Import original audio</span><input type="file" accept="audio/*" disabled={recording||Boolean(busy)} onChange={e=>{const file=e.target.files?.[0];if(file)void saveLocal(makeTake(file,'Original recording')).catch(()=>setNotice('Import failed.'));e.target.value='';}}/></label>
          {!enrolledVoice&&!activeEvent&&<Button icon="record" variant="outline" disabled={Boolean(busy)||recording} onClick={()=>setTab('Voice bank')}>Preserve my voice</Button>}
          <p className="text-sm">Voice for this avatar: {enrolledVoice?enrolledVoice.name+(enrolledVoice.requiresVerification?' (verification required)':''):'Studio default'}</p>
          </details>
          <label className="flex items-start gap-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I approve this wording and authorize using the studio’s preserved voice.</label>
          <Button variant="outline" disabled={!consent||!words.trim()||recording||Boolean(busy)||enrolledVoice?.requiresVerification||Boolean(activeEvent&&(!enrolledVoice||!occasion.trim()||!recipient.trim()))} onClick={()=>perform('speak')}><AudioLines size={16}/> {replacementId?'Generate ElevenLabs replacement':'Generate preserved voice'}</Button>
          {activeEvent&&<EventVideos key={activeEvent.id} eventId={activeEvent.id} disabled={Boolean(busy)||recording} onBusy={setVideoBusy}/>}
          {activeEvent&&<div className="border-t border-[var(--border)] pt-3">
            <h3 className="font-semibold">Event recordings</h3>
            {bank.filter(item=>item.eventId===eventId).map((item,index)=><div key={item.id}>
              <Button icon="voice" variant="outline" aria-pressed={take.id===item.id} disabled={Boolean(busy)||recording} onClick={()=>open(item)}>Take {index+1} · {item.source}</Button>
            </div>)}
            {take.eventId===eventId&&take.source==='Original recording'&&take.blob&&
              <Button icon="text" variant="outline" disabled={Boolean(busy)||recording} onClick={()=>perform('transcribe')}>Transcribe with ElevenLabs</Button>}
          </div>}
        </>}
        {(tab==='My Events'||tab==='Future messages')&&<>
          <h2 className="display text-4xl">{tab}</h2>
          <p className="text-sm text-[var(--muted)]">{tab==='Future messages'
            ?'Prepare a message for a future milestone. Review and generate it now, then download the audio to keep or share with family.'
            :'Create an event and keep its draft and recordings on this device.'}</p>
        </>}
        {tab==='Voice bank'&&<>
          <div className="kicker">02 / Keep your originals</div><h2 className="display text-4xl">The voice bank.</h2>
          <p className="text-[#bcd1c4]">Recordings are stored in this browser unless you choose private cloud backup.</p>
          <div className="flex flex-wrap gap-2"><Button icon="open" variant="outline" onClick={()=>openSample(demoTake)}>Maya’s graduation</Button><Button icon="open" variant="outline" onClick={()=>{
            const replacement=bank.find(item=>item.sampleId==='recap'&&item.blob);
            const next=replacement||{...demoTake,id:'recap',title:'Alex’s classroom recap',recipient:'Class',occasion:'Biology recap',mood:'Playful',words:recap};
            setEventId(undefined);
            open(next);
            setReplacementId('recap');
            setRecipient(next.recipient);setOccasion(next.occasion);setMood(next.mood);setWords(next.words);setTab('Message studio');
          }}>Classroom recap</Button></div>
          {bank.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#405749] pt-3"><div><div>{item.title}</div><small className="text-[#bcd1c4]">{item.source}</small></div><div className="flex gap-2"><Button icon="open" variant="outline" onClick={()=>{
            const event=events.find(entry=>entry.id===item.eventId);
            if(event)editEvent(event,item);
            else{setEventId(undefined);open(item);}
          }}>Open</Button><Button icon="delete" variant="outline" onClick={()=>remove(item)}>Delete local</Button></div></div>)}
          {take.blob&&<Button icon="text" variant="outline" disabled={Boolean(busy)} onClick={()=>perform('transcribe')}>Transcribe selected audio</Button>}
          {take.source==='Original recording'&&take.blob&&<Button icon="text" variant="outline" disabled={Boolean(busy)} onClick={()=>perform('personality-transcribe')}>Transcribe for personality notes</Button>}
          <Button icon="record" variant="outline" disabled={Boolean(busy)} onClick={()=>setTab('Message studio')}>Record a voice sample</Button>
          <fieldset className="space-y-3" disabled={Boolean(busy)}>
            <legend>Create an authorized voice</legend>
            <label>Voice name<input value={voiceName} maxLength={80} onChange={e=>setVoiceName(e.target.value)}/></label>
            <GlideEntry code={code} label="voice name" value={voiceName} onChange={setVoiceName} maxLength={80} disabled={Boolean(busy)}/>
            <p className="text-sm">Record or import original takes in Message studio, then select the recordings to send to ElevenLabs. The combined limit is 4 MB. Use clean samples that sound like you in conversation. Try a warm greeting, a quick story, and a quieter line, with your usual pace and pauses.</p>
            {bank.filter(item=>item.source==='Original recording'&&item.blob).map(item=><label key={item.id} className="flex items-start gap-2">
              <input type="checkbox" checked={cloneIds.includes(item.id)} onChange={e=>{
                setCloneIds(e.target.checked?[...cloneIds,item.id]:cloneIds.filter(id=>id!==item.id));
                setCloneConsent(false);
              }}/>{item.title}
            </label>)}
            <p className="text-sm">{selectedSamples.length} selected · {(sampleBytes/1_000_000).toFixed(2)} MB</p>
            <label className="flex items-start gap-2"><input type="checkbox" checked={cloneConsent} onChange={e=>setCloneConsent(e.target.checked)}/> The speaker authorizes sending these recordings to ElevenLabs to create a synthetic voice.</label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={prepareSamples} onChange={e=>setPrepareSamples(e.target.checked)}/>
              Use my profile and speaking notes to prepare ten messages in my cloned voice as soon as it is ready. This sends notes to Gemini and uses ElevenLabs credits.
            </label>
            <Button icon="secure" variant="outline" disabled={!cloneConsent||!selectedSamples.length||sampleBytes>4_000_000||!voiceName.trim()} onClick={()=>perform('clone')}>Create authorized voice</Button>
          </fieldset>
          {enrolledVoice&&<p className="text-sm">Enrolled voice: {enrolledVoice.name} · {enrolledVoice.id}</p>}
          {enrolledVoice?.requiresVerification&&<Button icon="check" variant="outline" disabled={Boolean(busy)} onClick={()=>{
            const voice={...enrolledVoice,requiresVerification:false};
            const saved=storeVoice(voice);
            setNotice(saved?'Voice enabled for approved messages.':'Voice enabled for this session. Browser storage was unavailable.');
            if(voice.prepareSamples)void preparePersonalSamples(voice);
          }}>I completed verification in ElevenLabs</Button>}
          {cloud&&<div className="space-y-2 border-t border-[#405749] pt-4">{session?<div className="flex flex-wrap gap-2"><Button icon="save" disabled={!take.blob||Boolean(busy)} onClick={cloudSave}>Back up selected audio</Button><Button icon="open" variant="outline" disabled={Boolean(busy)} onClick={cloudLoad}>Load private library</Button><Button icon="next" variant="outline" onClick={()=>cloud.auth.signOut()}>Sign out</Button></div>:<><label>Email for private backup<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><Button icon="next" onClick={async()=>{const result=await cloud.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});setNotice(result.error?.message||'Check your email for a sign-in link.');}}>Send sign-in link</Button></>}</div>}
        </>}
        {tab==='Personality'&&<>
          <div className="kicker">03 / Capture the little things</div><h2 className="display text-4xl">How do you say it?</h2><p className="text-[#bcd1c4]">The details you supply guide the draft. Use your own jokes, nicknames and memories.</p>
          <label>What joke would they recognize as yours?<textarea rows={3} maxLength={350} value={joke} onChange={e=>setJoke(e.target.value)}/></label>
          <label>What do you want them to remember? How do you usually tell them?<textarea rows={4} maxLength={650} value={memory} onChange={e=>setMemory(e.target.value)}/></label>
          <GlideEntry code={code} label="joke" value={joke} onChange={setJoke} maxLength={350}/>
          <GlideEntry code={code} label="memories" value={memory} onChange={setMemory} maxLength={650}/>
          <label>Speaking examples or transcripts<textarea rows={5} maxLength={1800} value={styleExamples} onChange={e=>setStyleExamples(e.target.value)}/></label>
          <GlideEntry code={code} label="speaking examples" value={styleExamples} onChange={setStyleExamples} maxLength={1800}/>
          <div className="flex flex-wrap gap-2"><Button icon="save" onClick={()=>{
            try{
              const previous=JSON.parse(localStorage.getItem('evervoice-interview')||'{}');
              localStorage.setItem('evervoice-interview',JSON.stringify({...previous,joke,memory,styleExamples}));
              setNotice('Personality notes saved on this device.');
            }catch{setNotice('Could not save personality notes on this device.');}
          }}>Save notes</Button><Button variant="outline" disabled={Boolean(busy)} onClick={()=>perform('draft')}><Sparkles size={16}/> Draft with Gemini</Button></div>
          <ExtraStories code={code} disabled={Boolean(busy)}/>
          <p className="text-sm text-[var(--muted)]">When you ask for a draft, Gemini receives excerpts from your profile, notes and speaking examples. Use recordings from Voice bank to add editable transcripts.</p>
        </>}
        {tab==='Photo avatar'&&<TripoPanel code={code} onModel={saveModel} onPack={activatePack}/>}
        {tab==='Future messages'&&enrolledVoice&&<>
          <h3 className="display text-3xl">Your personalized messages</h3>
          <p className="text-sm text-[var(--muted)]">{samplesReady} of 10 ready. Audio is saved in this browser. Open a message to listen, review the wording, or download it.</p>
          {sampleProgress&&<p role="status">{sampleProgress}</p>}
          {samplesReady<10&&<p className="text-sm text-[var(--muted)]">Preparing the set uses your notes with Gemini and generates audio with ElevenLabs. Keep Studio open while it runs.</p>}
          {samplesReady<10&&<Button icon="draft" variant="outline" disabled={Boolean(busy)||enrolledVoice.requiresVerification} onClick={()=>void preparePersonalSamples(enrolledVoice)}>
            {personalSamples.length?'Prepare missing audio':'Prepare ten personalized messages'}
          </Button>}
          {personalSamples.map(sample=>{
            const prepared=bank.find(item=>item.eventId===sample.id&&item.source==='Approved synthetic'&&item.blob);
            return <article key={sample.id} className="border-t border-[var(--border)] pt-3">
              <h3 className="font-semibold">{sample.occasion}</h3>
              <p className="text-sm">For {sample.recipient} · {prepared?'Audio ready':'Draft'}</p>
              <Button icon="open" variant="outline" disabled={Boolean(busy)} onClick={()=>editEvent(sample,prepared)}>Open message</Button>
            </article>;
          })}
        </>}
        {tab==='Future messages'&&!enrolledVoice&&<>
          <div className="kicker">Fictional demo library</div><h3 className="display text-3xl">Messages for the moments that matter.</h3>
          <p>Choose a sample to play it on the Studio stage. A saved ElevenLabs replacement plays automatically.</p>
          <Button icon="open" variant="outline" onClick={()=>openSample(demoTake)}>Maya’s graduation</Button>
          {demoMessages.map(message=><div key={message.id} className="border-t border-[#405749] pt-3">
            <Button icon="voice" variant="outline" aria-pressed={demoId===message.id} onClick={()=>openSample({...message,source:'Device voice demo'})}>{message.title}</Button>
            {message.id==='personal-wishes'&&<p className="mt-1 text-sm">Personal wishes, separate from any legal will.</p>}
          </div>)}
        </>}
        {(tab==='My Events'||tab==='Future messages')&&<>
          {tab==='My Events'&&eventForm}

          {events.filter(event=>!event.sampleVoiceId&&Boolean(event.future)===(tab==='Future messages')).map(event=><article className="border-t border-[var(--border)] pt-3" key={event.id}>
            <h3 className="font-semibold">{event.occasion}</h3>
            <p className="text-sm text-[var(--muted)]">For {event.recipient}{event.date?' · '+event.date:''}</p>
            {event.future&&<p className="text-sm">{bank.some(item=>item.eventId===event.id&&item.source==='Approved synthetic'&&item.blob)?'Audio ready to play or download':'Draft · audio still needed'}</p>}
            <Button icon="open" variant="outline" disabled={Boolean(busy)} onClick={()=>editEvent(event)}>Open event</Button>
          </article>)}
          {tab==='Future messages'&&<details className="border-t border-[var(--border)] pt-4">
            <summary className="cursor-pointer font-semibold text-[var(--blue)]"><span aria-hidden="true">＋</span> Add event</summary>
            {eventForm}
          </details>}
        </>}
        {tab==='Family film' &&<>
          <div className="kicker">04 / A moment for someone</div><h2 className="display text-4xl">Family film.</h2><p className="text-[#bcd1c4]">Preview a keepsake with the selected message. Pick an original recording or approved synthetic audio to include sound.</p>
          <Player key={take.id} component={FamilyMessage} inputProps={{recipient:take.recipient,occasion:take.occasion,words:transcript,audioUrl}} durationInFrames={Math.max(30,Math.ceil(duration*30))} compositionWidth={960} compositionHeight={540} fps={30} controls style={{width:'100%',borderRadius:16,overflow:'hidden'}}/>
          <Button variant="outline" onClick={exportProps}><Film size={16}/> Download film settings</Button>
        </>}
        {(!localStudio||tab==='Photo avatar')&&<details className="border-t border-[#405749] pt-4"><summary className="cursor-pointer text-sm"><Lock size={14} className="inline"/> Studio access for AI tools</summary><label className="mt-2">Studio access code<input type="password" autoComplete="off" value={code} onChange={e=>setCode(e.target.value)}/></label></details>}
        <p role="status" className="min-h-6 break-words text-sm text-[#d6f09c]">{busy?'Working…':recording?'Recording now…':notice}</p>
      </section>
    </div>
  </main>;
}
