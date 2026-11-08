
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {Button} from '../components/button';
import {GlideEntry} from '../components/glide-entry';
import {StoryIllustration} from '../components/story-illustration';
import {OnboardingVoice} from '../components/onboarding-voice';
import {ExtraStories} from '../components/preservation-notes';
import {
  AudioLines,
  ArrowRight,
  ArrowLeft,
  Heart,
  UserRound,
  Smile,
  BookHeart,
  Mic,
  ShieldCheck,
  Check
} from 'lucide-react';

type Profile = {
  name: string;
  traits: string[];
  humour: string;
  phrases: string;
  lovedOnes: string;
  memory: string;
  communication: string;
  joke: string;
};

const initialProfile: Profile = {
  name: '',
  traits: [],
  humour: '',
  phrases: '',
  lovedOnes: '',
  memory: '',
  communication: 'Typing',
  joke: ''
};

const sections = [
  { title: 'About you', icon: UserRound },
  { title: 'Your personality', icon: Smile },
  { title: 'Your people', icon: Heart },
  { title: 'Your memories', icon: BookHeart },
  { title: 'Your voice', icon: Mic }
];

const traits = [
  'Funny', 'Adventurous', 'Thoughtful',
  'Sarcastic', 'Outgoing', 'Quiet',
  'Creative', 'Caring', 'Laid-back',
  'Ambitious', 'Optimistic', 'Independent'
];

