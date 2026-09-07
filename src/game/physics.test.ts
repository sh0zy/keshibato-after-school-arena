import { afterEach, describe, expect, it } from 'vitest'
import { createPhysics, FIXED_STEP } from './physics'
import type { PhysicsGame } from './physics'
import { BODIES, COMBOS, CPU_BUILDS, DEFAULT_BUILD, PARTS, STAGES } from './catalog'
import { getAssemblyStats, getEquipmentTransform, validateBuild } from './equipment'
import type { BattleConfig, BattleSnapshot, Build, Shot } from './types'
import { importBuild, validateStage } from './storage'

const bare:Build={...structuredClone(DEFAULT_BUILD),equipment:[]}
const shot:Shot={direction:{x:1,y:0,z:0},power:.4,offset:0,jump:false,strike:false,magnet:'off',chalk:false,glue:false,curve:0}
const worlds:PhysicsGame[]=[]
function config(build=bare,stage=STAGES[0]):BattleConfig{return{stage:structuredClone(stage),players:[{build:structuredClone(build),name:'P1',team:0,cpu:false},{build:structuredClone(build),name:'P2',team:1,cpu:false}],mode:'local',difficulty:'normal',firstPlayer:0,seed:43}}
async function create(c=config()){const w=await createPhysics(c);worlds.push(w);return w}
function finish(w:PhysicsGame,max=5000){for(let i=0;i<max&&w.view().phase==='simulating';i++)w.step(FIXED_STEP);return w.view()}
function editable(w:PhysicsGame){const s=w.snapshot() as BattleSnapshot&{physics?:number[];engine?:unknown};delete s.physics;delete s.engine;return s}
afterEach(()=>{worlds.splice(0).forEach(w=>w.dispose())})
describe('assemblies and safe data',()=>{
 it('allows zero, one, two and duplicate equipment while rejecting a third',()=>{expect(validateBuild(bare).equipment).toHaveLength(0);for(const count of [1,2]){const b={...bare,equipment:Array.from({length:count},(_,i)=>({id:'binder_clip',socket:i?'back' as const:'front' as const,rotation:0}))};expect(validateBuild(b).equipment).toHaveLength(count);expect(getAssemblyStats(b).mass).toBeCloseTo(1+.46*count)}expect(()=>validateBuild({...bare,equipment:[{id:'ruler',socket:'front',rotation:0},{id:'pencil',socket:'back',rotation:0},{id:'brush',socket:'left',rotation:0}]})).toThrow('2個')})
 it('all 20 types can be mounted twice and all 24 combinations are valid',()=>{expect(PARTS).toHaveLength(20);expect(BODIES).toHaveLength(6);expect(STAGES).toHaveLength(10);expect(COMBOS).toHaveLength(24);for(const p of PARTS)expect(()=>validateBuild({...bare,equipment:[{id:p.id,socket:'front',rotation:0},{id:p.id,socket:'back',rotation:0}]})).not.toThrow();for(const c of COMBOS)expect(()=>validateBuild({...bare,equipment:[{id:c.ids[0],socket:'front',rotation:0},{id:c.ids[1],socket:'back',rotation:0}]})).not.toThrow();CPU_BUILDS.forEach(b=>expect(()=>validateBuild(b)).not.toThrow())})
 it('moves the center of mass with the mounting location',()=>{const front={...bare,equipment:[{id:'sharpener',socket:'front' as const,rotation:0}]},back={...bare,equipment:[{id:'sharpener',socket:'back' as const,rotation:0}]};expect(getAssemblyStats(front).center.z).toBeGreaterThan(0);expect(getAssemblyStats(back).center.z).toBeLessThan(0);expect(getEquipmentTransform(front,front.equipment[0]).position.z).toBeGreaterThan(1.5)})
 it('rejects overlapping sockets, malformed JSON and oversized stage content',()=>{expect(()=>validateBuild({...bare,equipment:[{id:'ruler',socket:'front',rotation:0},{id:'pencil',socket:'front',rotation:0}]})).toThrow();expect(()=>importBuild(JSON.stringify({version:1,build:{...bare,color:'transparent'}}))).toThrow();expect(()=>validateStage({...STAGES[0],objects:Array(41).fill(STAGES[0].objects[0])})).toThrow();expect(()=>validateStage({...STAGES[0],spawns:[{x:80,y:0,z:0},{x:0,y:0,z:0}]})).toThrow()})
})
describe('3D rules',()=>{
 it('keeps the entire board unchanged for arbitrary thinking time',async()=>{const w=await create();const before=w.view();for(let i=0;i<10000;i++)w.step(60);expect(w.view()).toEqual(before)})
 it('accepts one shot only, then advances after physical rest',async()=>{const w=await create();expect(w.shoot(shot)).toBe(true);expect(w.shoot(shot)).toBe(false);const end=finish(w);expect(end.phase).toBe('aiming');expect(end.currentPlayer).toBe(1);expect(end.turn).toBe(2)})
 it('matches display mass with real compound rigid-body mass',async()=>{const w=await create(config(DEFAULT_BUILD));expect(w.actors[0].body.mass()).toBeCloseTo(getAssemblyStats(DEFAULT_BUILD).mass,5)})
 it('pauses mid-flight and restores the exact physical trajectory',async()=>{const w=await create();w.shoot({...shot,power:.65,offset:.65});for(let i=0;i<25;i++)w.step(FIXED_STEP);w.pause();const saved=w.snapshot(),before=w.view();w.step(500);expect(w.view()).toEqual(before);w.resume();const a=finish(w);w.restore(saved);w.resume();const b=finish(w);expect(b.currentPlayer).toBe(a.currentPlayer);expect(b.actors[0].position.x).toBeCloseTo(a.actors[0].position.x,4);expect(b.actors[0].rotation.y).toBeCloseTo(a.actors[0].rotation.y,4)})
 it('declares simultaneous falls a draw only after resolution',async()=>{const w=await create(),s=editable(w);s.actors.forEach(a=>{a.position.y=-9});w.restore(s);w.shoot({...shot,power:.02});w.step(FIXED_STEP);expect(w.view().phase).toBe('simulating');const end=finish(w);expect(end.phase).toBe('result');expect(end.draw).toBe(true);expect(end.winner).toBeNull()})
 it('handles an opponent-only fall and preserves the survivor',async()=>{const w=await create(),s=editable(w);s.actors[1].position.y=-9;w.restore(s);w.shoot({...shot,power:.02});const end=finish(w);expect(end.winner).toBe(0);expect(end.draw).toBe(false)})
 it('does not eliminate a supported overhang or a lower book landing',async()=>{const w=await create(),s=editable(w);s.actors[0].position={x:11.65,y:.32,z:0};w.restore(s);w.shoot({...shot,direction:{x:-1,y:0,z:0},power:.02});expect(finish(w).actors[0].fallen).toBe(false);const lower=await create(config(bare,STAGES.find(s=>s.id==='book_steps')!)),snap=editable(lower);snap.actors[0].position={x:8,y:-1.16,z:6.6};lower.restore(snap);lower.shoot({...shot,power:.02});expect(finish(lower).actors[0].fallen).toBe(false)})
 it('keeps unlimited turn numbers and consistent fixed-step render rates',async()=>{const w=await create(),s=editable(w);s.turn=100000;w.restore(s);w.shoot({...shot,power:.12});expect(finish(w).turn).toBe(100001);const a=await create(),b=await create();a.shoot(shot);b.shoot(shot);for(let i=0;i<450;i++){a.step(1/30);b.step(1/60);b.step(1/60)}expect(a.view().actors[0].position.x).toBeCloseTo(b.view().actors[0].position.x,5)})
 it('prediction uses the physical world but does not mutate the game',async()=>{const w=await create();const before=w.view();const points=w.predict(shot,90);expect(points.length).toBeGreaterThan(2);expect(w.view()).toEqual(before)})
})
