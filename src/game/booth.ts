import { createMoffy } from './moffy'
import type { Moffy } from './types'

// Moffy Booth（moffy-booth.vercel.app）の「モッフィー消しピン」コーナーに埋め込まれたときの連絡口。
// ブースは整理番号からその人のモッフィーを引き、?booth 付きでこのゲームを iframe に開いて画像を渡す。
// ゲームは受け取ったモッフィーでそのまま対戦を始め、勝負がついたら・メニューへ戻ったらブースへ知らせる。
// やりとりは同じオリジン（ブースが自分のドメインで配信している）に限る。

export const BOOTH = typeof location !== 'undefined' && new URLSearchParams(location.search).has('booth')

export interface BoothPlayer { name:string; image:string }
/**
 * control: 'lever' は会場の物理T字レバーで遊ぶ。'phone' は来場者のスマホに出したレバーで遊ぶ
 * （スマホの操作はブースが中継し、moffy-booth:remote で届く）。省略時は今までどおり指・マウス。
 */
export type BoothControl = 'touch'|'lever'|'phone'
export interface BoothStart { type:'moffy-booth:start'; players:[BoothPlayer,BoothPlayer]; versus:'cpu'|'human'; control?:BoothControl }
/** スマホのレバーの操作。player は何人目のレバーか、power は引いた強さ（0〜1）、steer は回した向き（-1〜+1） */
export interface BoothRemote { type:'moffy-booth:remote'; player:number; kind:'aim'|'shoot'|'cancel'; power:number; steer:number }
export type BoothMessage =
 | { type:'moffy-booth:ready' }
 /** いま狙っている人（スマホのレバーを動かせる人）。CPUの番や玉が動いているあいだは null */
 | { type:'moffy-booth:turn'; player:number|null }
 | { type:'moffy-booth:result'; winner:number|null; draw:boolean }
 | { type:'moffy-booth:exit' }
 | { type:'moffy-booth:error'; message:string }

export function tellBooth(message:BoothMessage){
 if(BOOTH&&window.parent!==window)window.parent.postMessage(message,location.origin)
}

/** ブースからの「この2体で始めて」を待つ。戻り値で待つのをやめる。 */
export function listenBooth(onStart:(start:BoothStart)=>void){
 const handle=(e:MessageEvent)=>{
  if(e.origin!==location.origin||e.source!==window.parent)return
  const data=e.data as BoothStart
  if(data?.type!=='moffy-booth:start'||!Array.isArray(data.players)||data.players.length!==2)return
  onStart(data)
 }
 window.addEventListener('message',handle)
 return ()=>window.removeEventListener('message',handle)
}

/** ブースが中継してくるスマホのレバーの操作を受ける。戻り値で受けるのをやめる。 */
export function listenRemote(onRemote:(remote:BoothRemote)=>void){
 const handle=(e:MessageEvent)=>{
  if(e.origin!==location.origin||e.source!==window.parent)return
  const data=e.data as BoothRemote
  if(data?.type!=='moffy-booth:remote'||!Number.isInteger(data.player)||!['aim','shoot','cancel'].includes(data.kind))return
  if(!Number.isFinite(data.power)||!Number.isFinite(data.steer))return
  onRemote({...data,power:Math.min(1,Math.max(.05,data.power)),steer:Math.min(1,Math.max(-1,data.steer))})
 }
 window.addEventListener('message',handle)
 return ()=>window.removeEventListener('message',handle)
}

/** ブースの画像URLから1体を作る。名前はファイル名ではなく、ブースが付けたもの（整理番号＋キーワード）を使う。 */
export async function moffyFromBooth(player:BoothPlayer):Promise<Moffy>{
 const url=new URL(player.image,location.href)
 if(url.origin!==location.origin)throw new Error('モッフィーの画像を読み込めませんでした。')
 const response=await fetch(url,{credentials:'same-origin'})
 if(!response.ok)throw new Error('モッフィーの画像を読み込めませんでした。')
 const blob=await response.blob()
 const moffy=await createMoffy(new File([blob],'moffy.png',{type:blob.type||'image/png'}))
 return {...moffy,name:player.name.slice(0,24)}
}
