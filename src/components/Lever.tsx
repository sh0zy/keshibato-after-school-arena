import { useState } from 'react'
import { Usb, Unplug, Wrench, RotateCcw, LoaderCircle, TriangleAlert, Check } from 'lucide-react'
import { lever } from '../game/lever'
import type { LeverSnapshot } from '../game/lever'

// T字レバー（自作コントローラー）の接続とキャリブレーションのパネル。
// 対戦画面の「T字レバー」ボタンから開く。
export function LeverPanel({state,notify}:{state:LeverSnapshot;notify:(message:string)=>void}){
 const [busy,setBusy]=useState(false)
 const online=state.status==='online',connecting=state.status==='connecting'
 async function run(action:()=>Promise<unknown>){setBusy(true);try{await action()}catch(e){notify(String(e instanceof Error?e.message:e))}finally{setBusy(false)}}
 function calibrate(end:'rest'|'full'){try{lever.calibrate(end)}catch(e){notify(e instanceof Error?e.message:String(e))}}
 if(state.status==='unsupported')return <div className="lever-panel panel">
  <div className="lever-head"><Usb size={18}/><strong>T字レバー</strong><span className="lever-dot off"/></div>
  <p className="lever-warn"><TriangleAlert size={15}/> このブラウザはUSBシリアルに対応していません。パソコンの Chrome か Edge で開くと、T字レバーがつながります。指とマウスでの操作はこのままお使いいただけます。</p>
 </div>
 return <div className="lever-panel panel">
  <div className="lever-head"><Usb size={18}/><strong>T字レバー</strong><span className={`lever-dot ${online?state.receiving?'on':'wait':'off'}`}/><span className="lever-status">{online?state.receiving?'値を受信中':'接続済み · 受信待ち':connecting?'さがしています…':'未接続'}</span>
   {online?<button className="button small" disabled={busy} onClick={()=>void run(()=>lever.disconnect())}><Unplug size={15}/> 切りはなす</button>
   :<button className="button primary small" disabled={busy||connecting} onClick={()=>void run(()=>lever.connect())}>{busy||connecting?<LoaderCircle size={15} className="spin"/>:<Usb size={15}/>} レバーをつなぐ</button>}
  </div>
  <div className="lever-gauge"><div className="lever-bar"><span style={{width:`${Math.round(Math.min(1,state.value)*100)}%`}}/></div><strong>{Math.round(state.value*100)}<small>%</small></strong></div>
  <div className="lever-readout"><span>生の値 <b>{state.raw}</b></span><span>0% <b>{lever.tracker.calibration.rest}</b></span><span>100% <b>{lever.tracker.calibration.full}</b></span>{state.calibrated&&<span className="ok"><Check size={13}/> 調整済み</span>}</div>
  <div className="lever-calibration">
   <p><Wrench size={14}/> <strong>引き幅をあわせる</strong>（はじめに一度だけ。その位置で1秒ほど止めてから押してください）</p>
   <div className="lever-steps">
    <button className="button small" disabled={!state.receiving} onClick={()=>calibrate('rest')}><b>1</b> 手を離した位置を 0% にする</button>
    <button className="button small" disabled={!state.receiving} onClick={()=>calibrate('full')}><b>2</b> いちばん奥まで引いて 100% にする</button>
    <button className="text-button" disabled={!online} onClick={()=>{try{lever.clearCalibration()}catch(e){notify(e instanceof Error?e.message:String(e))}}}><RotateCcw size={14}/> やり直す</button>
   </div>
  </div>
  {!state.calibrated&&online&&<p className="lever-warn"><TriangleAlert size={15}/> まだ引き幅が登録されていません。上の1と2を順番に押してください。</p>}
  <p className="muted tiny">レバーを引くと強さが決まり、手を離した瞬間に発射します。狙う向きは、矢印キーか画面の「狙う角度」で合わせてください。発射のあと、レバーがいちばん手前まで戻るまで次の一手は撃てません。</p>
  {state.message&&<p className="muted tiny">{state.message}</p>}
 </div>
}
