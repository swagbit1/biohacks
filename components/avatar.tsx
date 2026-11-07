'use client';
import {Canvas,useFrame} from '@react-three/fiber';
import {Component,useRef,type ReactNode,type RefObject} from 'react';
import type {Group,Mesh} from 'three';
export type Motion = {level:number; mood:string; playing:boolean};
type Vec = [number,number,number];
function Form({p,s,c}:{p:Vec;s:Vec;c:string}) {
  return <mesh position={p} scale={s}><sphereGeometry args={[1,36,24]}/><meshStandardMaterial color={c} roughness={.8}/></mesh>;
}
function Portrait({motion}:{motion:RefObject<Motion>}) {
  const head=useRef<Group>(null), mouth=useRef<Mesh>(null), eyes=useRef<Group>(null);
  useFrame(({clock}) => {
    const t=clock.elapsedTime, {level,mood,playing}=motion.current;
    if (!head.current || !mouth.current || !eyes.current) return;
    head.current.rotation.y=-.14+Math.sin(t*.65)*.11;
    head.current.rotation.z=playing ? Math.sin(t*2)*(mood==='Playful'?.12:.035) : .025;
    mouth.current.scale.y=.028+level*.105;
    mouth.current.scale.x=mood==='Serious'?.15:.22-level*.035;
    eyes.current.scale.y=t%5.3>5.15?.2:1;
  });
  return <group position={[0,-.25,0]}>
    <Form p={[0,-1.2,0]} s={[1.12,.5,.46]} c="#577866"/>
    <Form p={[0,-.82,0]} s={[.29,.47,.29]} c="#b87656"/>
    <group ref={head}>
      <Form p={[0,.12,0]} s={[.7,.88,.6]} c="#d99a72"/>
      <Form p={[-.1,.74,-.11]} s={[.69,.39,.55]} c="#2b2524"/>
      <Form p={[-.36,.66,.12]} s={[.37,.27,.42]} c="#362d2b"/>
      <Form p={[0,.06,.58]} s={[.11,.15,.12]} c="#c28362"/>
      <group ref={eyes} position={[0,.29,0]}>
        {[-1,1].map(side=><group key={side}>
          <Form p={[side*.26,0,.54]} s={[.077,.045,.035]} c="#302221"/>
          <Form p={[side*.26,.12,.53]} s={[.13,.028,.03]} c="#48332e"/>
        </group>)}
      </group>
      {[-1,1].map(side=><Form key={side} p={[side*.68,.04,-.03]} s={[.13,.23,.14]} c="#cc8a64"/>)}
      <mesh ref={mouth} position={[0,-.27,.54]}><sphereGeometry args={[1,32,16]}/><meshStandardMaterial color="#733e36"/></mesh>
    </group>
  </group>;
}
class Fallback extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="grid h-full place-items-center text-7xl" aria-label="Alex portrait">◉</div>:this.props.children;}
}
export default function Avatar({motion}:{motion:RefObject<Motion>}) {
  return <div className="h-72 sm:h-96" aria-label="Stylized 3D portrait of Alex"><Fallback><Canvas camera={{position:[0,0,5.5],fov:36}} dpr={[1,1.6]}><hemisphereLight args={['#fff1dc','#4c6a60',2]}/><directionalLight color="#ffdfbc" position={[-3,4,5]} intensity={2.7}/><Portrait motion={motion}/></Canvas></Fallback></div>;
}
