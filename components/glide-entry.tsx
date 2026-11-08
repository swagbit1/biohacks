'use client';

import dynamic from 'next/dynamic';
import {useState} from 'react';
import {Button} from './button';
import {VoiceEntry} from './voice-entry';
import {insertGlideSentence} from '../speechgen/lib/insertSentence';

const GlideTyping=dynamic(()=>import('../speechgen/components/GlideTyping'),{ssr:false});

export function GlideEntry({label,value,onChange,maxLength=3500,disabled,code,voice=true}:{
  label:string;
  value:string;
  onChange:(value:string)=>void;
  maxLength?:number;
  disabled?:boolean;
  code?:string;
  voice?:boolean;
}){
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  function insert(sentence:string){
    const result=insertGlideSentence(value,sentence);
    if(!result.ok||result.text.length>maxLength){
      setError('This field has room for '+Math.max(0,maxLength-value.length)+' more characters.');
      return false;
    }
    onChange(result.text);
    setError('');
    setOpen(false);
    return true;
  }
  const glideButton=<Button icon="glide" variant="outline" disabled={disabled} aria-expanded={open}
    onClick={()=>{setOpen(!open);setError('');}}>
    Glide type · {label}
  </Button>;
  return <div className="min-w-0">
    {voice?<VoiceEntry leading={glideButton} label={label} disabled={disabled} code={code} onInsert={insert}/>:glideButton}
    {open&&!disabled&&<GlideTyping insertLabel="Insert text" onSentenceReady={insert}/>}
    {error&&<p role="status">{error}</p>}
  </div>;
}
