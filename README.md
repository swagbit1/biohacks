# EverVoice Studio

A Next.js App Router and TypeScript prototype for the BioHacks Quality of Life track. The fictional Alex Chen demo uses device speech. Record or import a consenting teammate's voice to demo original message playback.

## Run

Use Node 22 LTS. Run `npm ci` then `npm run dev` and open http://localhost:3000. Original recording, the 3D avatar, local storage and the demo require no account. Keep legacy prototype files separate from the Next.js entrypoint.

Copy `.env.example` to `.env.local` for integrations. Set a strong studio access code and enter it in the Studio access panel. Enable the appropriate ElevenLabs API permissions. To use a clone, verify speaker authorization, create it in the voice bank or ElevenLabs dashboard, complete any required provider verification, and set the resulting voice ID in the environment. Configure a Gemini model enabled on your project. Uploads to AI routes have a 4 MB cap for Vercel. Browser recordings remain local until you explicitly select transcription, cloning or backup.

For private backup, apply `supabase/schema.sql` to a fresh project, configure the Supabase URL and anon key, and add localhost and the deployed origin to the Supabase authentication redirect allowlist. The app uses email sign-in, per-user row policies and a private audio bucket. Cloud copies are separate from browser copies.

## Demo

1. Play Maya's graduation demo. Point out the humorous line and the sincere finish.
2. Record an authorized original take. Play it back with the animated 3D portrait.
3. Enter a nickname and joke in Personality. Draft a new message with Gemini, review it and approve it.
4. Generate preserved speech with ElevenLabs. The selected audio animates the avatar and can be played in the Family film tab.
5. Show the saved classroom recap and connect it to the case's decline from 165 to 118 words/min.

## Export a film

Use the Remotion player in the browser to preview. For MP4, put the downloaded recording in a local `public` directory and serve it from Next. Download `film-props.json` from the Family film tab and name the recording to match its audioUrl. With the app running, render:

    npm run video -- out/family-message.mp4 --props=film-props.json

The downloaded settings include the duration of the selected take. The family film uses a designed title and transcript card with audio; the separate live stage renders the 3D avatar.

## Deploy to Vercel

Import the repository as a Next.js project and configure the environment variables. For a public judge demo without provider costs, omit AI keys and use the device speech and recording paths. Configure an access code before enabling provider calls. Add the deployment origin to Supabase Auth if backup is enabled. Keep real recordings out of the repository.

## Photo avatar (Tripo)

Create a Tripo developer API key at https://developers.tripo3d.ai/en/keys and add credits. Add `TRIPO_API_KEY` and `STUDIO_ACCESS_CODE` to `.env.local`, then restart Next.js. For a loopback-only setup you can omit the code using the command below. Open **Photo avatar**, enter the studio code if configured, select a consenting teammate's clear full-body JPG or PNG under 4 MB and confirm the paid workflow. Keep the tab open during processing. The pipeline uses Tripo's biped rig check, auto-rig, and Idle preset. Save the GLBs as soon as they're ready and reimport them for future demos. Imported animated GLBs work without a Tripo key.

The local server permits one active job at a time and one generation attempt per process by default. `TRIPO_GENERATION_LIMIT` changes the per-process allowance. The app does not auto-retry paid submissions. Restarting the local server clears task state and the attempt counter. Photo generation is disabled on Vercel; the GLB viewer and import still work. The viewer drives compatible jaw morph targets when present. The built-in portrait handles speech animation when the generated model has no facial controls. Live likeness and asset quality depend on the reference photo and provider output.

For local Tripo only, run `TRIPO_LOCAL_ONLY=1 npm run dev -- --hostname 127.0.0.1` with no studio code configured. Other AI tools still require the code. Generation only starts after you select Generate. The downloaded idle GLB is saved in browser storage and loaded on launch without a Tripo request. Save a separate GLB copy to carry the avatar to another device.

### Reusable family scenes and avatar packs

Open Studio → Sample messages for the bundled synthetic WAVs. Scene direction lets you override tone and room; Reset camera restores automatic framing after orbiting. Recorded messages use local pause detection where the browser can decode the file. Generated messages use ElevenLabs timing when available.

Open Photo avatar → Check available credits before uploading. Essentials estimates 135 credits (textured P2 mesh + v1 rig). Full Motion estimates 175 credits and adds relaxed standing, agree, greeting and walk. The browser resumes polling an active job when the Photo avatar tab is reopened. Keep the tab open to advance the job and save each result. Local jobs and GLBs live in the ignored .evervoice-avatars folder. Playback reads those files without calling Tripo. If a submission is interrupted before the provider returns a task ID, inspect Tripo history before attempting another job.
