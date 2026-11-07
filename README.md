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
