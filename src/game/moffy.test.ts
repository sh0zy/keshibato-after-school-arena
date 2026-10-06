import { describe, expect, it } from 'vitest'
import { describeMoffy, fingerprint, moffyBuild, OUTLINE_POINTS, readStats, readTraits, toneColor, traceOutline, validateMoffy } from './moffy'
import { buildBody, getAssemblyStats, validateBuild } from './equipment'
import type { Moffy, MoffyTraits } from './types'

const SIZE=128
// 実際の画像のかわりに、円を描いた画素を作って特徴を測る。
// radius は大きさ、fade は輪郭のぼけ幅、color は被写体の色。背景は白。
function circle({radius=40,fade=0,color=[60,60,60],background=[255,255,255],height=radius}:{radius?:number;fade?:number;color?:number[];background?:number[];height?:number}={}){
 const data=new Uint8ClampedArray(SIZE*SIZE*4)
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const dx=(x-SIZE/2)/radius,dy=(y-SIZE/2)/height
  const distance=Math.hypot(dx,dy)*radius
  const edge=fade<=0?(distance<=radius?1:0):Math.min(1,Math.max(0,(radius+fade/2-distance)/fade))
  const i=(y*SIZE+x)*4
  for(let c=0;c<3;c++)data[i+c]=Math.round(background[c]+(color[c]-background[c])*edge)
  data[i+3]=255
 }
 return data
}

function maskOf(data:Uint8ClampedArray){const mask=new Uint8Array(SIZE*SIZE);for(let i=0;i<mask.length;i++){const d=Math.hypot(data[i*4]-255,data[i*4+1]-255,data[i*4+2]-255);mask[i]=data[i*4+3]>128&&d>60?1:0}return mask}

describe('見た目から特徴を測る',()=>{
 it('大きく写った子ほど bulk が大きい',()=>{
  expect(readTraits(circle({radius:50}),SIZE,SIZE).bulk).toBeGreaterThan(readTraits(circle({radius:22}),SIZE,SIZE).bulk)
 })
 it('暗い子ほど bright が小さい',()=>{
  expect(readTraits(circle({color:[30,30,30]}),SIZE,SIZE).bright).toBeLessThan(readTraits(circle({color:[215,215,215]}),SIZE,SIZE).bright)
 })
 it('色が濃い子ほど vivid が大きい',()=>{
  expect(readTraits(circle({color:[220,20,120]}),SIZE,SIZE).vivid).toBeGreaterThan(readTraits(circle({color:[130,128,131]}),SIZE,SIZE).vivid)
 })
 it('輪郭がぼけている子ほど fluff が大きい',()=>{
  expect(readTraits(circle({fade:34}),SIZE,SIZE).fluff).toBeGreaterThan(readTraits(circle({fade:0}),SIZE,SIZE).fluff)
 })
 it('横長の子は wide が 0.5 より大きく、縦長の子は小さい',()=>{
  expect(readTraits(circle({radius:52,height:26}),SIZE,SIZE).wide).toBeGreaterThan(.5)
  expect(readTraits(circle({radius:26,height:52}),SIZE,SIZE).wide).toBeLessThan(.5)
 })
 it('切り抜き済み（背景が透明）の画像でも測れる',()=>{
  const data=circle({radius:40,color:[90,140,200]})
  // 背景を透明にしても、同じくらいの大きさに読める。
  for(let i=0;i<data.length;i+=4)if(data[i]>240&&data[i+1]>240&&data[i+2]>240)data[i+3]=0
  expect(readTraits(data,SIZE,SIZE).bulk).toBeGreaterThan(.1)
 })
 it('被写体が見つからない画像は、理由を添えて断る',()=>{
  expect(()=>readTraits(circle({radius:1}),SIZE,SIZE)).toThrow('モッフィーが見つかりません')
  expect(()=>readTraits(new Uint8ClampedArray(16),2,2)).toThrow('小さすぎます')
 })
})

