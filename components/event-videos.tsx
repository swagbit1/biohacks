'use client';

import {useEffect,useState} from 'react';
import {MediaCapture} from './media-recorder';
import {localBank} from './studio-bank';

type EventVideo={id:string;eventId:string;capturedAt:string;format:string;blob:Blob};

function SavedVideo({item}: {item:EventVideo}){
  const [url,setUrl]=useState('');
  useEffect(()=>{
    const objectUrl=URL.createObjectURL(item.blob);
    setUrl(objectUrl);
    return ()=>URL.revokeObjectURL(objectUrl);
  },[item.blob]);
  const date=new Date(item.capturedAt).toLocaleString();
  return <div className="space-y-2">
    <p className="text-sm">Recorded {date}</p>
    <video src={url||undefined} controls playsInline className="w-full rounded-xl"/>
    {url&&<a className="text-[var(--blue)] underline" href={url} download={'EverVoice-'+item.capturedAt.slice(0,10)+(item.format.includes('mp4')?'.mp4':'.webm')}>Download video</a>}
  </div>;
}

export function EventVideos({eventId,disabled,onBusy}: {eventId:string;disabled?:boolean;onBusy?:(busy:boolean)=>void}){
  const [items,setItems]=useState<EventVideo[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    localBank<EventVideo[]>('readonly',store=>store.index('eventId').getAll(eventId),'videos')
      .then(videos=>{if(active)setItems(videos.sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt)));})
      .catch(()=>{if(active)setError('Could not open saved videos on this device.');});
    return ()=>{active=false;};
  },[eventId]);
  return <section className="space-y-3 border-t border-[var(--border)] pt-3">
    <h3 className="font-semibold">Video keepsakes</h3>
    <p className="text-sm">Save up to five minutes or 100 MB per take. Videos stay in this browser until you download a copy.</p>
    <MediaCapture video label={items.length?'Record another video':'Record video'} disabled={disabled} onBusy={onBusy} onSave={async blob=>{
      const item={id:crypto.randomUUID(),eventId,capturedAt:new Date().toISOString(),format:blob.type,blob};
      try{await localBank('readwrite',store=>store.put(item),'videos');}
      catch{throw Error('Could not save this video. Check available browser storage and try again.');}
      setItems(current=>[item,...current]);
    }}/>
    {items.map(item=><SavedVideo key={item.id} item={item}/>)}
    {error&&<p role="status">{error}</p>}
  </section>;
}
