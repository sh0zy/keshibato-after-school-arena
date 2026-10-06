import type { Build, Moffy, MoffyStats, MoffyTraits, Vec3 } from './types'

// Moffy Booth（moffy-booth.vercel.app）で生まれたモッフィーを、消しピンのコマとして受け入れる。
// 性能はその子の見た目そのものから測る。大きさ・明るさ・鮮やかさ・輪郭のやわらかさを読み、
// 重さ・ふんばり・はずみに割り当てる。同じ画像なら必ず同じ性能になり、相談して決める余地はない。

export const MOFFY_LIMIT=12       // 1台に置いておけるモッフィーの数
const SAMPLE=128                  // 特徴を測るときの一辺。これ以上細かくしても結果は変わらない
const STORE=256                   // 保存しておく画像の一辺
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value))
const mix=(a:number,b:number,t:number)=>a+(b-a)*clamp(t,0,1)
// 0→0、1→1 へなめらかにつなぐ。背景と被写体のきわを、かたい境目にしないために使う。
const smooth=(edge0:number,edge1:number,value:number)=>{const t=clamp((value-edge0)/(edge1-edge0),0,1);return t*t*(3-2*t)}

/** 画素から見た目の特徴を測る。背景は四隅から推定し、被写体との間は重みでつなぐ。 */
export function readTraits(data:Uint8ClampedArray,width:number,height:number):MoffyTraits {
 if(width<8||height<8||data.length<width*height*4)throw new Error('画像が小さすぎます。もう少し大きな画像を選んでください。')
 const corners=[[0,0],[width-1,0],[0,height-1],[width-1,height-1]].map(([x,y])=>(y*width+x)*4)
 // 透明な背景（切り抜き済み）なら、アルファだけで被写体を分けられる。
 const cutout=corners.every(i=>data[i+3]<24)
 const back=[0,1,2].map(c=>corners.reduce((sum,i)=>sum+data[i+c],0)/4)
 const weightAt=(i:number)=>{
  if(cutout)return data[i+3]/255
  if(data[i+3]<24)return 0
  const distance=Math.hypot(data[i]-back[0],data[i+1]-back[1],data[i+2]-back[2])
  return smooth(26,78,distance)
 }
 let sum=0,halo=0,luma=0,vivid=0,hueX=0,hueY=0
 let minX=width,maxX=-1,minY=height,maxY=-1
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,weight=weightAt(i)
  if(weight<=.02)continue
  if(weight>.08&&weight<.92)halo++
  if(weight>.5){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
  const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255
  const max=Math.max(r,g,b),min=Math.min(r,g,b),chroma=max-min
  sum+=weight
  luma+=weight*(.2126*r+.7152*g+.0722*b)
  vivid+=weight*(max<=0?0:chroma/max)
  if(chroma>.02){
   // 色あいは角度なので、平均は単純な足し算ではなくベクトルで取る。
   const hue=(max===r?((g-b)/chroma+6)%6:max===g?(b-r)/chroma+2:(r-g)/chroma+4)*Math.PI/3
   hueX+=weight*chroma*Math.cos(hue);hueY+=weight*chroma*Math.sin(hue)
  }
 }
 if(sum<width*height*.004)throw new Error('モッフィーが見つかりませんでした。背景と見分けのつく画像を選んでください。')
 const box={w:Math.max(1,maxX-minX+1),h:Math.max(1,maxY-minY+1)}
 // 面積 A のかたまりの周囲はおよそ 3.5√A。きわの画素をその周囲で割ると、ふちのぼけ幅になる。
 const edge=halo/Math.max(1,3.5*Math.sqrt(sum))
 return {
  bulk:clamp(sum/(width*height)/.62,0,1),
  bright:clamp(luma/sum,0,1),
  vivid:clamp(vivid/sum,0,1),
  fluff:clamp(edge/(SAMPLE/128*5),0,1),
  hue:(Math.atan2(hueY,hueX)*180/Math.PI+360)%360,
  wide:clamp(box.w/(box.w+box.h),.2,.8)
 }
}

/** 見た目の特徴を、収録されている消しゴム本体と同じ範囲の性能へ割り当てる。 */
export function readStats(traits:MoffyTraits):MoffyStats {
 // 大きくて暗い子ほど重い。収録本体は .65〜1.6 なので、その幅に収める。
 const mass=mix(.65,1.6,traits.bulk*.72+(1-traits.bright)*.28)
 // ふちがやわらかい（ふわふわな）子ほど机に食いつく。.39〜.58。
 const friction=mix(.39,.58,traits.fluff*.78+traits.bulk*.22)
 // 色が濃い子ほどよく弾む。.09〜.16。
 const restitution=mix(.09,.16,traits.vivid)
 // 当たり判定は、その子の縦横比をそのまま映す。丸い子が楕円に伸びないようにするため、
 // 長いほうの辺を大きさで決めて、短いほうは比から割り出す。
 const long=mix(1.95,2.6,traits.bulk)
 const wide=.5+(traits.wide-.5)*.75          // 極端な比は少しだけやわらげる
 const ratio=wide/(1-wide)
 const size:Vec3={
  x:clamp(ratio>=1?long:long*ratio,1.05,2.8),
  y:clamp(mix(.42,.6,traits.bulk),.4,.62),
  z:clamp(ratio>=1?long/ratio:long,1.05,2.8)
 }
 return {mass:Number(mass.toFixed(3)),friction:Number(friction.toFixed(3)),restitution:Number(restitution.toFixed(3)),size:{x:Number(size.x.toFixed(3)),y:Number(size.y.toFixed(3)),z:Number(size.z.toFixed(3))}}
}

