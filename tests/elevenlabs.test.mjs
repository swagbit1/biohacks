import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks, stripTypeScriptTypes} from 'node:module';
import test from 'node:test';

const route = new URL('../app/api/%5Baction%5D/route.ts', import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return next(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  },
  load(url, context, next) {
    if (url === route.href) {
      return {format: 'module', source: stripTypeScriptTypes(readFileSync(route, 'utf8')), shortCircuit: true};
    }
    return next(url, context);
  },
});
const {POST} = await import(route.href);
hooks.deregister();

function send(action, body, code = 'mock-studio', requestHeaders = {}) {
  const headers = {'x-studio-code': code, ...requestHeaders};
  if (typeof body === 'string') headers['content-type'] = 'application/json';
  const request = new Request('http://localhost/api/' + action, {method: 'POST', body, headers});
  return POST(request, {params: Promise.resolve({action})});
}

test('enrolls multiple authorized samples and uses the resulting voice for approved speech', async context => {
  process.env.STUDIO_ACCESS_CODE = 'mock-studio';
  process.env.ELEVENLABS_API_KEY = 'mock-key';
  delete process.env.ELEVENLABS_VOICE_ID;

  const clone = new FormData();
  for (const name of ['first.wav', 'second.wav']) {
    clone.append('audio', new File(['test'], name, {type: 'audio/wav'}));
  }
  const speech = {text: 'Classroom recap', voiceId: 'mockVoice', expression: 'Playful'};
  const alignment = {characters: ['a'], character_end_times_seconds: [1]};
  const fetch = context.mock.method(globalThis, 'fetch', async (url, request) => {
    if (url.endsWith('/voices/add')) {
      assert.deepEqual(request.body.getAll('files').map(file => file.name), ['first.wav', 'second.wav']);
      return Response.json({voice_id: speech.voiceId, requires_verification: true});
    }
    assert.match(url, /mockVoice\/with-timestamps$/);
    const payload = JSON.parse(request.body);
    assert.equal(payload.text, speech.text);
    assert.deepEqual(payload.voice_settings, {stability: .38, speed: 1.04, similarity_boost: .75});
    return Response.json({audio_base64: 'YQ==', alignment});
  });

  assert.equal((await send('clone', clone)).status, 400);
  clone.set('consent', 'yes');
  assert.equal((await send('clone', clone, 'bad')).status, 401);
  assert.equal((await send('speak', JSON.stringify(speech))).status, 400);
  assert.equal((await send('speak', JSON.stringify({text: speech.text, approved: true}))).status, 503);
  assert.equal(fetch.mock.callCount(), 0);

  const enrolled = await send('clone', clone);
  assert.deepEqual(await enrolled.json(), {voiceId: speech.voiceId, requiresVerification: true});
  const generated = await send('speak', JSON.stringify({...speech, approved: true}));
  assert.deepEqual(await generated.json(), {audio: 'YQ==', alignment});
  delete process.env.STUDIO_ACCESS_CODE;
  const approved = JSON.stringify({...speech, approved: true});
  const host = '127.0.0.1:3000';
  assert.equal((await send('speak', approved, '', {host, origin:'https://unrelated.example'})).status,403);
  assert.equal((await send('speak', approved, '', {host, origin:'http://'+host})).status,200);
  assert.equal(fetch.mock.callCount(), 3);
});

test('transcribes a recording and synthesizes only the reviewed wording', async context => {
  const transcript = 'Happy anniversary Jordan';
  const reviewed = 'Happy anniversary, Jordan. I love you!';
  const headers = {host: '127.0.0.1:3000'};
  const original = new File(['original audio'], 'anniversary.webm', {type: 'audio/webm'});
  const form = new FormData();
  form.append('audio', original);
  const provider = context.mock.method(globalThis, 'fetch', async (url, request) => {
    if (url.endsWith('/speech-to-text')) {
      assert.equal(await request.body.get('file').text(), 'original audio');
      return Response.json({text: transcript});
    }
    assert.match(url, /enrolledVoice\/with-timestamps$/);
    assert.equal(JSON.parse(request.body).text, reviewed);
    return Response.json({audio_base64: 'YQ=='});
  });
  process.env.ELEVENLABS_API_KEY = 'mock-key';
  assert.deepEqual(await (await send('transcribe', form, '', headers)).json(), {text: transcript});
  const speech = {text: reviewed, voiceId: 'enrolledVoice'};
  assert.equal((await send('speak', JSON.stringify(speech), '', headers)).status, 400);
  assert.equal((await send('speak', JSON.stringify({...speech, approved: true}), '', headers)).status, 200);
  assert.equal(provider.mock.callCount(), 2);
});