describe('特徴から性能を決める',()=>{
 const envelope={mass:[.65,1.6],friction:[.39,.58],restitution:[.09,.16],x:[1.05,2.8],y:[.4,.62],z:[1.05,2.8]}
 it('どんな特徴でも、収録されている消しゴム本体と同じ範囲に収まる',()=>{
  for(let i=0;i<400;i++){
   const traits:MoffyTraits={bulk:Math.random(),bright:Math.random(),vivid:Math.random(),fluff:Math.random(),hue:Math.random()*360,wide:.2+Math.random()*.6}
   const s=readStats(traits)
   expect(s.mass).toBeGreaterThanOrEqual(envelope.mass[0]);expect(s.mass).toBeLessThanOrEqual(envelope.mass[1])
   expect(s.friction).toBeGreaterThanOrEqual(envelope.friction[0]);expect(s.friction).toBeLessThanOrEqual(envelope.friction[1])
   expect(s.restitution).toBeGreaterThanOrEqual(envelope.restitution[0]);expect(s.restitution).toBeLessThanOrEqual(envelope.restitution[1])
   for(const axis of ['x','y','z'] as const){expect(s.size[axis]).toBeGreaterThanOrEqual(envelope[axis][0]);expect(s.size[axis]).toBeLessThanOrEqual(envelope[axis][1])}
  }
 })
 it('当たり判定は、その子の縦横比どおりになる（丸い子が楕円に伸びない）',()=>{
  for(const [radius,height] of [[42,42],[52,26],[26,52],[48,34]]){
   const traits=readTraits(circle({radius,height}),SIZE,SIZE)
   const s=readStats(traits)
   // wide から求めた比と、当たり判定の比が一致する（端で頭打ちになった場合を除く）
   const wide=.5+(traits.wide-.5)*.75
   const capped=[s.size.x,s.size.z].some(v=>v>2.79||v<1.06)
   if(!capped)expect(s.size.x/s.size.z).toBeCloseTo(wide/(1-wide),1)
   expect(s.size.x/s.size.z).toBeGreaterThan(radius>height?1:0)
  }
 })
 it('同じ画像からは必ず同じ性能になる',()=>{
  const a=readStats(readTraits(circle({radius:37,color:[200,90,40]}),SIZE,SIZE))
  const b=readStats(readTraits(circle({radius:37,color:[200,90,40]}),SIZE,SIZE))
  expect(a).toEqual(b)
 })
 it('大きく暗い子は、小さく明るい子より重い',()=>{
  const heavy=readStats(readTraits(circle({radius:52,color:[35,35,45]}),SIZE,SIZE))
  const light=readStats(readTraits(circle({radius:22,color:[235,232,220]}),SIZE,SIZE))
  expect(heavy.mass).toBeGreaterThan(light.mass)
 })
 it('ふわふわな子ほど、よくふんばる',()=>{
  expect(readStats(readTraits(circle({fade:34}),SIZE,SIZE)).friction).toBeGreaterThan(readStats(readTraits(circle({fade:0}),SIZE,SIZE)).friction)
 })
})