export const OUTLINE_POINTS=96
/**
 * 被写体の輪郭をたどって、板に抜くための型紙にする。
 * 重心から全方位へ線を伸ばし、いちばん遠くで被写体に当たったところを輪郭とする。
 * ぬいぐるみのような丸い相手に向いていて、耳や手足のすき間で形が崩れない。
 * 返すのは x,y の並び（0〜1、画像と同じ向き）。
 */
export function traceOutline(mask:Uint8Array,size:number):number[]{
 let sx=0,sy=0,count=0
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(mask[y*size+x]){sx+=x;sy+=y;count++}
 if(count<16)throw new Error('モッフィーの形が読み取れませんでした。背景と見分けのつく画像を選んでください。')
 const cx=sx/count,cy=sy/count,limit=size*1.45
 const radii=Array.from({length:OUTLINE_POINTS},(_,i)=>{
  const angle=i/OUTLINE_POINTS*Math.PI*2,dx=Math.cos(angle),dy=Math.sin(angle)
  let found=0
  for(let r=1;r<limit;r+=.5){
   const x=Math.round(cx+dx*r),y=Math.round(cy+dy*r)
   if(x<0||y<0||x>=size||y>=size)break
   if(mask[y*size+x])found=r
  }
  return found
 })
 // すき間で半径が飛ぶのを、前後と平均してならす。角ばった型紙にしないため。
 const smoothed=radii.map((_,i)=>{let sum=0;for(let k=-2;k<=2;k++)sum+=radii[(i+k+OUTLINE_POINTS)%OUTLINE_POINTS];return sum/5})
 if(Math.max(...smoothed)<2)throw new Error('モッフィーの形が読み取れませんでした。背景と見分けのつく画像を選んでください。')
 const points:number[]=[]
 for(let i=0;i<OUTLINE_POINTS;i++){
  const angle=i/OUTLINE_POINTS*Math.PI*2
  points.push(clamp((cx+Math.cos(angle)*smoothed[i])/size,0,1),clamp((cy+Math.sin(angle)*smoothed[i])/size,0,1))
 }
 return points.map(v=>Number(v.toFixed(4)))
}

/** 同じ画像なら同じ番号になる、短い個体の識別子（FNV-1a）。 */
export function fingerprint(data:Uint8ClampedArray):string {
 let hash=0x811c9dc5
 for(let i=0;i<data.length;i+=4){hash^=data[i]<<16^data[i+1]<<8^data[i+2]^data[i+3]<<24;hash=Math.imul(hash,0x01000193)>>>0}
 return hash.toString(16).padStart(8,'0')
}

/** 色あいから、台座に使う色を決める。 */
export function toneColor(hue:number,vivid:number){
 const h=((hue%360)+360)%360,s=mix(.2,.52,vivid),l=.72
 const f=(n:number)=>{const k=(n+h/30)%12,a=s*Math.min(l,1-l);const v=l-a*Math.max(-1,Math.min(Math.min(k-3,9-k),1));return Math.round(v*255).toString(16).padStart(2,'0')}
 return `#${f(0)}${f(8)}${f(4)}`
}

/** 保存しておいたモッフィーが壊れていないか確かめる。 */
export function validateMoffy(value:unknown):Moffy {
 const m=value as Moffy
 if(!m||typeof m!=='object')throw new Error('モッフィーのデータが読めませんでした。')
 if(typeof m.id!=='string'||!/^[0-9a-f]{8}$/.test(m.id))throw new Error('モッフィーの識別子が正しくありません。')
 if(typeof m.name!=='string'||!m.name)throw new Error('モッフィーの名前がありません。')
 if(typeof m.image!=='string'||!m.image.startsWith('data:image/')||m.image.length>900000)throw new Error('モッフィーの画像が正しくありません。')
 const number=(value:unknown,min:number,max:number)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('モッフィーの性能が範囲外です。');return value}
 const outline=(value:unknown)=>{if(!Array.isArray(value)||value.length!==OUTLINE_POINTS*2||value.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))throw new Error('モッフィーの輪郭が正しくありません。');return value as number[]}
 const t=m.traits,s=m.stats
 if(!t||!s||!s.size)throw new Error('モッフィーの性能が見つかりません。')
 return {
  id:m.id,name:m.name.slice(0,24),image:m.image,
  color:typeof m.color==='string'&&/^#[0-9a-f]{6}$/i.test(m.color)?m.color:'#f2dcea',
  outline:outline(m.outline),
  traits:{bulk:number(t.bulk,0,1),bright:number(t.bright,0,1),vivid:number(t.vivid,0,1),fluff:number(t.fluff,0,1),hue:number(t.hue,0,360),wide:number(t.wide,0,1)},
  stats:{mass:number(s.mass,.3,3),friction:number(s.friction,.1,1.2),restitution:number(s.restitution,0,.5),size:{x:number(s.size.x,.6,3),y:number(s.size.y,.25,1.2),z:number(s.size.z,.6,3.6)}}
 }
}