test('future message drafting passes speaking examples to Gemini without generating audio', async context => {
  process.env.GEMINI_API_KEY = 'mock-gemini';
  const input = {recipient: 'Jordan', occasion: 'Birthday', speakingExamples: 'Well, look at you.'};
  const provider = context.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
    const payload = JSON.parse(request.body);
    assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text), input);
    assert.match(payload.systemInstruction.parts[0].text, /Never invent/);
    return Response.json({candidates: [{content: {parts: [{text: 'Happy birthday, Jordan.'}]}}]});
  });
  const response = await send('draft', JSON.stringify({text: JSON.stringify(input)}), '', {host: '127.0.0.1:3000'});
  assert.deepEqual(await response.json(), {text: 'Happy birthday, Jordan.'});
  assert.equal(provider.mock.callCount(), 1);
});

test('personal event speech never falls back to the configured demo voice', async context => {
  process.env.ELEVENLABS_API_KEY = 'mock-key';
  process.env.ELEVENLABS_VOICE_ID = 'demoVoice';
  const provider = context.mock.method(globalThis, 'fetch', async () => Response.json({}));
  const headers = {host: '127.0.0.1:3000'};
  const speech = {text: 'Happy birthday!', approved: true, requiresEnrolledVoice: true};
  assert.equal((await send('speak', JSON.stringify(speech), '', headers)).status, 400);
  assert.equal(provider.mock.callCount(), 0);
  assert.equal((await send('speak', JSON.stringify({...speech, voiceId: 'personalVoice'}), '', headers)).status, 502);
  assert.equal(provider.mock.callCount(), 1);
});

test('personalized sample drafting accepts exactly ten distinct titled scripts', async context => {
  process.env.GEMINI_API_KEY = 'mock-gemini';
  const notes = {memories: 'Jordan loves Sunday dinner.'};
  const drafts = Array.from({length: 10}, (_, index) => ({
    title: 'Family moment ' + (index + 1), recipient: 'Jordan',
    words: 'Jordan, here is message ' + (index + 1) + '.',
  }));
  let generated = drafts;
  context.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
    const payload = JSON.parse(request.body);
    assert.equal(payload.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text), notes);
    return Response.json({candidates: [{content: {parts: [{text: JSON.stringify(generated)}]}}]});
  });
  const request = () => send('draft-samples', JSON.stringify({text: JSON.stringify(notes)}), '', {host: 'localhost'});
  assert.deepEqual(await (await request()).json(), {drafts});
  generated = drafts.slice(0, 9);
  assert.equal((await request()).status, 502);
  generated = [...generated, drafts[0]];
  assert.equal((await request()).status, 502);
});

test('interview follow-up uses Gemini with the reviewed prompt and answer', async context => {
  process.env.GEMINI_API_KEY = 'mock-gemini';
  const reviewed = {prompt:'Who do you want to preserve stories for?',answer:'My sister.'};
  const body = JSON.stringify({text:JSON.stringify(reviewed)});
  const headers = {host:'127.0.0.1:3000'};
  const question = 'What is a small memory with your sister that you would like to keep?';
  const provider = context.mock.method(globalThis,'fetch',async (url,request)=>{
    assert.equal(new URL(url).hostname,'generativelanguage.googleapis.com');
    const payload=JSON.parse(request.body);
    assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text),reviewed);
    return Response.json({candidates:[{content:{parts:[{text:question}]}}]});
  });
  assert.deepEqual(await (await send('interview-followup',body,'',headers)).json(),{text:question});
  provider.mock.mockImplementation(async ()=>Response.json({}, {status:503}));
  assert.equal((await send('interview-followup',body,'',headers)).status,502);
});
