import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}) {
  const {action}=await params;
  if (!['draft','speak','transcribe','clone'].includes(action)) return reply({error:'Unknown action.'},404);
  const expected=Buffer.from(process.env.STUDIO_ACCESS_CODE || '');
  const supplied=Buffer.from(request.headers.get('x-studio-code') || '');
  if (!expected.length) return reply({error:'The studio owner must configure STUDIO_ACCESS_CODE before using AI tools.'},503);
  if (expected.length!==supplied.length || !timingSafeEqual(expected,supplied)) return reply({error:'Enter the studio access code to use this tool.'},401);
  try {
    const gemini=action==='draft';
    const key=gemini?process.env.GEMINI_API_KEY:process.env.ELEVENLABS_API_KEY;
    if (!key) return reply({error:gemini?'Configure GEMINI_API_KEY.':'Configure ELEVENLABS_API_KEY.'},503);
    const headers:Record<string,string>=gemini?{'x-goog-api-key':key}:{'xi-api-key':key};
    let url:string, body:BodyInit;
    if (action==='transcribe' || action==='clone') {
      const input=await request.formData();
      const audio=input.get('audio');
      if (!(audio instanceof File) || !audio.size || audio.size>4_000_000 || !audio.type.startsWith('audio/')) return reply({error:'Choose an audio file under 4 MB.'},400);
      const form=new FormData();
      if (action==='clone') {
        if(input.get('consent')!=='yes') return reply({error:'Speaker authorization is required.'},400);
        form.set('name',String(input.get('name') || 'EverVoice studio').slice(0,80));
        form.set('files',audio);
        url='https://api.elevenlabs.io/v1/voices/add';
      } else {
        form.set('file',audio);
        form.set('model_id','scribe_v1');
        url='https://api.elevenlabs.io/v1/speech-to-text';
      }
      body=form;
    } else {
      const input=await request.json();
      const text=typeof input?.text==='string'?input.text.trim():'';
      if (!text || text.length>3500) return reply({error:'Enter 1–3,500 characters.'},400);
      headers['Content-Type']='application/json';
      if(gemini){
        const model=process.env.GEMINI_MODEL || 'gemini-3.5-flash';
        url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
        body=JSON.stringify({systemInstruction:{parts:[{text:'Draft a short personal message from the provided interview notes, occasion and intended recipient. Reuse their phrasing and humor. Never invent events, names, jokes, feelings or wishes. Return only the editable draft.'}]},contents:[{parts:[{text}]}]});
      }else{
        if(input.approved!==true) return reply({error:'Review and approve the message first.'},400);
        const voice=process.env.ELEVENLABS_VOICE_ID;
        if(!voice) return reply({error:'Set ELEVENLABS_VOICE_ID to the authorized voice.'},503);
        url='https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voice)+'/with-timestamps';
        body=JSON.stringify({text,model_id:'eleven_multilingual_v2'});
      }
    }
    const upstream=await fetch(url,{method:'POST',headers,body,signal:AbortSignal.timeout(35000)});
    if(!upstream.ok) return reply({error:(gemini?'Gemini':'ElevenLabs')+' returned HTTP '+upstream.status+'. Check model access, credits and credentials.'},502);
    const data=await upstream.json();
    if(gemini){
      const parts=data.candidates?.[0]?.content?.parts as {text?:string;thought?:boolean}[]|undefined;
      const text=parts?.filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
      return text?reply({text}):reply({error:'Gemini returned no draft.'},502);
    }
    if(action==='clone') return reply({voiceId:data.voice_id,requiresVerification:data.requires_verification});
    if(action==='transcribe') return reply({text:data.text});
    return reply({audio:data.audio_base64,alignment:data.alignment});
  }catch{return reply({error:'Could not complete this request. Check the input and try again.'},502);}
}