/** 見た目の特徴を、画面に出す短い言葉にする。 */
export function describeMoffy(moffy:Moffy){
 const t=moffy.traits
 return [
  t.bulk>.62?'大きめ':t.bulk<.3?'小さめ':'ふつうの大きさ',
  t.fluff>.6?'ふわふわ':t.fluff<.25?'つるつる':'しっとり',
  t.vivid>.6?'あざやか':t.vivid<.25?'おちついた色':'やわらかい色',
  t.bright>.68?'あかるい':t.bright<.34?'くらい':'ほどよい明るさ'
 ]
}

// ここから下はブラウザの中だけで動く部分。画像を読み、縮めて、背景を抜く。
function canvas(size:number){const element=document.createElement('canvas');element.width=size;element.height=size;const context=element.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('画像を読み取れませんでした。別のブラウザでお試しください。');return {element,context}}

function drawContain(context:CanvasRenderingContext2D,image:HTMLImageElement,size:number){
 // 正方形の真ん中へ、縦横比を保ったまま収める。Moffy Booth の画像は 1:1 だが、念のため。
 const scale=Math.min(size/image.naturalWidth,size/image.naturalHeight)
 const w=image.naturalWidth*scale,h=image.naturalHeight*scale
 context.clearRect(0,0,size,size)
 context.drawImage(image,(size-w)/2,(size-h)/2,w,h)
}

async function loadImage(file:File):Promise<HTMLImageElement>{
 if(!file.type.startsWith('image/'))throw new Error('画像ファイルを選んでください。')
 if(file.size>12*1024*1024)throw new Error('画像が大きすぎます。12MBまでの画像を選んでください。')
 const url=URL.createObjectURL(file)
 try{
  const image=new Image()
  await new Promise<void>((done,fail)=>{image.onload=()=>done();image.onerror=()=>fail(new Error('画像を開けませんでした。別のファイルでお試しください。'));image.src=url})
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('画像を開けませんでした。別のファイルでお試しください。')
  return image
 }finally{URL.revokeObjectURL(url)}
}

/** 背景を透明にする。立ち絵として置いたときに、白い四角に見えないようにするため。 */
function cutout(context:CanvasRenderingContext2D,size:number){
 const frame=context.getImageData(0,0,size,size),data=frame.data
 const corners=[[0,0],[size-1,0],[0,size-1],[size-1,size-1]].map(([x,y])=>(y*size+x)*4)
 if(corners.every(i=>data[i+3]<24))return               // すでに切り抜かれている
 const back=[0,1,2].map(c=>corners.reduce((sum,i)=>sum+data[i+c],0)/4)
 // 四隅の色がばらばらなら、背景ではなく絵柄なので触らない。
 if(corners.some(i=>Math.hypot(data[i]-back[0],data[i+1]-back[1],data[i+2]-back[2])>40))return
 for(let i=0;i<data.length;i+=4){
  const distance=Math.hypot(data[i]-back[0],data[i+1]-back[1],data[i+2]-back[2])
  data[i+3]=Math.round(data[i+3]*smooth(26,78,distance))
 }
 context.putImageData(frame,0,0)
}

/** 画像ファイル1つから、1体のモッフィーを作る。 */
export async function createMoffy(file:File):Promise<Moffy>{
 const image=await loadImage(file)
 const sample=canvas(SAMPLE)
 drawContain(sample.context,image,SAMPLE)
 const pixels=sample.context.getImageData(0,0,SAMPLE,SAMPLE).data
 const traits=readTraits(pixels,SAMPLE,SAMPLE)
 const store=canvas(STORE)
 drawContain(store.context,image,STORE)
 cutout(store.context,STORE)
 // 切り抜いたあとのアルファから型紙を取る。板に抜くときの輪郭になる。
 const cut=store.context.getImageData(0,0,STORE,STORE).data
 const mask=new Uint8Array(STORE*STORE)
 for(let i=0;i<mask.length;i++)mask[i]=cut[i*4+3]>128?1:0
 const name=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim().slice(0,24)||'なまえのないモッフィー'
 return {id:fingerprint(pixels),name,image:store.element.toDataURL('image/png'),outline:traceOutline(mask,STORE),traits,stats:readStats(traits),color:toneColor(traits.hue,traits.vivid)}
}

/** モッフィーを、そのまま戦える1体の機体にする。パーツは付けない。 */
export function moffyBuild(moffy:Moffy):Build {
 return {body:'standard',equipment:[],name:moffy.name.slice(0,30),color:moffy.color,sleeve:moffy.color,face:'none',pattern:'none',moffy:structuredClone(moffy)}
}
