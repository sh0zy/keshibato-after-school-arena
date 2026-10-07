import { createMoffy } from './moffy'
import type { Moffy } from './types'

// Moffy Booth（moffy-booth.vercel.app）の「モッフィー消しピン」コーナーに埋め込まれたときの連絡口。
// ブースは整理番号からその人のモッフィーを引き、?booth 付きでこのゲームを iframe に開いて画像を渡す。
// ゲームは受け取ったモッフィーでそのまま対戦を始め、勝負がついたら・メニューへ戻ったらブースへ知らせる。
// やりとりは同じオリジン（ブースが自分のドメインで配信している）に限る。

export const BOOTH = typeof location !== 'undefined' && new URLSearchParams(location.search).has('booth')

export interface BoothPlayer { name:string; image:string }
export interface BoothStart { type:'moffy-booth:start'; players:[BoothPlayer,BoothPlayer]; versus:'cpu'|'human' }
export type BoothMessage =
 | { type:'moffy-booth:ready' }
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
