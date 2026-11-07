import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const portrait = document.querySelector('.portrait');
const fallback = portrait.querySelector('.head');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34,1,.1,100);
camera.position.set(0,.1,6.4);
const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(245,245);
renderer.domElement.setAttribute('aria-hidden','true');
const bust = new THREE.Group(), face = new THREE.Group();
scene.add(bust);
bust.add(face);
const sphere = new THREE.SphereGeometry(1,32,24);
function shape(parent,color,position,scale) {
  const mesh = new THREE.Mesh(sphere,new THREE.MeshStandardMaterial({color,roughness:.8}));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}
shape(bust,0x687b70,[0,-1.13,0],[.97,.43,.46]);
shape(bust,0xc98967,[0,-.79,0],[.29,.44,.28]);
shape(face,0xe5ab83,[0,.15,0],[.72,.88,.59]);
shape(face,0x302824,[0,.77,-.12],[.73,.41,.53]).rotation.z = -.15;
for (const side of [-1,1]) {
  shape(face,0xe5ab83,[side*.69,.1,0],[.13,.23,.14]);
  shape(face,0x392a26,[side*.26,.32,.54],[.066,.049,.037]);
  shape(face,0x53392e,[side*.26,.45,.51],[.123,.027,.034]).rotation.z = side*-.09;
}
shape(face,0xd59872,[0,.12,.58],[.11,.15,.12]);
const mouth = shape(face,0x773b39,[0,-.23,.55],[.22,.04,.043]);
scene.add(new THREE.HemisphereLight(0xffe9d5,0x395b50,2.3));
const key = new THREE.DirectionalLight(0xffe9dc,2.2);
key.position.set(-2,3,5);
scene.add(key);
fallback.hidden = true;
portrait.append(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', () => {
  renderer.domElement.hidden = true;
  fallback.hidden = false;
});
renderer.setAnimationLoop(time => {
  const openness = parseFloat(fallback.style.getPropertyValue('--mouth')) || 5;
  const tilt = parseFloat(fallback.style.getPropertyValue('--tilt')) || 0;
  mouth.scale.y = .023 + (openness-5)*.004;
  mouth.scale.x = .22 - (openness-5)*.002;
  face.rotation.z = tilt * Math.PI / 180;
  face.rotation.y = -.12 + Math.sin(time/2800)*.12;
  renderer.render(scene,camera);
});
