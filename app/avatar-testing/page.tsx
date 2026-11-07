'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {Button} from '../../components/button';
import {packAsset,type SavedPack} from '../../components/tripo-panel';
import {assetNames,type Asset} from '../../components/avatar-pack';
import type {Motion} from '../../components/avatar';

const Viewer=dynamic(()=>import('../../components/tripo-viewer'),{ssr:false});
type ModelChoice={id:string;name:string;description:string;rig:boolean;clip:boolean;url?:string};
const models:ModelChoice[]=[
  {id:'standing-relax',name:'Tripo · Relaxed standing',description:'An in-place standing clip on the v1 rig. Press Play speaking demo to compare it with the dialogue.',rig:true,clip:true},
  {id:'greeting',name:'Tripo · Greeting',description:'Tripo’s authored greet_01 body gesture on the v1 rig. Compare it with the original idle clip.',rig:true,clip:true},
  {id:'idle',name:'A-pose · Idle animation',description:'Textured humanoid with a skeleton and one looping idle clip.',rig:true,clip:true},
  {id:'rigged',name:'A-pose · Rig only',description:'Textured humanoid in its rest pose. Toggle the skeleton to inspect the joints.',rig:true,clip:false},
  {id:'textured',name:'A-pose · Textured mesh',description:'The raw mesh from the successful generation, before rigging.',rig:false,clip:false},
  {id:'original',name:'Original photo · Recovered mesh',description:'The first textured model. It did not pass the humanoid rig check.',rig:false,clip:false},
];
export default function AvatarTesting(){
  const [generated,setGenerated]=useState<ModelChoice[]>([]);
  useEffect(()=>{
    fetch('/api/avatar').then(r=>r.ok?r.json():null).then((pack:SavedPack|null)=>{
      if(!pack?.key)return;
      setGenerated(pack.assets.map((asset:Asset)=>({id:'generated-'+asset,name:'New avatar · '+assetNames[asset],description:'Saved from the local avatar pack.',rig:asset!=='mesh',clip:asset!=='mesh'&&asset!=='rig',url:packAsset(pack.key,asset)})));
    }).catch(()=>{});
  },[]);
  const [selected,setSelected]=useState(models[0]),[playing,setPlaying]=useState(true),[showRig,setShowRig]=useState(false);
  const motion=useRef<Motion>({level:0,mood:'Warm',playing:false});
  const [speaking,setSpeaking]=useState(false);
  const lastBeat=useRef(0);
  const utterance=useRef<SpeechSynthesisUtterance|null>(null);
  useEffect(()=>{
    let frame:number;
    const tick=()=>{
      const since=performance.now()-lastBeat.current;
      motion.current.level=motion.current.playing ? .14+.7*Math.exp(-since/170) : 0;
      frame=requestAnimationFrame(tick);
    };
    tick();
    return ()=>{cancelAnimationFrame(frame);if(utterance.current)window.speechSynthesis?.cancel();};
  },[]);
  function stopSpeech(){
    utterance.current=null;
    window.speechSynthesis?.cancel();
    motion.current.playing=false;
    setSpeaking(false);
  }
  function speak(){
    if(speaking){stopSpeech();return;}
    if(!window.speechSynthesis)return;
    const line=new SpeechSynthesisUtterance('Maya, look at you. I always knew you would go far. I just hoped it would be somewhere with free parking. Seriously, kiddo. I am so proud of you.');
    utterance.current=line;
    line.rate=.9;
    line.onstart=()=>{if(utterance.current===line){motion.current.playing=true;lastBeat.current=performance.now();}};
    line.onboundary=()=>{if(utterance.current===line)lastBeat.current=performance.now();};
    line.onend=line.onerror=()=>{if(utterance.current===line){utterance.current=null;motion.current.playing=false;setSpeaking(false);}};
    setPlaying(true);
    setSpeaking(true);
    window.speechSynthesis.speak(line);
  }
  const url=selected.url||'/avatar-testing-assets/'+selected.id+'.glb';
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10 sm:px-9">
    <Link href="/studio">← Back to Studio</Link>
    <div><p className="kicker">EverVoice · Local QA</p><h1 className="display text-5xl">Avatar testing</h1><p className="mt-2">Compare the saved GLBs. Drag to orbit and scroll or pinch to zoom. Previews use local files.</p></div>
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <section className="panel space-y-4">
        <div className="stage"><Viewer url={url} motion={motion} animate={playing} showRig={showRig&&selected.rig}/></div>
        <h2 className="display text-3xl">{selected.name}</h2>
        <p>{selected.description}</p>
        <div className="flex flex-wrap items-center gap-3">
          {selected.rig&&<Button onClick={speak}>{speaking?'Stop speaking demo':'Play speaking demo'}</Button>}
          {selected.clip&&<Button onClick={()=>setPlaying(v=>!v)}>{playing?'Pause animation':'Play animation'}</Button>}
          {selected.rig&&<Button variant="outline" aria-pressed={showRig} onClick={()=>setShowRig(v=>!v)}>{showRig?'Hide skeleton':'Show skeleton'}</Button>}
          <a href={url} download>Download GLB</a>
        </div>
      </section>
      <section className="panel space-y-3" aria-label="Saved avatar models">
        <h2 className="display text-3xl">Saved models</h2>
        {[...models,...generated].map(model=><Button className="w-full justify-start" key={model.id} variant={selected.id===model.id?'default':'outline'} aria-pressed={selected.id===model.id} onClick={()=>{stopSpeech();setSelected(model);setPlaying(true);setShowRig(false);}}>{model.name}</Button>)}
        <p className="text-sm">The speaking demo uses device speech and adds hand gestures, head movement, and small weight shifts. This model has no mouth controls.</p>
      </section>
    </div>
  </main>;
}
