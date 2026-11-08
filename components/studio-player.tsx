'use client';

import {useEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {Maximize,Minimize,MoreHorizontal,Pause,Play,Square,Volume2,VolumeX} from 'lucide-react';

function clock(seconds:number){
  const whole=Math.max(0,Math.floor(seconds));
  return Math.floor(whole/60)+':'+String(whole%60).padStart(2,'0');
}

export function StudioPlayer({title,source,backdrop,audio,audioUrl,playing,onToggle,children,options,media}:{
  title:string;source:string;backdrop:string;audio:RefObject<HTMLAudioElement|null>;audioUrl:string;
  playing:boolean;onToggle:()=>void;children:ReactNode;options:ReactNode;media:ReactNode;
}){
  const frame=useRef<HTMLElement>(null);
  const more=useRef<HTMLDetailsElement>(null);
  const [position,setPosition]=useState({time:0,duration:0});
  const [showBackdrop,setShowBackdrop]=useState(true);
  const [speed,setSpeed]=useState(1);
  const [muted,setMuted]=useState(false);
  const [canFullscreen,setCanFullscreen]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);
  const [status,setStatus]=useState('');

  useEffect(()=>{
    const element=audio.current;
    if(!element)return;
    const sync=()=>setPosition({time:element.currentTime||0,duration:Number.isFinite(element.duration)?element.duration:0});
    const syncVolume=()=>setMuted(element.muted);
    const events=['loadedmetadata','durationchange','timeupdate','seeked','emptied','ended'];
    for(const event of events)element.addEventListener(event,sync);
    element.addEventListener('volumechange',syncVolume);
    sync();
    syncVolume();
    setSpeed(element.playbackRate);
    return ()=>{
      for(const event of events)element.removeEventListener(event,sync);
      element.removeEventListener('volumechange',syncVolume);
    };
  },[audio,audioUrl]);

  useEffect(()=>{
    const sync=()=>setFullscreen(document.fullscreenElement===frame.current);
    setCanFullscreen(Boolean(document.fullscreenEnabled&&frame.current?.requestFullscreen));
    document.addEventListener('fullscreenchange',sync);
    return ()=>document.removeEventListener('fullscreenchange',sync);
  },[]);

  async function toggleFullscreen(){
    setStatus('');
    try{
      if(document.fullscreenElement===frame.current)await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    }catch{setStatus('Fullscreen is unavailable.');}
  }

  const hasTimeline=Boolean(audioUrl&&position.duration>0);
  const controlLabel=playing?(audioUrl?'Pause':'Stop'):'Play';
  const PlaybackIcon=playing?(audioUrl?Pause:Square):Play;
  return <section ref={frame} className="studio-player" data-backdrop={backdrop} aria-label="Message player"
    onKeyDown={event=>{
      if(event.key==='Escape'&&more.current?.open){
        more.current.open=false;
        more.current.querySelector('summary')?.focus();
      }
    }}>
    <div className={'studio-player-scene room-'+backdrop}>
      {showBackdrop&&<div className="room-backdrop" aria-hidden="true">
        <div className="room-books"/><div className="room-lamp"/><div className="room-sofa"/>
      </div>}
      {children}
    </div>
    <header className="studio-player-heading">
      <p>{source}</p>
      <h2>{title}</h2>
    </header>
    <div className="studio-player-controls">
      {status&&<p role="status" className="text-sm">{status}</p>}
      {audioUrl&&<input className="studio-player-seek" type="range" aria-label="Playback position"
        aria-valuetext={clock(position.time)+' of '+clock(position.duration)}
        disabled={!hasTimeline} min={0} max={position.duration||1} step={0.1} value={hasTimeline?position.time:0}
        onChange={event=>{
          const element=audio.current;
          if(!element||!hasTimeline)return;
          const time=Number(event.target.value);
          element.currentTime=time;
          setPosition(current=>({...current,time}));
        }}/>}
      <div className="studio-player-transport">
        <button type="button" className="studio-player-play" onClick={onToggle}>
          <PlaybackIcon size={22} aria-hidden="true"/><span>{controlLabel}</span>
        </button>
        {hasTimeline&&<span className="studio-player-time">{clock(position.time)} / {clock(position.duration)}</span>}
        <div className="studio-player-tools">
          {audioUrl&&<button type="button" aria-label={muted?'Unmute':'Mute'} title={muted?'Unmute':'Mute'} onClick={()=>{
            if(audio.current)audio.current.muted=!audio.current.muted;
          }}>{muted?<VolumeX size={21} aria-hidden="true"/>:<Volume2 size={21} aria-hidden="true"/>}</button>}
          <details ref={more}>
            <summary><MoreHorizontal size={21} aria-hidden="true"/><span>More</span></summary>
            <div className="studio-player-menu">
              {options}
              <details>
                <summary>Playback settings</summary>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showBackdrop} onChange={event=>setShowBackdrop(event.target.checked)}/>
                  Show room background
                </label>
                {audioUrl&&<label className="block">Playback speed
                  <select value={speed} onChange={event=>{
                    const rate=Number(event.target.value);
                    if(audio.current)audio.current.playbackRate=rate;
                    setSpeed(rate);
                  }}>
                    <option value={0.75}>0.75×</option>
                    <option value={1}>1× (normal)</option>
                    <option value={1.25}>1.25×</option>
                  </select>
                </label>}
              </details>
            </div>
          </details>
          {canFullscreen&&<button type="button" aria-label={fullscreen?'Exit fullscreen':'Fullscreen'} title={fullscreen?'Exit fullscreen':'Fullscreen'} onClick={()=>void toggleFullscreen()}>
            {fullscreen?<Minimize size={21} aria-hidden="true"/>:<Maximize size={21} aria-hidden="true"/>}
          </button>}
        </div>
      </div>
    </div>
    {media}
  </section>;
}