export default function Home() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [voiceBusy,setVoiceBusy]=useState(false);
  const [voiceNotes,setVoiceNotes]=useState('');

  useEffect(() => {
    try {
      const existing = localStorage.getItem('evervoice-profile');
      if (existing) setProfile({ ...initialProfile, ...JSON.parse(existing) });
      const notes=JSON.parse(localStorage.getItem('evervoice-interview')||'{}');
      if(typeof notes.styleExamples==='string')setVoiceNotes(notes.styleExamples);
    } catch {
      // Start with a blank profile if saved data cannot be read.
    }
  }, []);

  function update(field: keyof Profile, value: string | string[]) {
    setProfile(previous => ({ ...previous, [field]: value }));
  }

  function toggleTrait(trait: string) {
    const updated = profile.traits.includes(trait)
      ? profile.traits.filter(item => item !== trait)
      : [...profile.traits, trait];

    update('traits', updated);
  }

  function finish() {
    if (!consent) return;

    localStorage.setItem('evervoice-profile', JSON.stringify(profile));

    let previousNotes={};
    try{previousNotes=JSON.parse(localStorage.getItem('evervoice-interview')||'{}');}catch{}
    // Keep compatibility with the existing Studio Personality tab.
    localStorage.setItem(
      'evervoice-interview',
      JSON.stringify({
        ...previousNotes,
        styleExamples:voiceNotes,
        joke: profile.joke || profile.phrases,
        memory: profile.memory,
        name: profile.name,
        traits: profile.traits,
        humour: profile.humour,
        lovedOnes: profile.lovedOnes,
        communication: profile.communication
      })
    );

    setSaved(true);
    router.push('/studio');
  }

  const current = sections[step - 1];
  const progress = step === 0 ? 0 : (step / 5) * 100;

  return (
    <main className="compact-page onboarding-shell mx-auto max-w-6xl px-4 sm:px-6">

      {/* HEADER */}

      <header className="flex items-center justify-between border-b border-[var(--border)] py-3">
        <div className="flex items-center gap-3 font-semibold tracking-wide">
          <span className="rounded-full bg-[var(--blue)] p-2 text-[var(--navy)]">
            <AudioLines size={20}/>
          </span>
          EverVoice
          <span className="kicker">YOUR STORY</span>
        </div>

        <span className="kicker hidden sm:block">
          BIOHACKS 2026 · QUALITY OF LIFE
        </span>
      </header>

      <div className="compact-pane onboarding-content mx-auto w-full max-w-4xl py-3">

        {/* WELCOME SCREEN */}

        {step === 0 && (
          <section className="space-y-4">

            <div className="grid items-center gap-5 sm:grid-cols-[1.35fr_1fr]">
              <div className="space-y-4">
              <div className="kicker">A VOICE WORTH KEEPING</div>

              <h1 className="display text-3xl sm:text-4xl">
                Keep your voice. Share your story.
              </h1>

              <p className="max-w-2xl text-lg text-[var(--muted)]">
                Save the stories, expressions, and sounds your loved ones know by heart.
              </p>
              </div>
              <div className="flex justify-center [&>svg]:max-w-[220px]"><StoryIllustration/></div>
            </div>

            <div className="panel space-y-3">

              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-[var(--navy-raised)] p-4">
                  <Heart size={28} className="text-[var(--blue)]"/>
                </div>
                <div>
                  <h2 className="display text-2xl">
                    Your story matters.
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    This experience is about preserving more than words.
                  </p>
                </div>
              </div>

              <p className="text-[var(--muted)]">
                We'll walk through a few simple questions to understand
                who you are, how you communicate, and what you want
                your loved ones to remember.
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {Icon:Smile,label:'Your personality'},
                  {Icon:BookHeart,label:'Your memories'},
                  {Icon:Mic,label:'Your voice'},
                ].map(({Icon,label}) => (
                  <div key={label} className="rounded-xl border border-[var(--border)] p-4">
                    <Icon size={24} aria-hidden="true" className="text-[var(--gold)]"/>
                    <div className="mt-2 font-medium">{label}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(1)}
                className="flex w-full items-center justify-center gap-3 rounded-full bg-[var(--blue)] px-6 py-4 font-semibold text-[var(--navy)] transition hover:bg-[var(--blue-light)]"
              >
                Let's get started <ArrowRight size={18}/>
              </button>

              <p className="text-center text-xs text-[var(--muted)]">
                Take your time. You can pause whenever you need.
              </p>
            </div>
          </section>
        )}

        {/* QUESTIONNAIRE */}

        {step >= 1 && step <= 5 && (
          <section className="space-y-4">

            {/* PROGRESS */}

            <div className="space-y-4">

              <div className="flex justify-between">
                <span className="kicker">
                  GETTING TO KNOW YOU
                </span>
                <span className="text-sm text-[var(--blue)]">
                  {step} OF 5
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-[var(--navy-raised)]">
                <div
                  className="h-full rounded-full bg-[var(--blue)] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {sections.map((section, index) => {
                  const Icon = section.icon;
                  return (
                    <div
                      key={section.title}
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${
                        step === index + 1
                          ? 'border-[var(--blue)] bg-[var(--navy-raised)] text-[var(--blue)]'
                          : step > index + 1
                          ? 'border-[var(--blue)] text-[var(--blue-light)]'
                          : 'border-[var(--border)] text-[var(--muted)]'
                      }`}
                    >
                      {step > index + 1
                        ? <Check size={13}/>
                        : <Icon size={13}/>}
                      <span className="hidden sm:inline">
                        {section.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* QUESTION CARD */}

            <div className="panel space-y-4">

              <div className="space-y-2">
                <div className="kicker">
                  {String(step).padStart(2, '0')} / {current.title}
                </div>

                {step === 1 && (
                  <>
                    <h1 className="display text-3xl sm:text-4xl">
                      First things first. Who are you?
                    </h1>
                    <p className="text-[var(--muted)]">
                      Let's start with the basics.
                    </p>
                  </>
                )}

                {step === 2 && (
                  <>
                    <h1 className="display text-3xl sm:text-4xl">
                      What makes you, you?
                    </h1>
                    <p className="text-[var(--muted)]">
                      Your personality is part of your voice.
                    </p>
                  </>
                )}

                {step === 3 && (
                  <>
                    <h1 className="display text-3xl sm:text-4xl">
                      Tell us about your people.
                    </h1>
                    <p className="text-[var(--muted)]">
                      The people and relationships that matter most.
                    </p>
                  </>
                )}

                {step === 4 && (
                  <>
                    <h1 className="display text-3xl sm:text-4xl">
                      What stories stay with you?
                    </h1>
                    <p className="text-[var(--muted)]">
                      Little moments can mean everything.
                    </p>
                  </>
                )}

                {step === 5 && (
                  <>
                    <h1 className="display text-3xl sm:text-4xl">
                      How would you like to communicate?
                    </h1>
                    <p className="text-[var(--muted)]">
                      We want EverVoice to work around you.
                    </p>
                  </>
                )}
              </div>

              {/* STEP 1 */}

              {step === 1 && (
                <div className="space-y-5">
                  <div className="min-w-0">
                    <label className="block space-y-2">
                      What would you like us to call you?
                      <input
                        placeholder="Your preferred name"
                        value={profile.name}
                        onChange={e => update('name', e.target.value)}
                      />
                    </label>
                    <GlideEntry label="name" value={profile.name} onChange={value => update('name', value)}/>
                  </div>
                  <details className="studio-options">
                    <summary>Anything else you want to preserve?</summary>
                    <ExtraStories disabled={voiceBusy}/>
                  </details>
                  <OnboardingVoice name={profile.name} notes={voiceNotes} onNotes={setVoiceNotes} onBusy={setVoiceBusy}/>
                </div>
              )}

              {/* STEP 2 */}

              {step === 2 && (
                <div className="space-y-6">

                  <div>
                    <p className="mb-3 font-medium">
                      Pick the traits that describe you.
                    </p>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {traits.map(trait => (
                        <button
                          key={trait}
                          type="button"
                          aria-pressed={profile.traits.includes(trait)}
                          onClick={() => toggleTrait(trait)}
                          className={`rounded-xl border p-3 text-sm transition ${
                            profile.traits.includes(trait)
                              ? 'border-[var(--blue)] bg-[var(--navy-raised)] text-[var(--blue-light)]'
                              : 'border-[var(--border)] bg-[var(--navy)] text-[var(--muted)] hover:border-[var(--blue)]'
                          }`}
                        >
                          {profile.traits.includes(trait) ? '✓ ' : ''}
                          {trait}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label className="block space-y-2">
                      How would you describe your sense of humour?
                      <textarea
                        rows={3}
                        placeholder="I'm usually sarcastic, love making people laugh..."
                        value={profile.humour}
                        onChange={e => update('humour', e.target.value)}
                      />
                    </label>
                    <GlideEntry label="sense of humour" value={profile.humour} onChange={value => update('humour', value)}/>
                  </div>

                  <div className="min-w-0">
                    <label className="block space-y-2">
                      Do you have any favourite phrases or expressions?
                      <textarea
                        rows={3}
                        placeholder="Something you always say..."
                        value={profile.phrases}
                        onChange={e => update('phrases', e.target.value)}
                      />
                    </label>
                    <GlideEntry label="favourite phrases" value={profile.phrases} onChange={value => update('phrases', value)}/>
                  </div>

                  <details className="studio-options">
                    <summary>Anything else you want to preserve?</summary>
                    <ExtraStories disabled={voiceBusy}/>
                  </details>
                  <OnboardingVoice name={profile.name} notes={voiceNotes} onNotes={setVoiceNotes} onBusy={setVoiceBusy}/>
                </div>
              )}

              {/* STEP 3 */}

              {step === 3 && (
                <div className="min-w-0">
                  <label className="block space-y-2">
                    Who are the people you would most like to preserve
                    messages or memories for?
                    <textarea
                      rows={5}
                      placeholder="My children, my partner, my siblings, my closest friends..."
                      value={profile.lovedOnes}
                      onChange={e => update('lovedOnes', e.target.value)}
                    />
                  </label>
                  <GlideEntry label="loved ones" value={profile.lovedOnes} onChange={value => update('lovedOnes', value)}/>
                  <details className="studio-options">
                    <summary>Anything else you want to preserve?</summary>
                    <ExtraStories disabled={voiceBusy}/>
                  </details>
                  <OnboardingVoice name={profile.name} notes={voiceNotes} onNotes={setVoiceNotes} onBusy={setVoiceBusy}/>
                </div>
              )}

              {/* STEP 4 */}

              {step === 4 && (
                <div className="space-y-5">
                  <div className="min-w-0">
                    <label className="block space-y-2">
                      What's a memory that always makes you smile?
                      <textarea
                        rows={5}
                        placeholder="Tell us a story. It doesn't have to be long."
                        value={profile.memory}
                        onChange={e => update('memory', e.target.value)}
                      />
                    </label>
                    <GlideEntry label="memory" value={profile.memory} onChange={value => update('memory', value)}/>
                  </div>

                  <div className="min-w-0">
                    <label className="block space-y-2">
                      What's a joke or saying that your loved ones
                      would immediately recognize as yours?
                      <textarea
                        rows={3}
                        placeholder="Your signature joke or expression..."
                        value={profile.joke}
                        onChange={e => update('joke', e.target.value)}
                      />
                    </label>
                    <GlideEntry label="joke or saying" value={profile.joke} onChange={value => update('joke', value)}/>
                  </div>
                  <details className="studio-options">
                    <summary>Anything else you want to preserve?</summary>
                    <ExtraStories disabled={voiceBusy}/>
                  </details>
                  <OnboardingVoice name={profile.name} notes={voiceNotes} onNotes={setVoiceNotes} onBusy={setVoiceBusy}/>
                </div>
              )}

              {/* STEP 5 */}

              {step === 5 && (
                <div className="space-y-4">
                  <p className="font-medium">
                    Which way of interacting works best for you?
                  </p>

                  {[
                    ['Typing', 'I prefer typing my responses.'],
                    ['Speaking', 'I prefer speaking when possible.'],
                    ['Assisted communication', 'I use assistive communication tools.'],
                    ['A combination', 'I like having multiple options.']
                  ].map(([value, description]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={profile.communication === value}
                      onClick={() => update('communication', value)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${
                        profile.communication === value
                          ? 'border-[var(--blue)] bg-[var(--navy-raised)]'
                          : 'border-[var(--border)] bg-[var(--navy)] hover:border-[var(--blue)]'
                      }`}
                    >
                      <div>
                        <div className="font-medium">{value}</div>
                        <div className="text-sm text-[var(--muted)]">
                          {description}
                        </div>
                      </div>
                      {profile.communication === value && (
                        <Check className="shrink-0 text-[var(--blue)]"/>
                      )}
                    </button>
                  ))}
                  <details className="studio-options">
                    <summary>Anything else you want to preserve?</summary>
                    <ExtraStories disabled={voiceBusy}/>
                  </details>
                  <OnboardingVoice name={profile.name} notes={voiceNotes} onNotes={setVoiceNotes} onBusy={setVoiceBusy}/>
                </div>
              )}

              {/* NAVIGATION */}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">

                <button
                  disabled={voiceBusy}
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-2 rounded-full border border-[var(--border)] px-5 py-3 text-sm hover:border-[var(--blue)]"
                >
                  <ArrowLeft size={16}/> Back
                </button>

                <Button disabled={voiceBusy} onClick={() => setStep(step + 1)}>
                  {step === 5 ? 'Review your story' : 'Continue'}
                  <ArrowRight size={18} aria-hidden="true"/>
                </Button>

              </div>

              <p className="text-center text-xs text-[var(--muted)]">
                Your answers are saved when you finish. You can skip
                questions that you don't feel comfortable answering.
              </p>

            </div>
          </section>
        )}

        {/* FINAL REVIEW */}

        {step === 6 && (
          <section className="space-y-6">
            <div className="kicker">YOUR STORY / FINAL REVIEW</div>

            <h1 className="display text-3xl sm:text-4xl">
              This is you.
            </h1>

            <p className="text-[var(--muted)]">
              Here's what you've shared with EverVoice.
              You can go back and make changes at any time.
            </p>

            <div className="panel space-y-5">
              <div>
                <div className="kicker">YOUR NAME</div>
                <h2 className="display text-2xl">
                  {profile.name || 'Not provided'}
                </h2>
              </div>

              <div>
                <div className="kicker">YOUR PERSONALITY</div>
                <p>{profile.traits.join(' · ') || 'Not provided'}</p>
                <p className="mt-2 text-[var(--muted)]">{profile.humour}</p>
              </div>

              <div>
                <div className="kicker">YOUR PEOPLE</div>
                <p>{profile.lovedOnes || 'Not provided'}</p>
              </div>

              <div>
                <div className="kicker">YOUR MEMORIES</div>
                <p>{profile.memory || 'Not provided'}</p>
              </div>

              <div>
                <div className="kicker">YOUR COMMUNICATION</div>
                <p>{profile.communication}</p>
              </div>

              <div className="rounded-xl border border-[var(--border)] p-4">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={e => setConsent(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I confirm that I want to save the information
                    I've provided on this device and understand that
                    I can edit or delete it later.
                  </span>
                </label>
              </div>

              <p className="text-xs text-[var(--muted)]">
                This consent only covers saving your questionnaire
                responses locally. Voice recording, synthetic voice
                creation and sharing require separate permissions.
              </p>

              <button
                disabled={!consent || saved}
                onClick={finish}
                className="flex w-full items-center justify-center gap-3 rounded-full bg-[var(--blue)] p-4 font-semibold text-[var(--navy)] transition hover:bg-[var(--blue-light)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ShieldCheck size={18}/>
                Save my story and enter EverVoice
                <ArrowRight size={18}/>
              </button>

              <button
                onClick={() => setStep(5)}
                className="w-full text-sm text-[var(--muted)] hover:text-white"
              >
                Go back and edit
              </button>
            </div>
          </section>
        )}

      </div>

    </main>
  );
}
