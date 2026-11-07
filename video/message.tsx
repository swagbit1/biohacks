import {AbsoluteFill,Audio,interpolate,useCurrentFrame} from 'remotion';
export type FilmProps={recipient:string;occasion:string;words:string;audioUrl:string;seconds?:number};
export const filmDefaults:FilmProps={recipient:'Maya',occasion:'Graduation day',words:'Maya, look at you. I am so proud of you.',audioUrl:''};
export function FamilyMessage({recipient,occasion,words,audioUrl}:FilmProps){
  const frame=useCurrentFrame();
  return <AbsoluteFill style={{background:'radial-gradient(ellipse at 30% 10%,#42614e,#12251b 75%)',color:'#fff7e8',justifyContent:'center',padding:64,fontFamily:'Georgia',opacity:interpolate(frame,[0,12],[0,1],{extrapolateRight:'clamp'})}}>
    {audioUrl && <Audio src={audioUrl}/>}
    <div style={{color:'#c6df9d',letterSpacing:5,font:'700 13px system-ui'}}>EVERVOICE / {occasion.toUpperCase()}</div>
    <div style={{fontSize:70,margin:'12px 0'}}>For {recipient || 'you'}.</div>
    <div style={{fontSize:25,lineHeight:1.42,maxWidth:800,overflow:'hidden',maxHeight:215}}>{words}</div>
  </AbsoluteFill>;
}
