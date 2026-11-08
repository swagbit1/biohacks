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
