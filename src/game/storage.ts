import type { BattleSnapshot, Build, Settings, StageDef, StageObject } from './types'
import { validateBuild } from './equipment'

export const DEFAULT_SETTINGS:Settings={master:.7,bgm:.32,sfx:.65,ambient:.2,muted:false,quality:'high',shake:false,particles:true,reducedMotion:false}
export interface RecordBook { battles:number; wins:number; used:string[]; combos:string[]; achievements:string[]; tour:number; challenges:string[] }
export const EMPTY_RECORD:RecordBook={battles:0,wins:0,used:[],combos:[],achievements:[],tour:0,challenges:[]}
const prefix='keshibato.v1.'
let failure=''
export function load<T>(key:string,fallback:T):T { try { const s=localStorage.getItem(prefix+key); return s ? JSON.parse(s) as T : structuredClone(fallback) } catch { return structuredClone(fallback) } }
export function save(key:string,value:unknown):boolean { try { localStorage.setItem(prefix+key,JSON.stringify(value));failure='';return true } catch { failure='端末に保存できませんでした。空き容量やブラウザの保存設定をご確認ください。';return false } }
export function storageError(){return failure}
export function removeSave(key:string){try{localStorage.removeItem(prefix+key)}catch{}}
export function loadSettings():Settings {const value=load<Partial<Settings>>('settings',{});const result={...DEFAULT_SETTINGS};for(const key of ['master','bgm','sfx','ambient'] as const){if(typeof value[key]==='number')result[key]=Math.min(1,Math.max(0,value[key]!))}for(const key of ['muted','shake','particles','reducedMotion'] as const){if(typeof value[key]==='boolean')result[key]=value[key]!}if(value.quality==='low')result.quality='low';return result}
export function loadBuild(fallback:Build):Build {try{return validateBuild(load('build',fallback))}catch{return structuredClone(fallback)}}
export function loadFavorites():Build[]{const values=load<unknown>('favorites',[]);if(!Array.isArray(values))return [];return values.slice(0,40).flatMap(x=>{try{return [validateBuild(x)]}catch{return []}})}
export function download(data:string|Blob,name:string,type='application/json'){const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
export function exportBuild(build:Build){download(JSON.stringify({version:1,build},null,2),`消しバト_${build.name}.json`)}
export function importBuild(text:string):Build {if(text.length>32000)throw new Error('機体ファイルが大きすぎます。');const data:unknown=JSON.parse(text);const record=data as {version?:unknown;build?:unknown};if(record.version!==1)throw new Error('この機体の保存形式には対応していません。');return validateBuild(record.build)}
const objectKinds=['desk','book','ruler','bridge','bumper','mat','case','seesaw']
function finite(value:unknown,min:number,max:number):number {if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('ステージの座標・大きさが範囲外です。');return value}
export function validateStage(value:unknown):StageDef {
 const s=value as StageDef;if(!s||typeof s!=='object'||typeof s.name!=='string'||!Array.isArray(s.objects)||s.objects.length<1||s.objects.length>40)throw new Error('ステージは1〜40個の部品で作ってください。')
 const objects:StageObject[]=s.objects.map((o,i)=>{if(!o||!objectKinds.includes(o.kind))throw new Error('使えないステージ部品が含まれています。');return {id:`custom-${i}`,kind:o.kind,position:{x:finite(o.position?.x,-30,30),y:finite(o.position?.y,-5,8),z:finite(o.position?.z,-30,30)},size:{x:finite(o.size?.x,.15,40),y:finite(o.size?.y,.1,6),z:finite(o.size?.z,.15,40)},rotation:finite(o.rotation??0,-Math.PI*2,Math.PI*2),tilt:finite(o.tilt??0,-.5,.5),friction:finite(o.friction??.4,.05,1.5),color:typeof o.color==='string'&&/^#[\da-f]{6}$/i.test(o.color)?o.color:'#d4b58c',dynamic:o.kind==='seesaw'}})
 // 収録ステージは4か所、工房で作るステージは2か所。エンジンは2〜4体に対応する。
 if(!Array.isArray(s.spawns)||s.spawns.length<2||s.spawns.length>4)throw new Error('出発位置は2〜4か所にしてください。')
 const spawns=s.spawns.map(p=>({x:finite(p.x,-25,25),y:finite(p.y,0,9),z:finite(p.z,-25,25)}))
 for(const p of spawns){if(!objects.some(o=>o.kind!=='ruler'&&Math.abs(p.x-o.position.x)<o.size.x/2-.7&&Math.abs(p.z-o.position.z)<o.size.z/2-1.5&&p.y>o.position.y+o.size.y/2-.1&&p.y<o.position.y+o.size.y/2+2))throw new Error('出発位置は、消しゴム全体が乗れる足場の上に置いてください。')}
 for(let i=0;i<spawns.length;i++)for(let j=i+1;j<spawns.length;j++)if(Math.hypot(spawns[i].x-spawns[j].x,spawns[i].z-spawns[j].z)<4)throw new Error('出発位置は4マス以上離してください。')
 return {id:'custom',name:s.name.slice(0,30),subtitle:'きみだけのアリーナ',description:'自作のステージで、自由に実験しよう。',difficulty:'オリジナル',color:'#91c4ac',objects,spawns,fallY:-8,music:'art'}
}
export function readBattle():BattleSnapshot|null {const snapshot=load<BattleSnapshot|null>('battle',null);if(!snapshot||snapshot.version!==1||!snapshot.config||!Array.isArray(snapshot.actors)||snapshot.actors.length!==snapshot.config.players?.length)return null;try{snapshot.config.players.forEach(p=>validateBuild(p.build));return snapshot}catch{return null}}
