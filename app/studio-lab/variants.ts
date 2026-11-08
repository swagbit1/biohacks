export const studioVariants=[
  {id:'aurora',letter:'A',name:'Aurora',palette:'Ice blue and violet',layout:'Split view',description:'Two balanced panes under a floating control bar.'},
  {id:'ember',letter:'B',name:'Ember',palette:'Amber and rose',layout:'Theater view',description:'A wide player above a compact editing desk.'},
  {id:'orbit',letter:'A',name:'Orbit',palette:'Mint and jade',layout:'Command rail',description:'The default Studio layout with tinted jade glass.'},
  {id:'orbit-blue',letter:'B',name:'Orbit Clear Blue',palette:'Clear glass and ice blue',layout:'Command rail',description:'The same workspace with clearer glass and cool blue lighting.'},
] as const;

export const comparisonVariants=studioVariants.filter(item=>item.id==='orbit'||item.id==='orbit-blue');
