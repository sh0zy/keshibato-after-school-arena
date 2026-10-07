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

/**
 * 届いたメッセージを受け入れてよいか調べ、よければ中身をそろえて返す。
 * 外からの入口なので、送り主・形・中身をすべてここで確かめる。
 * 画面まわりから切り離してあるのは、この判断だけをテストで固めておくため。
 */
export function readBoothStart(event:{origin?:unknown;source?:unknown;data?:unknown},origin:string,parent:unknown):BoothStart|null {
 if(!parent||event.source!==parent||event.origin!==origin)return null
 const data=event.data as BoothStart
 if(data?.type!=='moffy-booth:start')return null
 if(!Array.isArray(data.players)||data.players.length!==2)return null
 if(!data.players.every(p=>p&&typeof p==='object'&&typeof p.image==='string'&&p.image))return null
 // 知らない値が来たら、ひとりで遊べる CPU 戦にしておく。
 return {type:data.type,players:[boothPlayer(data.players[0]),boothPlayer(data.players[1])],versus:data.versus==='human'?'human':'cpu'}
}

/** ブースが名前を付けてこなかったときの受け皿。空のままだと機体の検証で弾かれ、対戦が始められない。 */
export function boothPlayer(player:BoothPlayer):BoothPlayer {
 const name=(typeof player.name==='string'?player.name:'').trim().slice(0,24)
 return {name:name||'モッフィー',image:player.image}
}

/** ブースが指した画像が、同じオリジンのものか確かめる。よそのドメインは取りに行かない。 */
export function boothImageUrl(image:unknown,base:string,origin:string):URL {
 if(typeof image!=='string'||!image)throw new Error('モッフィーの画像が指定されていません。')
 let url:URL
 try{url=new URL(image,base)}catch{throw new Error('モッフィーの画像を読み込めませんでした。')}
 if(url.origin!==origin)throw new Error('モッフィーの画像を読み込めませんでした。')
 return url
}

/** ブースからの「この2体で始めて」を待つ。戻り値で待つのをやめる。 */
export function listenBooth(onStart:(start:BoothStart)=>void){
 const handle=(e:MessageEvent)=>{const start=readBoothStart(e,location.origin,window.parent);if(start)onStart(start)}
 window.addEventListener('message',handle)
 return ()=>window.removeEventListener('message',handle)
}

/** ブースの画像URLから1体を作る。名前はファイル名ではなく、ブースが付けたもの（整理番号＋キーワード）を使う。 */
export async function moffyFromBooth(player:BoothPlayer):Promise<Moffy>{
 const url=boothImageUrl(player.image,location.href,location.origin)
 const response=await fetch(url,{credentials:'same-origin'})
 if(!response.ok)throw new Error('モッフィーの画像を読み込めませんでした。')
 const blob=await response.blob()
 const moffy=await createMoffy(new File([blob],'moffy.png',{type:blob.type||'image/png'}))
 return {...moffy,name:boothPlayer(player).name}
}
