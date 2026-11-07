import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const files = {'/': ['index.html', 'text/html'], '/avatar.mjs': ['avatar.mjs', 'text/javascript']};
const {GEMINI_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID} = process.env;
const json = (res, code, body) => res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(body));
async function provider(url, headers, body) {
  const response = await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error('Voice or drafting provider returned HTTP ' + response.status + '. Check the configured credentials and model.');
  return response.json();
}
createServer(async (req,res) => {
  try {
    if (req.method === 'GET' && Object.hasOwn(files,req.url)) {
      const [file,type] = files[req.url];
      const body = await readFile(new URL(file,import.meta.url));
      return res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}).end(body);
    }
    if (req.method !== 'POST' || !['/api/draft','/api/speak'].includes(req.url)) return json(res,404,{error:'Not found'});
    const origin = req.headers.origin;
    if (origin && !['http://127.0.0.1:4173','http://localhost:4173'].includes(origin)) return json(res,403,{error:'Open the local EverVoice page to use this API.'});
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 16000) return json(res,413,{error:'Message is too long.'});
    }
    let input;
    try { input = JSON.parse(raw); } catch { return json(res,400,{error:'Expected a JSON request.'}); }
    if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000) return json(res,400,{error:'Enter between 1 and 4,000 characters.'});
    if (req.url === '/api/draft') {
      if (!GEMINI_API_KEY) return json(res,503,{error:'Set GEMINI_API_KEY to enable assisted drafting.'});
      const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
      const result = await provider('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{'x-goog-api-key':GEMINI_API_KEY},{
        systemInstruction:{parts:[{text:'Write a short editable message draft from the supplied occasion and speaker notes. Preserve their phrasing and humor. Use only facts, jokes, names and memories explicitly provided. Never invent memories, promises or intentions. Output only the draft.'}]},
        contents:[{parts:[{text:input.text}]}]
      });
      const text = result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('').trim();
      if (!text) return json(res,502,{error:'Gemini did not return a draft.'});
      return json(res,200,{text});
    }
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) return json(res,503,{error:'Set ELEVENLABS_API_KEY and an authorized ELEVENLABS_VOICE_ID.'});
    const result = await provider('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(ELEVENLABS_VOICE_ID)+'/with-timestamps',{'xi-api-key':ELEVENLABS_API_KEY},{text:input.text,model_id:'eleven_multilingual_v2'});
    if (!result.audio_base64) return json(res,502,{error:'ElevenLabs did not return audio.'});
    return json(res,200,{audio:result.audio_base64,alignment:result.alignment});
  } catch (error) {
    return json(res,502,{error:error.message});
  }
}).listen(4173,'127.0.0.1',() => console.log('EverVoice at http://127.0.0.1:4173'));
