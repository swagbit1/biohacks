'use client';

import {useEffect,useState} from 'react';
import {Button} from './button';
import {GlideEntry} from './glide-entry';

const extraKey='evervoice-extra-stories';
type Story={id:string;title:string;text:string};

export function savedPreservationNotes(){
  try{
    const journal=JSON.parse(localStorage.getItem('evervoice-interview-journal')||'{}') as Record<string,string>;
    const stories=JSON.parse(localStorage.getItem(extraKey)||'[]') as Story[];
    const earlier=JSON.parse(localStorage.getItem('evervoice-interview')||'{}').styleExamples;

    return [
      ...Object.entries(journal).map(([prompt,text])=>prompt+'\n'+text),
      ...stories.map(story=>[story.title,story.text].filter(Boolean).join('\n')),
      typeof earlier==='string'?earlier:'',
    ].join('\n\n');
  }catch{return '';}
}

export function ExtraStories({code,disabled}: {code?:string;disabled?:boolean}){
  const [stories,setStories]=useState<Story[]>([]);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    try{setStories(JSON.parse(localStorage.getItem(extraKey)||'[]'));}catch{}
  },[]);

  function change(id:string,field:'title'|'text',value:string){
    setStories(current=>current.map(story=>story.id===id?{...story,[field]:value}:story));
    setNotice('');
  }

  return <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
    <h3 className="display text-2xl">Anything else?</h3>
    <p>Keep another story, expression, or memory. Saved entries can help Gemini draft future messages.</p>
    {stories.map((story,index)=><div className="space-y-2 border-t border-[var(--border)] pt-3" key={story.id}>
      <label>Title for story {index+1} (optional)<input value={story.title} maxLength={100} disabled={disabled} onChange={e=>change(story.id,'title',e.target.value)}/></label>
      <GlideEntry label={'story '+(index+1)+' title'} value={story.title} onChange={value=>change(story.id,'title',value)} maxLength={100} code={code} disabled={disabled}/>
      <label>Story {index+1}<textarea rows={4} maxLength={3500} value={story.text} disabled={disabled} onChange={e=>change(story.id,'text',e.target.value)}/></label>
      <GlideEntry label={'story '+(index+1)} value={story.text} onChange={value=>change(story.id,'text',value)} code={code} disabled={disabled}/>
    </div>)}
    <div className="flex flex-wrap gap-2">
      <Button icon="add" variant="outline" disabled={disabled} onClick={()=>setStories(current=>[...current,{id:crypto.randomUUID(),title:'',text:''}])}>Add a story</Button>
      {stories.length>0&&<Button icon="save" disabled={disabled} onClick={()=>{
        try{
          localStorage.setItem(extraKey,JSON.stringify(stories.filter(story=>story.title.trim()||story.text.trim())));
          setNotice('Reviewed stories saved on this device.');
        }catch{setNotice('Could not save your stories on this device.');}
      }}>Save stories</Button>}
    </div>
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
