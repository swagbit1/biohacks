import {Composition,registerRoot} from 'remotion';
import {FamilyMessage,filmDefaults} from './message';
function Root(){return <Composition id="FamilyMessage" component={FamilyMessage} width={960} height={540} fps={30} durationInFrames={450} defaultProps={filmDefaults} calculateMetadata={({props})=>({durationInFrames:Math.max(30,Math.ceil((props.seconds || 15)*30))})}/>;}
registerRoot(Root);
