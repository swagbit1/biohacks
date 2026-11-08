<p align="center">
  <img src="docs/assets/evervoice-cover.jpg" alt="An ice-blue voice waveform passing through glass panels, with warm accents representing family milestones" width="100%">
</p>

<h1 align="center">EverVoice Studio</h1>
<p align="center"><strong>Preserve the way you say it.</strong></p>
<p align="center">BioHacks 2026 · Wearable Devices and Quality of Life</p>
<p align="center">
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-judges-demo">Judges’ demo</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-configuration">Configuration</a> ·
  <a href="#-verification">Verification</a>
</p>

## 💙 Why we built it

What would you want your daughter to hear on her wedding day, your son to hear at graduation, or your spouse to hear on your anniversary if you couldn't be there to say it? A [video we watched](https://www.youtube.com/watch?v=0p8HZVCZSkc) helped inspire that question.

EverVoice is a prototype for people living with ALS. It keeps original recordings, with their pauses, laughter, and inflection, and offers a way to deliver new wording in a speaker-authorized synthetic voice. The fictional demo follows Alex Chen, a biology teacher who finds his afternoon classroom recaps harder to deliver. His graduation message for Maya shows what the same tools can preserve for family.

## 🚀 Quick start

Use Node.js 22 LTS and npm.

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open [onboarding](http://127.0.0.1:3000), [Studio](http://127.0.0.1:3000/studio), [Glide](http://127.0.0.1:3000/glide), or [Avatar Testing](http://127.0.0.1:3000/avatar-testing). Use the port printed by Next.js. Browser storage is scoped to the exact origin, including hostname and port.

Alex's bundled demos play without provider credentials. A browser with WebGL is required for the live 3D stage. The audio and transcript remain available when WebGL is unavailable.

## 🎬 Judges’ demo

1. Open **Studio → Future messages → Alex’s demos → Classroom recap** and press **Play**. Introduce Alex and show how Glide Typing can help compose a new sentence.
2. Open **Jordan’s birthday** or **Maya’s wedding** to show the range of saved occasions. Use **More** to open the transcript, download the audio, or change the room.
3. Finish with **Maya’s graduation**. Let the pause before the sincere close land.

The eight bundled clips use an ElevenLabs voice generated in advance for fictional Alex. They include the classroom recap, Maya’s graduation and wedding, Leo’s wedding and new chapter, Jordan’s thank-you and birthday, and Personal Wishes. The library stays available when a personal voice is enrolled.

## 🧩 How it works

| Feature | What happens |
|---|---|
| 🎙️ **Preserve a voice** | In onboarding or Voice Bank, record or import originals. Choose takes and authorize ElevenLabs to create a clone. Complete provider verification if required. |
| ✍️ **Collect stories** | Type, use Glide, or record an answer. ElevenLabs can transcribe selected audio. Save reviewed notes and optionally ask Gemini for a follow-up. |
| ⌨️ **Glide Typing** | Trace a word on the keyboard. The browser ranks candidates locally, and you can insert the one you choose into a draft. Optional Gemini reranking is opt-in and limited to localhost. |
| 💌 **Prepare a message** | Create an event, write or ask Gemini for a draft, then review and approve the wording. ElevenLabs reads it in the enrolled voice. Save the resulting audio for later playback or download. |
| 📅 **Future messages** | Opt in to preparing ten messages based on saved notes and the enrolled clone. The browser saves completed clips as they arrive, and **Prepare missing audio** resumes an interrupted set. |
| 🎥 **Record a video keepsake** | Record directly from a custom event. Each take can run up to five minutes or 100 MB. Replay or download the video from its event. |
| 🧑 **Animate a likeness** | The Three.js stage plays rigged GLBs, using audio timing and scene cues where available. The separate Remotion family film uses a transcript card and audio. |

### Built with

- **Next.js App Router, React, TypeScript, Tailwind CSS, Lucide** for the Clear Blue interface and server routes.
- **MediaRecorder, IndexedDB, Cache Storage, Web Audio** for local capture, storage, imported avatars, and audio analysis.
- **ElevenLabs** for transcription, Instant Voice Cloning, and synthesis with timing.
- **Gemini** for interview follow-ups, grounded message drafts, and optional Glide reranking.
- **Tripo, Three.js, React Three Fiber** for optional avatar generation and local 3D playback.
- **Remotion** for the family film preview and CLI rendering. **Supabase** for optional private audio backup.

## 🔧 Configuration

Copy [.env.example](.env.example) to `.env.local` if you want provider features, then restart Next.js. Keep the real values in your local file or hosting secrets.

| Variable | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | Server-side key for the enabled speech, transcription, and voice enrollment features |
| `ELEVENLABS_VOICE_ID` | Optional configured voice for general synthesis. Personal event synthesis uses the enrolled clone. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Enable drafts and follow-ups using a model available to your project |
| `STUDIO_ACCESS_CODE` | Required for hosted AI routes. Enter it in the Studio access panel. |
| `TRIPO_API_KEY` | Enable local avatar generation |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Enable optional private audio backup |

**Audio upload limits.** Transcription and voice enrollment accept up to 4 MB per request. For cloning, that limit applies to the combined selected recordings.

**Private backup.** Apply [supabase/schema.sql](supabase/schema.sql), then add local and deployed origins to your Supabase Auth redirect allowlist. Backup uses sign-in, owner-scoped rows, and private audio storage. Originals, event drafts, videos, and prepared audio otherwise live in the browser. Download copies you want family to keep. Voice Bank can delete local takes, independently of the provider’s clone and any cloud backup.

**Hosted demo.** Deploy as a Next.js app on Vercel. For a demo using the bundled clips, provider keys are optional. Photo avatar generation runs locally. On a hosted deployment, the viewer can still play bundled or imported GLBs.

### 🧑 Photo avatars

Open **Photo avatar → Check available credits**, then choose Essentials or Full Motion. Essentials estimates 135 credits for the textured mesh and rig. Full Motion estimates 175 credits and adds relaxed standing, agreement, greeting, and walking clips. Use a clear full-body JPG or PNG under 4 MB and submit only with permission to use the likeness.

Start on loopback with a configured access code or, for local Tripo access without one, run:

```bash
TRIPO_LOCAL_ONLY=1 npm run dev -- --hostname 127.0.0.1
```

The Photo avatar tab polls the saved job. Job state and generated GLBs live in the ignored `.evervoice-avatars` folder by default. Playback uses the saved files. If a submission stops before returning a task ID, check provider history before retrying.

### 🎞️ Export a family film

Preview in **Family film**, then download the film settings. For a local take, put a copy of the audio in a local `public/` path and set `audioUrl` in the downloaded JSON to the URL served by Next.js. With the app running:

```bash
npm run video -- out/family-message.mp4 --props=film-props.json
```

The film composition contains the title, transcript, and audio. The 3D avatar plays in the Studio stage.

## ✅ Verification

```bash
./node_modules/.bin/tsc -p speechgen/tsconfig.json
node --test tests/*.test.mjs speechgen/.build/tests/*.test.js
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
```

The automated suites cover Glide decoding, mocked provider workflows, and avatar job handling. For the demo release, all eight Alex clips started in a clean browser session with provider keys disabled. Live voice enrollment, microphone and camera capture, and an end-to-end generation session depend on provider setup and device permissions.

## 🌱 What’s next

Test the interface with people who use assistive communication, improve avatar expression, and add private access for family members the speaker chooses. Today, sharing a keepsake means downloading a copy and sending it yourself.
