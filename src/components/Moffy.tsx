import { useRef, useState } from 'react'
import { Upload, Trash2, Swords, LoaderCircle, Sparkles, Shuffle, Timer, Eraser } from 'lucide-react'
import { createMoffy, describeMoffy, MOFFY_LIMIT } from '../game/moffy'
import type { Moffy } from '../game/types'

// Moffy Booth で作ったモッフィーを読み込み、消しピンのコマとして選ぶ画面。
// 性能はその子の見た目から決まっていて、ここでは触れない。見比べて選ぶだけ。
const BARS=[
 {key:'mass' as const,label:'おもさ',min:.65,max:1.6,hint:'重いほど押し負けにくく、動き出しは鈍い'},
 {key:'friction' as const,label:'ふんばり',min:.39,max:.58,hint:'高いほど机に食いつき、止まるのが早い'},
 {key:'restitution' as const,label:'はずみ',min:.09,max:.16,hint:'高いほど壁や相手でよく跳ねる'}
]

export function MoffyCard({moffy,selected,role,onPick,onRemove}:{moffy:Moffy;selected:boolean;role?:string;onPick:()=>void;onRemove?:()=>void}){
 return <div className={`moffy-card ${selected?'selected':''}`}>
  <button className="moffy-pick" onClick={onPick} aria-pressed={selected}>
   <span className="moffy-portrait" style={{background:moffy.color}}><img src={moffy.image} alt=""/></span>
   <strong>{moffy.name}</strong>
   <small className="moffy-id">No.{moffy.id}</small>
   <span className="moffy-tags">{describeMoffy(moffy).map(tag=><em key={tag}>{tag}</em>)}</span>
   <span className="moffy-bars">{BARS.map(bar=><span key={bar.key} title={bar.hint}><b>{bar.label}</b><span className="moffy-bar"><i style={{width:`${Math.round(Math.min(1,Math.max(0,(moffy.stats[bar.key]-bar.min)/(bar.max-bar.min)))*100)}%`}}/></span></span>)}</span>
   {role&&<span className="moffy-role">{role}</span>}
  </button>
  {onRemove&&<button className="icon-button moffy-remove" aria-label={`${moffy.name}を手ばなす`} onClick={onRemove}><Trash2 size={15}/></button>}
 </div>
}

export function MoffyPanel({moffys,mine,foe,versus,setVersus,onImport,onRemove,setMine,setFoe,onStart,notify}:{
 moffys:Moffy[];mine:string;foe:string;versus:'cpu'|'human';setVersus:(v:'cpu'|'human')=>void;onImport:(moffy:Moffy)=>void;onRemove:(id:string)=>void;
 setMine:(id:string)=>void;setFoe:(id:string)=>void;onStart:()=>void;notify:(message:string)=>void}){
 const picker=useRef<HTMLInputElement>(null)
 const [busy,setBusy]=useState(false)
 async function take(files:FileList|null){
  if(!files?.length)return
  setBusy(true)
  let added=0
  try{
   for(const file of [...files]){
    if(moffys.length+added>=MOFFY_LIMIT){notify(`この端末に置けるモッフィーは${MOFFY_LIMIT}体までです。手ばなしてから読み込んでください。`);break}
    try{onImport(await createMoffy(file));added++}
    catch(e){notify(`${file.name}：${e instanceof Error?e.message:String(e)}`)}
   }
  }finally{setBusy(false);if(picker.current)picker.current.value=''}
 }
 const ready=moffys.find(m=>m.id===mine)&&moffys.find(m=>m.id===foe)
 return <div className="moffy-panel">
  <div className="moffy-intro panel">
   <div><span className="eyebrow"><Sparkles size={13}/> MOFFY MODE</span><h3>あの子を、机の上へ。</h3>
    <p>Moffy Booth で生まれたモッフィーの画像を読み込むと、その子がはじくコマになります。<strong>性能は見た目から決まります</strong>——大きさ・明るさ・色の濃さ・ふちのやわらかさを測って、おもさ・ふんばり・はずみに割り当てます。同じ子なら、いつ読み込んでも同じ性能です。</p>
    <p className="muted tiny">このモードでは文房具パーツは付けません。モッフィーそのものの力だけで勝負します。</p>
    <p className="moffy-note"><Timer size={14}/> <span><strong>読み込んだモッフィーは、その場限りです。</strong>画面を閉じたり、再読み込みすると消えます。画像も対戦の記録も、この端末には残りません。</span></p>
   </div>
   <div className="moffy-actions">
    <button className="button primary" disabled={busy||moffys.length>=MOFFY_LIMIT} onClick={()=>picker.current?.click()}>{busy?<LoaderCircle size={16} className="spin"/>:<Upload size={16}/>} モッフィーを読み込む</button>
    <input ref={picker} type="file" accept="image/*" multiple hidden onChange={e=>void take(e.target.files)}/>
    <small className="muted">いま {moffys.length} 体（同時に {MOFFY_LIMIT} 体まで）</small>
    {moffys.length>0&&<button className="text-button" onClick={()=>{moffys.forEach(m=>onRemove(m.id));setMine('');setFoe('');notify('モッフィーをぜんぶ手ばなしました。')}}><Eraser size={14}/> ぜんぶ手ばなす</button>}
   </div>
  </div>
  {!moffys.length?<p className="moffy-empty">まだ1体もいません。Moffy Booth の「モッフィーを保存」で受け取った画像を読み込んでください。<br/><span className="muted tiny">PNG・JPEG どちらでも構いません。背景が1色なら自動で切り抜いて、その輪郭のコマにします。</span></p>
  :<>
   <div className="moffy-slots">
    <div><span className="eyebrow">あなたのモッフィー</span>{moffys.find(m=>m.id===mine)?<strong>{moffys.find(m=>m.id===mine)!.name}</strong>:<strong className="muted">えらんでください</strong>}</div>
    <Swords size={18}/>
    <div><span className="eyebrow">あいてのモッフィー</span>{moffys.find(m=>m.id===foe)?<strong>{moffys.find(m=>m.id===foe)!.name}</strong>:<strong className="muted">えらんでください</strong>}</div>
    <button className="button small" disabled={moffys.length<2} onClick={()=>{const others=moffys.filter(m=>m.id!==mine);if(others.length)setFoe(others[Math.floor(Math.random()*others.length)].id)}}><Shuffle size={14}/> あいてをおまかせ</button>
    <label className="form-field moffy-versus">あいてを動かすのは<select value={versus} onChange={e=>setVersus(e.target.value as 'cpu'|'human')}><option value="cpu">CPU</option><option value="human">ふたりで交互に</option></select></label>
   </div>
   <div className="moffy-grid">{moffys.map(moffy=><MoffyCard key={moffy.id} moffy={moffy} selected={moffy.id===mine||moffy.id===foe}
    role={moffy.id===mine?'あなた':moffy.id===foe?'あいて':undefined}
    onPick={()=>{if(moffy.id===mine)setMine('');else if(moffy.id===foe)setFoe('');else if(!mine)setMine(moffy.id);else setFoe(moffy.id)}}
    onRemove={()=>{onRemove(moffy.id);if(mine===moffy.id)setMine('');if(foe===moffy.id)setFoe('')}}/>)}</div>
   <p className="muted tiny">カードを押すと「あなた」「あいて」の順に決まります。もう一度押すと外れます。</p>
   <button className="button primary large full" disabled={!ready} onClick={onStart}><Swords size={18}/> このモッフィーで対戦する</button>
  </>}
 </div>
}