describe('個体の識別と受け入れ',()=>{
 it('同じ画像は同じ番号、違う画像は違う番号になる',()=>{
  expect(fingerprint(circle({radius:40}))).toBe(fingerprint(circle({radius:40})))
  expect(fingerprint(circle({radius:40}))).not.toBe(fingerprint(circle({radius:41})))
  expect(fingerprint(circle({radius:40}))).toMatch(/^[0-9a-f]{8}$/)
 })
 it('色あいから台座の色を作る',()=>{
  expect(toneColor(330,.5)).toMatch(/^#[0-9a-f]{6}$/)
  expect(toneColor(0,0)).not.toBe(toneColor(200,.8))
 })
 const sample=():Moffy=>{
  const traits=readTraits(circle({radius:40,color:[220,120,180]}),SIZE,SIZE)
  return {id:'0a1b2c3d',name:'もふ',image:'data:image/png;base64,iVBORw0KGgo=',color:toneColor(traits.hue,traits.vivid),outline:traceOutline(maskOf(circle({radius:40,color:[220,120,180]})),SIZE),traits,stats:readStats(traits)}
 }
 it('正しいモッフィーはそのまま受け取る',()=>{
  const moffy=sample()
  expect(validateMoffy(moffy).id).toBe('0a1b2c3d')
  expect(describeMoffy(moffy)).toHaveLength(4)
 })
 it('壊れたデータは理由を添えて断る',()=>{
  expect(()=>validateMoffy({...sample(),id:'ちがう'})).toThrow('識別子')
  expect(()=>validateMoffy({...sample(),image:'https://example.com/x.png'})).toThrow('画像')
  expect(()=>validateMoffy({...sample(),stats:{...sample().stats,mass:99}})).toThrow('範囲外')
  expect(()=>validateMoffy(null)).toThrow('読めませんでした')
 })
})

describe('モッフィーを機体として扱う',()=>{
 const moffy=():Moffy=>{
  const traits=readTraits(circle({radius:44,color:[120,180,220]}),SIZE,SIZE)
  return {id:'ffeeddcc',name:'そらいろ',image:'data:image/png;base64,iVBORw0KGgo=',color:toneColor(traits.hue,traits.vivid),outline:traceOutline(maskOf(circle({radius:44,color:[120,180,220]})),SIZE),traits,stats:readStats(traits)}
 }
 it('その子の数値が、そのまま本体の性能になる',()=>{
  const build=moffyBuild(moffy())
  const body=buildBody(build)
  expect(body.mass).toBe(moffy().stats.mass)
  expect(body.size).toEqual(moffy().stats.size)
  expect(getAssemblyStats(build).mass).toBe(moffy().stats.mass)
 })
 it('パーツは取り付けられない',()=>{
  expect(()=>validateBuild({...moffyBuild(moffy()),equipment:[{id:'ruler',socket:'front',rotation:0}]})).toThrow('パーツを取り付けられません')
  expect(validateBuild(moffyBuild(moffy())).moffy?.id).toBe('ffeeddcc')
 })
 it('モッフィーでない機体は、これまでどおり収録の本体を使う',()=>{
  const build=moffyBuild(moffy());delete build.moffy
  expect(buildBody(build).id).toBe('standard')
 })
})

describe('板に抜くための型紙',()=>{
 const mask=(data:Uint8ClampedArray)=>{const m=new Uint8Array(SIZE*SIZE);for(let i=0;i<m.length;i++){const d=Math.hypot(data[i*4]-255,data[i*4+1]-255,data[i*4+2]-255);m[i]=data[i*4+3]>128&&d>60?1:0}return m}
 const bounds=(outline:number[])=>{const xs=outline.filter((_,i)=>i%2===0),ys=outline.filter((_,i)=>i%2===1);return {w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}}
 it('決まった数の点が、すべて画像の中に収まる',()=>{
  const outline=traceOutline(mask(circle({radius:40})),SIZE)
  expect(outline).toHaveLength(OUTLINE_POINTS*2)
  expect(outline.every(v=>v>=0&&v<=1)).toBe(true)
 })
 it('円からは、縦横がほぼ等しい型紙が取れる',()=>{
  const {w,h}=bounds(traceOutline(mask(circle({radius:42})),SIZE))
  expect(w).toBeCloseTo(h,1)
  expect(w).toBeCloseTo(42*2/SIZE,1)
 })
 it('横長の子からは横長の型紙、縦長の子からは縦長の型紙が取れる',()=>{
  const flat=bounds(traceOutline(mask(circle({radius:52,height:24})),SIZE))
  const tall=bounds(traceOutline(mask(circle({radius:24,height:52})),SIZE))
  expect(flat.w).toBeGreaterThan(flat.h)
  expect(tall.h).toBeGreaterThan(tall.w)
 })
 it('同じ画像からは同じ型紙が取れる',()=>{
  expect(traceOutline(mask(circle({radius:38})),SIZE)).toEqual(traceOutline(mask(circle({radius:38})),SIZE))
 })
 it('形が読み取れない画像は、理由を添えて断る',()=>{
  expect(()=>traceOutline(new Uint8Array(SIZE*SIZE),SIZE)).toThrow('形が読み取れませんでした')
 })
 it('点の数が合わない型紙は受け取らない',()=>{
  const traits=readTraits(circle({radius:40}),SIZE,SIZE)
  const moffy={id:'0a1b2c3d',name:'もふ',image:'data:image/png;base64,iVBORw0KGgo=',color:'#eeddee',outline:traceOutline(mask(circle({radius:40})),SIZE),traits,stats:readStats(traits)}
  expect(validateMoffy(moffy).outline).toHaveLength(OUTLINE_POINTS*2)
  expect(()=>validateMoffy({...moffy,outline:[0,0,1,1]})).toThrow('輪郭')
  expect(()=>validateMoffy({...moffy,outline:moffy.outline.map(()=>5)})).toThrow('輪郭')
 })
})
