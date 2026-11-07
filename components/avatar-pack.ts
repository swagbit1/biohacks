export const packCost={essentials:135,full:175} as const;
export type Pack=keyof typeof packCost;
export const clips={idle:'standing_relax',agree:'agree',greeting:'greet_01',walk:'walk'} as const;
export type Clip=keyof typeof clips;
export type Asset='mesh'|'rig'|Clip;
export const assetNames:Record<Asset,string>={mesh:'Textured mesh',rig:'Rig',idle:'Relaxed standing',agree:'Agree',greeting:'Greeting',walk:'Walk'};
export const assetKeys=Object.keys(assetNames) as Asset[];
