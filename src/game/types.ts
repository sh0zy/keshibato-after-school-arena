export interface Vec3 { x:number; y:number; z:number }
export interface Quat { x:number; y:number; z:number; w:number }
export type Socket = 'front'|'back'|'left'|'right'|'top_left'|'top_right'
export interface Equipment { id:string; socket:Socket; rotation:number }
export interface Build { body:string; equipment:Equipment[]; name:string; color:string; sleeve:string; face:string; pattern:string }
export interface ShapeSpec { kind:'box'|'ball'|'cylinder'|'hull'; size:Vec3; position:Vec3; rotation?:Quat; points?:number[] }
export interface BodyDef { id:string; name:string; subtitle:string; description:string; weakness:string; size:Vec3; mass:number; friction:number; restitution:number; color:string; model:string }
export interface PartDef { id:string; name:string; shortName:string; description:string; tactic:string; weakness:string; category:string; color:string; mass:number; friction:number; restitution:number; metal:boolean; sockets:Socket[]; model:string; icon:string; shapes:ShapeSpec[]; active?:'jump'|'strike'|'magnet'|'chalk'|'glue'|'curve'; passive?:'glide'|'slide'|'brush'|'predict'; maxForce?:number }
export interface StageObject { id:string; kind:'desk'|'book'|'ruler'|'bridge'|'bumper'|'mat'|'case'|'seesaw'; position:Vec3; size:Vec3; rotation?:number; tilt?:number; color?:string; friction?:number; dynamic?:boolean }
export interface StageDef { id:string; name:string; subtitle:string; description:string; difficulty:string; color:string; objects:StageObject[]; spawns:Vec3[]; fallY:number; music:string; night?:boolean }
export interface Combo { ids:[string,string]; name:string; description:string; tag:string }
export type GameMode = 'cpu'|'local'|'practice'|'challenge'|'tour'|'tournament'|'team'|'custom'
export type Difficulty = 'easy'|'normal'|'hard'
export interface Shot { direction:Vec3; power:number; offset:number; jump:boolean; strike:boolean; magnet:'off'|'attract'|'repel'; chalk:boolean; glue:boolean; curve:number }
export interface PlayerConfig { build:Build; team:number; cpu:boolean; name:string }
export interface BattleConfig { stage:StageDef; players:PlayerConfig[]; mode:GameMode; difficulty:Difficulty; firstPlayer:number; seed:number; challengeId?:string }
export interface ActorState { position:Vec3; rotation:Quat; velocity:Vec3; angularVelocity:Vec3; fallen:boolean }
export interface SurfaceArea { owner:number; kind:'chalk'|'glue'; position:Vec3; radius:number }
export interface BattleSnapshot { version:1; config:BattleConfig; actors:ActorState[]; objects?:{id:string;position:Vec3;rotation:Quat;velocity:Vec3;angularVelocity:Vec3}[]; currentPlayer:number; turn:number; seed:number; areas:SurfaceArea[] }
export interface GameEvent { type:'launch'|'collision'|'fall'|'turn'|'result'|'ability'|'land'|'wall'; player?:number; other?:number; position?:Vec3; strength?:number; material?:string; ability?:string }
export interface BattleView { phase:'aiming'|'simulating'|'result'|'paused'; currentPlayer:number; actors:ActorState[]; areas:SurfaceArea[]; winner:number|null; draw:boolean; turn:number }
export interface AssemblyStats { mass:number; center:Vec3; width:number; length:number; friction:number; restitution:number }
export interface Settings { master:number; bgm:number; sfx:number; ambient:number; muted:boolean; quality:'high'|'low'; shake:boolean; particles:boolean; reducedMotion:boolean }
