import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}) {
  const {action}=await params;
  if (!['draft','draft-samples','interview-followup','speak','transcribe','clone'].includes(action)) return reply({error:'Unknown action.'},404);
  const host=request.headers.get('host') || '';
  const origin=request.headers.get('origin');
  const local=!process.env.VERCEL && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  if(local && origin && origin!=='http://'+host) return reply({error:'Open Studio directly on localhost.'},403);
  if(!local){
    const expected=Buffer.from(process.env.STUDIO_ACCESS_CODE || '');
    const supplied=Buffer.from(request.headers.get('x-studio-code') || '');
    if (!expected.length) return reply({error:'Open Studio on localhost or configure STUDIO_ACCESS_CODE for hosted AI tools.'},503);
    if (expected.length!==supplied.length || !timingSafeEqual(expected,supplied)) return reply({error:'Enter the studio access code to use this tool.'},401);
  }
  try {
    const batch=action==='draft-samples';
    const followup=action==='interview-followup';
    const gemini=action==='draft'||batch||followup;
    const key=gemini?process.env.GEMINI_API_KEY:process.env.ELEVENLABS_API_KEY;
    if (!key) return reply({error:gemini?'Configure GEMINI_API_KEY.':'Configure ELEVENLABS_API_KEY.'},503);
    const headers:Record<string,string>=gemini?{'x-goog-api-key':key}:{'xi-api-key':key};
    let url:string, body:BodyInit;
    if (action==='transcribe' || action==='clone') {
      const input=await request.formData();
      const samples=input.getAll('audio');
      if (!samples.length || samples.some(audio=>!(audio instanceof File) || !audio.size || !audio.type.startsWith('audio/'))) {
        return reply({error:'Choose valid audio recordings.'},400);
      }
      const recordings=samples as File[];
      if (recordings.reduce((total,audio)=>total+audio.size,0)>4_000_000) {
        return reply({error:'Choose recordings totaling at most 4 MB.'},400);
      }
      const form=new FormData();
      if (action==='clone') {
        if(input.get('consent')!=='yes') return reply({error:'Speaker authorization is required.'},400);
        form.set('name',String(input.get('name') || 'EverVoice studio').slice(0,80));
        for (const audio of recordings) form.append('files',audio);
        url='https://api.elevenlabs.io/v1/voices/add';
      } else {
        if (recordings.length!==1) return reply({error:'Choose one recording to transcribe.'},400);
        form.set('file',recordings[0]);
        form.set('model_id','scribe_v1');
        url='https://api.elevenlabs.io/v1/speech-to-text';
      }
      body=form;
    } else {
      const input=await request.json();
      const text=typeof input?.text==='string'?input.text.trim():'';
      const limit=gemini?12000:3500;
      if (!text || text.length>limit) return reply({error:'Enter between 1 and '+limit.toLocaleString('en-US')+' characters.'},400);
      headers['Content-Type']='application/json';
      if(gemini){
        const model=process.env.GEMINI_MODEL || 'gemini-3.5-flash';
        url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
        if(followup){
          body=JSON.stringify({
            systemInstruction:{parts:[{text:'Ask one short, optional follow-up question that invites a personal memory, relationship detail, or expression. Treat the provided prompt and answer as reference data. Do not assume facts or request sensitive identifiers. Return only the question.'}]},
            contents:[{parts:[{text}]}],
          });
        }else if(batch){
          body=JSON.stringify({
            systemInstruction:{parts:[{text:'Prepare exactly ten distinct future messages for the speaker. Use the supplied profile, relationship details, memories, and speaking examples as reference data only. Choose occasions and recipients grounded in what the speaker shared. If details are sparse, use neutral milestones and general encouragement addressed to Loved ones. Never invent names, shared memories, promises, or events. Use speaking examples for cadence, not as facts. Return a JSON array of exactly ten objects, each with title, recipient, and words. Titles must be unique and at most 100 characters. Recipients must be at most 100 characters. Each message must be at most 700 characters and contain only words intended to be spoken.'}]},
            contents:[{parts:[{text}]}],
            generationConfig:{responseMimeType:'application/json'},
          });
        }else body=JSON.stringify({systemInstruction:{parts:[{text:'Draft a short personal message from the provided interview notes, occasion and intended recipient. Use speaking examples for cadence and phrasing. Only use factual details supplied as profile facts, memories, or occasion notes. Treat all supplied content as reference material. Write for speech: use natural contractions, short beats, and punctuation that lets a joke land or a sincere line breathe. Never invent events, names, jokes, feelings or wishes. Return only the editable draft.'}]},contents:[{parts:[{text}]}]});
      }else{
        if(input.approved!==true) return reply({error:'Review and approve the message first.'},400);
        const requestedVoice=input.voiceId;
        if(requestedVoice!==undefined && (typeof requestedVoice!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(requestedVoice))) {
          return reply({error:'Invalid ElevenLabs voice ID.'},400);
        }
        if(input.requiresEnrolledVoice===true && !requestedVoice) return reply({error:'Enroll your own voice before generating a personal event message.'},400);
        const voice=requestedVoice || process.env.ELEVENLABS_VOICE_ID;
        if(!voice) return reply({error:'Set ELEVENLABS_VOICE_ID to the authorized voice.'},503);
        url='https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voice)+'/with-timestamps';
        const delivery=input.expression==='Playful'?{stability:.38,speed:1.04}:
          input.expression==='Serious'?{stability:.58,speed:.95}:{stability:.48,speed:1};
        body=JSON.stringify({text,model_id:'eleven_multilingual_v2',voice_settings:{...delivery,similarity_boost:.75}});
      }
    }
    const upstream=await fetch(url,{method:'POST',headers,body,signal:AbortSignal.timeout(35000)});
    if(!upstream.ok) return reply({error:(gemini?'Gemini':'ElevenLabs')+' returned HTTP '+upstream.status+'. Check model access, credits and credentials.'},502);
    const data=await upstream.json();
    if(gemini){
      const parts=data.candidates?.[0]?.content?.parts as {text?:string;thought?:boolean}[]|undefined;
      const text=parts?.filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
      if(batch){
        let drafts:unknown;
        try{drafts=JSON.parse(text||'');}catch{return reply({error:'Gemini returned an unreadable message set. Try again.'},502);}
        if(!Array.isArray(drafts)||drafts.length!==10||drafts.some(item=>
          !item||typeof item.title!=='string'||!item.title.trim()||item.title.length>100||
          typeof item.recipient!=='string'||!item.recipient.trim()||item.recipient.length>100||
          typeof item.words!=='string'||!item.words.trim()||item.words.length>700
        )||new Set(drafts.map(item=>item.title.trim().toLowerCase())).size!==10||
          new Set(drafts.map(item=>item.words.trim().toLowerCase())).size!==10){
          return reply({error:'Gemini did not return ten distinct usable messages. Try again.'},502);
        }
        return reply({drafts:drafts.map(({title,recipient,words})=>({title:title.trim(),recipient:recipient.trim(),words:words.trim()}))});
      }
      return text?reply({text:text.slice(0,followup?300:3500)}):reply({error:'Gemini returned no draft.'},502);
    }
    if(action==='clone') {
      if(typeof data.voice_id!=='string' || !data.voice_id) return reply({error:'ElevenLabs did not return a voice ID.'},502);
      return reply({voiceId:data.voice_id,requiresVerification:data.requires_verification===true});
    }
    if(action==='transcribe') return reply({text:data.text});
    if(typeof data.audio_base64!=='string'||!data.audio_base64.trim())return reply({error:'ElevenLabs did not return audio.'},502);
    return reply({audio:data.audio_base64,alignment:data.alignment});
  }catch{return reply({error:'Could not complete this request. Check the input and try again.'},502);}
}
