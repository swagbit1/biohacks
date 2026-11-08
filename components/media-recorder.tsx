'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Button} from './button';

const MAX_VIDEO_BYTES=100_000_000;
const MAX_VIDEO_SECONDS=300;

export function MediaCapture({video=false,disabled,onSave,onBusy,label,leading}:{
  video?:boolean;disabled?:boolean;onSave:(blob:Blob)=>Promise<void>;onBusy?:(busy:boolean)=>void;label?:string;leading?:ReactNode;
}){
  const [status,setStatus]=useState('');
  const [pending,setPending]=useState(false);
  const [seconds,setSeconds]=useState<number>();
  const preview=useRef<HTMLVideoElement>(null);
  const recording=useRef<MediaRecorder>(null);
  const timer=useRef<ReturnType<typeof setInterval>>(undefined);
  const mounted=useRef(false);

  useEffect(()=>{
    mounted.current=true;
    return ()=>{
      mounted.current=false;
      clearInterval(timer.current);
      const current=recording.current;
      if(current){
        current.onstop=null;
        if(current.state!=='inactive')current.stop();
        current.stream.getTracks().forEach(track=>track.stop());
      }
    };
  },[]);

  async function start(){
    setPending(true);
    onBusy?.(true);
    setStatus('');
    let stream:MediaStream|undefined;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true,video});
      if(!mounted.current){stream.getTracks().forEach(track=>track.stop());return;}
      const recorder=new MediaRecorder(stream,video?{videoBitsPerSecond:2_000_000}:undefined);
      recording.current=recorder;
      const chunks:Blob[]=[];
      let bytes=0;
      let oversized=false;
      const started=performance.now();
      const stop=()=>{if(recorder.state==='recording')recorder.stop();};
      recorder.ondataavailable=event=>{
        if(video&&bytes+event.data.size>MAX_VIDEO_BYTES){oversized=true;stop();return;}
        if(event.data.size){chunks.push(event.data);bytes+=event.data.size;}
        if(video&&bytes>=MAX_VIDEO_BYTES-1_000_000)stop();
      };
      recorder.onstop=async()=>{
        clearInterval(timer.current);
        recorder.stream.getTracks().forEach(track=>track.stop());
        if(preview.current)preview.current.srcObject=null;
        setSeconds(undefined);
        try{
          if(oversized)throw Error('This video exceeded 100 MB. Try a shorter take.');
          const blob=new Blob(chunks,{type:recorder.mimeType||chunks[0]?.type});
          if(!blob.size)throw Error('No media was captured. Try recording again.');
          await onSave(blob);
          if(mounted.current)setStatus(video?'Video saved on this device.':'Original audio saved on this device.');
        }catch(error){
          if(mounted.current)setStatus(error instanceof Error?error.message:'Could not save this recording.');
        }finally{
          if(mounted.current){setPending(false);onBusy?.(false);}
        }
      };
      if(preview.current)preview.current.srcObject=stream;
      recorder.start(250);
      setSeconds(0);
      timer.current=setInterval(()=>{
        const elapsed=Math.floor((performance.now()-started)/1000);
        setSeconds(elapsed);
        if(video&&elapsed>=MAX_VIDEO_SECONDS)stop();
      },250);
    }catch{
      stream?.getTracks().forEach(track=>track.stop());
      if(mounted.current){
        setStatus(video?'Camera or microphone unavailable. Check browser permissions.':'Microphone unavailable. Check browser permissions.');
        setPending(false);
        onBusy?.(false);
      }
    }
  }

  return <div className="space-y-2">
    {video&&<video ref={preview} autoPlay muted playsInline hidden={seconds===undefined} className="w-full rounded-xl"/>}
    <div className={leading?'capture-actions':undefined}>
    {leading}
    {seconds===undefined
      ?<Button icon={video?'video':'record'} variant="outline" disabled={disabled||pending} onClick={()=>void start()}>{label||(video?'Record video':'Record answer')}</Button>
      :<div className="flex items-center gap-3">
        <Button icon="stop" variant="outline" onClick={()=>{const current=recording.current;if(current?.state==='recording')current.stop();}}>Stop and save</Button>
        <span aria-label="Recording duration">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span>
      </div>}
    </div>
    {status&&<p role="status" className="text-sm">{status}</p>}
  </div>;
}
