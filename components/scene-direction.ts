export type Tone='celebratory'|'warm'|'reflective';
export type Backdrop='living-room'|'reception'|'kitchen'|'study';
export type Cue={kind:'greeting'|'agree'|'walk';start:number;length:number;side:'Left'|'Right'};
export function direction(words:string,occasion:string,tone?:Tone,backdrop?:Backdrop){
  const context=(occasion+' '+words).toLowerCase();
  const inferred:Tone=/personal wishes|carry forward|remembrance|reflective/.test(context)?'reflective':/wedding|graduation|birthday|anniversary|congratulations|new chapter/.test(context)?'celebratory':'warm';
  const room:Backdrop=/wedding/.test(context)?'reception':/personal wishes|carry forward/.test(context)?'study':/new chapter|kitchen/.test(context)?'kitchen':'living-room';
  return {tone:tone||inferred,backdrop:backdrop||room};
}
export function timeline(words:string,duration:number,tone:Tone,ends?:number[],pauses:number[]=[]):Cue[]{
  if(!Number.isFinite(duration)||duration<1)return [];
  const cues:Cue[]=[];
  if(tone==='celebratory')cues.push({kind:'greeting',start:.15,length:Math.min(3.6,duration*.32),side:'Right'});
  const phrases=[...words.matchAll(/[^.!?;]+[.!?;]*/g)];
  const positions=pauses.length?pauses:phrases.map(match=>{
    const index=(match.index||0)+match[0].length-1;
    return ends?.[index]??duration*(index+1)/Math.max(1,words.length);
  });
  let last=tone==='celebratory'?1.5:0;
  for(const [index,at] of positions.entries()){
    if(!Number.isFinite(at)||at-last<(tone==='reflective'?11:3.4)||at>duration-1.5)continue;
    const kind=tone==='celebratory'&&index%3===1?'walk':'agree';
    cues.push({kind,start:Math.max(0,at-.25),length:kind==='walk'?1.55:2.25,side:index%2?'Left':'Right'});last=at;
  }
  if(tone==='celebratory'&&duration>8&&!cues.some(cue=>cue.kind==='walk'))
    cues.push({kind:'walk',start:duration*.54,length:1.55,side:'Left'});
  return cues.sort((a,b)=>a.start-b.start);
}
export function cueWeight(time:number,cue:Cue){
  const phase=(time-cue.start)/cue.length;
  return phase>0&&phase<1?Math.sin(Math.PI*phase)**2:0;
}
export async function audioPauses(blob:Blob){
  const context=new AudioContext();
  try{
    const buffer=await context.decodeAudioData(await blob.arrayBuffer());
    const signal=buffer.getChannelData(0), stride=Math.max(1,Math.floor(buffer.sampleRate*.08));
    const pauses:number[]=[];
    let quiet=0,hadSpeech=false;
    for(let i=0;i<signal.length;i+=stride){
      let sum=0,count=0;
      for(let j=i;j<Math.min(signal.length,i+stride);j+=8){sum+=signal[j]*signal[j];count++;}
      if(Math.sqrt(sum/count)<.018){quiet++;continue;}
      if(hadSpeech&&quiet>=3)pauses.push(i/buffer.sampleRate-.1);
      quiet=0;hadSpeech=true;
    }
    return pauses;
  }finally{await context.close();}
}
