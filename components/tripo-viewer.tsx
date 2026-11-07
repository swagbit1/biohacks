'use client';
import {Canvas,useFrame,useLoader,useThree} from '@react-three/fiber';
import {Component,Suspense,useEffect,useMemo,useRef,type ReactNode,type RefObject} from 'react';
import {AnimationClip,AnimationMixer,AnimationUtils,Box3,Vector3,SkeletonHelper,Mesh,Bone,Euler,Quaternion,LoopPingPong,type AnimationAction} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import type {Motion} from './avatar';
import {cueWeight,type Cue,type Tone} from './scene-direction';
export type Cinematic={audio:RefObject<HTMLAudioElement|null>;clips:Partial<Record<'greeting'|'agree'|'walk'|'accent',string>>;cues:Cue[];tone:Tone;front:'x'|'z';reset:number};
type ViewerProps={url:string;motion:RefObject<Motion>;animate?:boolean;showRig?:boolean;cinematic?:Cinematic};
function Model({url,motion,animate=true,showRig=false,cinematic}:ViewerProps){
  const {greeting,agree,walk,accent}=cinematic?.clips||{};
  const urls=useMemo(()=>[url,greeting||url,agree||url,walk||url,accent||url],[url,greeting,agree,walk,accent]);
  const [gltf,greetModel,agreeModel,walkModel,idle]=useLoader(GLTFLoader,urls);
  const scene=useMemo(()=>clone(gltf.scene),[gltf.scene]);
  const {camera,gl}=useThree();
  const placement=useMemo(()=>{
    const box=new Box3().setFromObject(scene), center=box.getCenter(new Vector3()), size=box.getSize(new Vector3());
    const scale=2.5/Math.max(size.x,size.y,size.z,.001);
    return {scale,position:center.multiplyScalar(-scale)};
  },[scene]);
  const mixer=useMemo(()=>new AnimationMixer(scene),[gltf]);
  const skeleton=useMemo(()=>new SkeletonHelper(scene),[gltf]);
  useEffect(()=>()=>skeleton.dispose(),[skeleton]);
  const cueActions=useRef<Partial<Record<Cue['kind'],AnimationAction>>>({});
  const baseAction=useRef<AnimationAction|null>(null);
  const orbit=useRef<OrbitControls|null>(null);
  const manualCamera=useRef(false);
  const quietIdle=useRef<AnimationAction|null>(null);
  const target=useMemo(()=>new Vector3(),[]);
  useEffect(()=>{
    if(cinematic)camera.position.set(...(cinematic.front==='x'?[3.4,.52,.06]:[.06,.52,3.4]) as [number,number,number]);
    const controls=new OrbitControls(camera,gl.domElement);
    orbit.current=controls;
    controls.enablePan=false;controls.minDistance=1.8;controls.maxDistance=10;
    if(cinematic){controls.target.set(0,.52,0);controls.update();}
    const takeOver=()=>{manualCamera.current=true;};
    controls.addEventListener('start',takeOver);
    const clip=gltf.animations[0];
    const action=clip?mixer.clipAction(clip).reset().setLoop(LoopPingPong,Infinity).play():null;
    const actions:Partial<Record<Cue['kind'],AnimationAction>>={};
    for(const [kind,asset,available] of [['greeting',greetModel,greeting],['agree',agreeModel,agree],['walk',walkModel,walk]] as const){
      if(!available||!asset.animations[0])continue;
      const clip=asset.animations[0].clone();
      // Walking is in place; preserve the base placement of the root.
      if(kind==='walk')clip.tracks=clip.tracks.filter(track=>!/(root|hips)\.position$/i.test(track.name));
      const cue=mixer.clipAction(clip).setEffectiveWeight(0).play();
      cue.paused=true;actions[kind]=cue;
    }
    cueActions.current=actions;
    baseAction.current=action;
    const source=accent?idle.animations[0]:undefined;
    // v3 and v1 have different rest poses. Use only small relative rotations
    // on matching upper-body joints, preserving the v1 stance and foot placement.
    const tracks=source?.tracks.filter(track=>/^(mixamorig)?(Spine1|Spine2|Neck|Head)\.quaternion$/i.test(track.name));
    const idleClip=source&&tracks?.length?AnimationUtils.makeClipAdditive(new AnimationClip('Quiet idle accents',source.duration,tracks.map(track=>track.clone()))):null;
    const accentAction=idleClip?mixer.clipAction(idleClip).setLoop(LoopPingPong,Infinity).setEffectiveWeight(0).play():null;
    quietIdle.current=accentAction;
    return ()=>{controls.removeEventListener('start',takeOver);controls.dispose();action?.stop();Object.values(actions).forEach(cue=>cue.stop());accentAction?.stop();mixer.uncacheRoot(scene);};
  },[camera,gl,gltf,greetModel,agreeModel,walkModel,idle,mixer,greeting,agree,walk,accent,cinematic?.front]);
  useEffect(()=>{manualCamera.current=false;},[cinematic?.reset]);
  const jaws=useMemo(()=>{
    const targets:{mesh:Mesh;index:number}[]=[];
    scene.traverse(node=>{
      if(!(node instanceof Mesh)||!node.morphTargetDictionary||!node.morphTargetInfluences)return;
      const name=Object.keys(node.morphTargetDictionary).find(key=>/^(jaw[_. -]?open|mouth[_. -]?open|viseme[_. -]?aa)$/i.test(key));
      if(name)targets.push({mesh:node,index:node.morphTargetDictionary[name]});
    });
    return targets;
  },[scene]);
  // Apply small joint offsets over the provider clip, restoring its pose before each mixer tick.
  const joints=useMemo(()=>{
    const result=new Map<string,{bone:Bone;base:Quaternion}>();
    scene.traverse(node=>{
      if(node instanceof Bone)result.set(node.name.replace(/^mixamorig:?/i,''),{bone:node,base:node.quaternion.clone()});
    });
    return result;
  },[scene]);
  const gesture=useRef({time:0,weight:0,energy:0,rotation:new Euler(),offset:new Quaternion(),parent:new Quaternion(),inverse:new Quaternion()});
  useFrame((_state,delta)=>{
    delta=Math.min(delta,1/30);
    for(const {bone,base} of joints.values())bone.quaternion.copy(base);
    const audio=cinematic?.audio.current;
    const time=audio?.currentTime||0;
    const reduced=Boolean(cinematic)&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cues=cinematic?.cues||[];
    const active=cues.filter(cue=>cueWeight(time,cue)>0);
    if(cinematic){
      if(!manualCamera.current){
        const step=reduced?0:Math.max(0,...active.filter(cue=>cue.kind==='walk').map(cue=>cueWeight(time,cue)));
        const distance=3.4+.62*step;
        camera.position.set(cinematic.front==='x'?distance:.06,.52-.08*step,cinematic.front==='x'?.06:distance);
        camera.lookAt(target.set(0,.52-.13*step,0));orbit.current?.target.copy(target);
      }
      let total=0;
      for(const kind of ['greeting','agree','walk'] as const){
        const action=cueActions.current[kind], cue=active.find(item=>item.kind===kind);
        if(!action)continue;
        const weight=cue&&!reduced?cueWeight(time,cue)*(kind==='walk'?.72:kind==='greeting'?.38:.45):0;
        if(cue)action.time=action.getClip().duration*Math.min(.999,(time-cue.start)/cue.length);
        action.setEffectiveWeight(weight);total+=weight;
      }
      baseAction.current?.setEffectiveWeight(Math.max(0,1-total));
      quietIdle.current?.setEffectiveWeight(reduced?0:.18*Math.max(0,1-total));
    }
    if(animate)mixer.update(delta);
    for(const {bone,base} of joints.values())base.copy(bone.quaternion);
    const state=gesture.current;
    const speaking=animate&&!reduced&&motion.current.playing;
    state.weight+=((speaking?1:0)-state.weight)*(1-Math.exp(-6*delta));
    state.energy+=((speaking?motion.current.level:0)-state.energy)*(1-Math.exp(-4*delta));
    if(state.weight>.001)state.time+=delta;
    else state.time=0;
    if(state.weight>.001){
      const t=cinematic?time:state.time, energy=state.energy;
      const sway=Math.sin(t*.85);
      // Stagger the hands and shape each phrase as a lift, reach, hold, and release.
      const phrase=(offset:number)=>{
        const phase=((t+offset)%4.8)/4.8;
        const ease=(value:number)=>{const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x);};
        return {
          lift:ease(phase/.22)*(1-ease((phase-.60)/.37)),
          reach:ease((phase-.12)/.23)*(1-ease((phase-.52)/.36)),
          turn:ease((phase-.23)/.18)*(1-ease((phase-.59)/.25)),
        };
      };
      const right=phrase(0),left=phrase(2.4);
      const strength=(cinematic?.audio ? .19 : 1)*(.72+.28*energy)*state.weight;
      // Convert stage axes to the joint's parent space. Mixamo bone axes differ by limb.
      const rotate=(name:string,x:number,y:number,z:number)=>{
        const joint=joints.get(name);
        if(!joint?.bone.parent)return;
        joint.bone.parent.getWorldQuaternion(state.parent);
        state.inverse.copy(state.parent).invert();
        state.offset.setFromEuler(state.rotation.set(cinematic?.front==='x'?z:x,y,cinematic?.front==='x'?-x:z));
        joint.bone.quaternion.premultiply(state.inverse.multiply(state.offset).multiply(state.parent));
      };
      rotate('Spine2',.04*(right.reach+left.reach)*strength,.045*(right.reach-left.reach)*strength,.025*sway*strength);
      rotate('Head',(.06*right.reach-.035*left.reach)*strength,.12*(left.reach-right.reach)*strength,.04*sway*strength);
      for(const [side,sign,shape] of [['Right',-1,right],['Left',1,left]] as const){
        rotate(side+'Shoulder',-.10*shape.reach*strength,0,sign*.06*shape.lift*strength);
        rotate(side+'Arm',-(.20*shape.lift+.30*shape.reach)*strength,sign*.12*shape.turn*strength,sign*.20*shape.lift*strength);
        rotate(side+'ForeArm',-(.38*shape.lift+.23*shape.reach)*strength,sign*.16*shape.turn*strength,sign*.09*shape.reach*strength);
        rotate(side+'Hand',.17*shape.turn*strength,sign*.38*shape.turn*strength,sign*.10*shape.lift*strength);
      }
      rotate('LeftUpLeg',.045*sway*state.weight,0,0);
      rotate('RightUpLeg',-.045*sway*state.weight,0,0);
      rotate('LeftLeg',.055*Math.max(0,-sway)*state.weight,0,0);
      rotate('RightLeg',.055*Math.max(0,sway)*state.weight,0,0);
      if(cinematic){
        for(const cue of active){
          if(cueActions.current[cue.kind])continue;
          const amount=cueWeight(time,cue)*state.weight;
          const sign=cue.side==='Right'?-1:1;
          if(cue.kind==='walk'){
            rotate(cue.side+'UpLeg',-.20*amount,0,0);
            rotate(cue.side+'Leg',.32*amount,0,0);
            rotate(cue.side+'Foot',-.12*amount,0,0);
          }else{
            const emphasis=cinematic.tone==='reflective'?.35:cinematic.tone==='warm'?.62:1;
            rotate(cue.side+'Arm',-.42*amount*emphasis,0,sign*.25*amount*emphasis);
            rotate(cue.side+'ForeArm',-.48*amount*emphasis,sign*.12*amount,0);
            rotate('Head',.10*amount,-sign*.09*amount,0);
          }
        }
      }
    }
    for(const {mesh,index} of jaws){
      const weights=mesh.morphTargetInfluences!;
      weights[index]+=(motion.current.level-weights[index])*(1-Math.exp(-18*delta));
    }
  });
  return <><primitive object={scene} position={placement.position} scale={placement.scale}/>{showRig&&<primitive object={skeleton}/>}</>;
}
class ViewerBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<p className="p-6">This model could not be rendered. Check that the file is a valid GLB.</p>:this.props.children;}
}
export default function TripoViewer({url,motion,animate,showRig,cinematic}:ViewerProps){
  return <div className="h-72 sm:h-96" aria-label="Generated 3D character">
    <ViewerBoundary key={url}><Canvas camera={{position:[0,0,5.8],fov:35}} dpr={1} fallback={<p>WebGL is unavailable.</p>}>
      <hemisphereLight args={['#fff4dd','#52665d',2]}/><directionalLight intensity={2.6} position={[-3,4,5]}/>
      <Suspense fallback={null}><Model url={url} motion={motion} animate={animate} showRig={showRig} cinematic={cinematic}/></Suspense>
    </Canvas></ViewerBoundary>
  </div>;
}
