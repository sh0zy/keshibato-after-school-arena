import type { BodyDef, Build, Combo, PartDef, ShapeSpec, Socket, StageDef, StageObject, Vec3 } from './types'
import { assetUrl } from './assets'

const v = (x:number,y:number,z:number):Vec3 => ({x,y,z})
export const SOCKET_LABELS:Record<Socket,string> = {front:'前',back:'後ろ',left:'左',right:'右',top_left:'上面左',top_right:'上面右'}
const sockets = Object.keys(SOCKET_LABELS) as Socket[]
export const BODIES:BodyDef[] = [
  {id:'standard',name:'スタンダード',subtitle:'はじめの相棒',description:'角が丸い、扱いやすい定番の消しゴム。好きな装備を素直に試せます。',weakness:'特化した強みは控えめ。',size:v(1.3,.6,3),mass:1,friction:.48,restitution:.12,color:'#f5f0df',model:assetUrl('/models/body_standard.glb')},
  {id:'mini',name:'スピードミニ',subtitle:'小さく、すばやく',description:'薄くて軽い。隙間を抜け、少ない力で遠くへ走ります。',weakness:'押し出されやすく、強すぎる発射に注意。',size:v(1,.4,2.1),mass:.65,friction:.39,restitution:.15,color:'#fff2ba',model:assetUrl('/models/body_mini.glb')},
  {id:'wide',name:'どっしりワイド',subtitle:'低く、どっしり',description:'低く幅広い重心で押し合いと踏ん張りが得意。',weakness:'動き出しが重く、細い橋では幅が気になります。',size:v(2,.5,2.7),mass:1.6,friction:.58,restitution:.09,color:'#d8eddc',model:assetUrl('/models/body_wide.glb')},
  {id:'round',name:'コロコロラウンド',subtitle:'ころんと、変則的',description:'丸みのあるシルエットで回転や反射を楽しめます。',weakness:'真っすぐ止めるには打点の工夫が必要。',size:v(1.7,.6,1.9),mass:.95,friction:.42,restitution:.23,color:'#ffd9da',model:assetUrl('/models/body_round.glb')},
  {id:'tall',name:'のっぽブロック',subtitle:'重心であそぼう',description:'高さがあり、装備する場所で転がり方が大きく変わります。',weakness:'横からの衝突で転びやすい本体です。',size:v(1.3,1.1,2.3),mass:1.3,friction:.5,restitution:.13,color:'#dcdcf4',model:assetUrl('/models/body_tall.glb')},
  {id:'slim',name:'ロングスリム',subtitle:'長さを、武器に',description:'細長い本体。細い道と回転時のリーチが持ち味です。',weakness:'横を押されると姿勢を崩しやすい。',size:v(.85,.5,3.5),mass:.85,friction:.44,restitution:.13,color:'#d0edf0',model:assetUrl('/models/body_slim.glb')},
]

const box = (x:number,y:number,z:number,px=0,py=0,pz=z/2):ShapeSpec => ({kind:'box',size:v(x,y,z),position:v(px,py,pz)})
const hull = (polygon:[number,number][],thickness=.12):ShapeSpec => ({kind:'hull',size:v(1,thickness,1),position:v(0,0,0),points:[-thickness/2,thickness/2].flatMap(y=>polygon.flatMap(([x,z])=>[x,y,z]))})
const wire = (points:[number,number][],width=.1):ShapeSpec[] => points.slice(1).map((b,i)=>{const a=points[i],dx=b[0]-a[0],dz=b[1]-a[1],angle=Math.atan2(dx,dz);return {...box(width,.12,Math.hypot(dx,dz)+width,(a[0]+b[0])/2,0,(a[1]+b[1])/2),rotation:{x:0,y:Math.sin(angle/2),z:0,w:Math.cos(angle/2)}}})
type PartInput = Omit<PartDef,'sockets'|'model'|'icon'|'metal'|'friction'|'restitution'> & Partial<Pick<PartDef,'metal'|'friction'|'restitution'>>
const part=(p:PartInput):PartDef=>({sockets:[...sockets],model:assetUrl(`/models/part_${p.id}.glb`),icon:assetUrl(`/icons/part_${p.id}.png`),metal:false,friction:.4,restitution:.12,...p})
export const PARTS:PartDef[] = [
  part({id:'ruler',name:'定規ブレード',shortName:'定規',description:'目盛り入りの短い定規。幅とリーチを増やします。',tactic:'横に広い面で相手の側面を押す。',weakness:'自分の当たる幅も増えます。',category:'押す',color:'#79cbd0',mass:.18,shapes:[box(1.8,.12,.65,0,0,.34)]}),
  part({id:'pencil',name:'鉛筆ランス',shortName:'鉛筆',description:'丸く安全な芯先を持つ六角の鉛筆。細い先端が接触点になります。',tactic:'相手の端を狙って回転させる。',weakness:'狙いがずれると空振りします。',category:'押す',color:'#efbd46',mass:.13,shapes:[box(.26,.26,1.42,0,0,.71),hull([[-.13,1.42],[.13,1.42],[0,1.7]],.24)]}),
  part({id:'binder_clip',name:'ダブルクリップ',shortName:'クリップ',description:'金属の持ち手と重い黒い本体。取り付け位置に重さを加えます。',tactic:'低い位置で安定。前の定規と押し合う。',weakness:'加速しにくく、移動が短くなります。',category:'守る',color:'#525966',mass:.46,metal:true,friction:.65,shapes:[box(.65,.4,.6,0,-.075),box(.5,.15,.42,0,.2,.3)]}),
  part({id:'rubber_band',name:'輪ゴムバンパー',shortName:'輪ゴム',description:'張った輪ゴムの接触面で弾みます。反発はエネルギーが増えない範囲です。',tactic:'壁や相手の反射を利用する。',weakness:'自分にも反動。机の端では慎重に。',category:'跳ねる',color:'#e99f62',mass:.12,friction:.52,restitution:.8,shapes:[box(1.15,.4,.18,0,0,.56),box(.16,.3,.47,-.49,0,.235),box(.16,.3,.47,.49,0,.235)]}),
  part({id:'sticky_note',name:'付箋ウイング',shortName:'付箋',description:'折り目のついた紙の翼。空中だけ回転を抑える補助が働きます。',tactic:'ジャンプの姿勢を整え、着地を安定させる。',weakness:'幅が広がり、地上の押し合いには弱い。',category:'滑る',color:'#f4d76e',mass:.04,friction:.3,shapes:[box(1.65,.12,.85),box(.65,.1,.45,0,.1,.6)],passive:'glide',maxForce:.5}),
  part({id:'pen_cap',name:'ペンキャップジャンパー',shortName:'キャップ',description:'発射前にジャンプを選択。発射の力を水平と垂直へ配分します。',tactic:'段差や隙間を越え、上から着地する。',weakness:'ジャンプ中は水平移動が減ります。',category:'跳ねる',color:'#ec797c',mass:.17,shapes:[box(.42,.55,.8)],active:'jump',maxForce:2.5}),
  part({id:'triangle_ruler',name:'三角定規',shortName:'三角定規',description:'中央に穴のある三角形。斜めの接触面で進路をそらします。',tactic:'斜面へ当てて相手を外周へいなす。',weakness:'面を向ける角度によって結果が変わります。',category:'技巧',color:'#91cfe2',mass:.17,shapes:[hull([[-.725,.05],[.725,.05],[.24,.24],[-.48,.24]]),hull([[.725,.05],[-.725,1.35],[-.48,.95],[.24,.24]]),hull([[-.725,1.35],[-.725,.05],[-.48,.24],[-.48,.95]])]}),
  part({id:'eraser_shield',name:'ミニ消しゴムシールド',shortName:'シールド',description:'厚くやわらかい小型消しゴム。低反発の面で勢いを受け止めます。',tactic:'正面で受け、端で踏ん張る。',weakness:'重く、相手を大きく弾くのは苦手。',category:'守る',color:'#e7cadd',mass:.32,friction:.7,restitution:.02,shapes:[box(1.1,.65,.5)]}),
  part({id:'tape_roll',name:'テープローラー',shortName:'テープ',description:'芯のある丸いテープ。接地する配置では滑走を伸ばします。',tactic:'反射の後も長く移動する。',weakness:'停止位置を読み違えると自滅します。',category:'滑る',color:'#e8c884',mass:.2,friction:.13,restitution:.18,shapes:[box(.7,.75,.7)],passive:'slide',maxForce:.65}),
  part({id:'correction_tape',name:'修正テープスキッド',shortName:'修正テープ',description:'内部リールの見えるケース。接地する底面が滑りを助けます。',tactic:'直進の移動距離を伸ばす。',weakness:'横から押されたときも滑りやすい。',category:'滑る',color:'#a8d7cf',mass:.17,friction:.1,shapes:[hull([[-.325,0],[.325,0],[.325,.7],[0,1],[-.325,.7]],.3)],passive:'slide',maxForce:.65}),
  part({id:'stapler',name:'ホチキスストライカー',shortName:'ホチキス',description:'発射前に選ぶと、その発射の最初の正面衝突に押し込みを加えます。',tactic:'まっすぐ面を当てて一度だけ押す。',weakness:'重さと反動が自分にもかかります。',category:'押す',color:'#da6475',mass:.36,metal:true,shapes:[box(.55,.2,1.1,0,-.125),box(.55,.25,1,0,.1,.52)],active:'strike',maxForce:2.2}),
  part({id:'magnet',name:'マグネット',shortName:'磁石',description:'発射中だけ、近い金属装備へ吸引・反発。遮蔽物越しには働きません。',tactic:'金属との位置関係を変え、接触を誘う。',weakness:'非金属には無効。双方に反作用があります。',category:'技巧',color:'#eb6f6f',mass:.28,metal:true,shapes:[box(1.05,.4,.25),box(.25,.4,.65,-.4,0,.575),box(.25,.4,.65,.4,0,.575)],active:'magnet',maxForce:3}),
  part({id:'paper_clip',name:'ゼムクリップフック',shortName:'ゼムクリップ',description:'穴と開口のある曲がった金属線。接触する形で相手の端を引っ掛けます。',tactic:'横から寄せ、回転や進路変更を誘う。',weakness:'正面の押し合いは苦手です。',category:'技巧',color:'#afb7c5',mass:.1,metal:true,friction:.5,shapes:wire([[-.12,.25],[-.12,.9],[.02,1.02],[.16,.9],[.16,.16],[0,.06],[-.25,.19],[-.25,1.07],[-.12,1.24],[.2,1.24],[.28,1.08],[.28,.36]],.09)}),
  part({id:'sharpener',name:'鉛筆削りウェイト',shortName:'鉛筆削り',description:'穴と金属面を持つ小さな重り。取り付け位置の質量が増えます。',tactic:'低い位置へ付けて横転を抑える。',weakness:'加速と移動距離が減ります。',category:'守る',color:'#9ba7b9',mass:.48,metal:true,friction:.6,shapes:[box(.65,.45,.6)]}),
  part({id:'chalk',name:'チョークダスター',shortName:'チョーク',description:'選ぶと次の発射地点に滑る粉を置きます。所有者ごとに配置数を制限します。',tactic:'自分も相手も滑る路面を戦術にする。',weakness:'相手だけに効く粉ではありません。',category:'路面',color:'#f3ddd2',mass:.09,friction:.25,shapes:[box(.3,.3,.9)],active:'chalk',maxForce:1.4}),
  part({id:'brush',name:'ミニブラシ',shortName:'ブラシ',description:'毛束の摩擦で、接地している間だけ横滑りと余計な回転を抑えます。',tactic:'着地後に止め、丁寧に位置を取る。',weakness:'速度と移動距離も落ちます。',category:'守る',color:'#ba946d',mass:.12,friction:.9,shapes:[box(.85,.22,.55,0,.115),box(.85,.23,.5,0,-.11,.3)],passive:'brush',maxForce:.6}),
  part({id:'glue_stick',name:'スティックのり',shortName:'のり',description:'発射時に選ぶと、摩擦の高い小さなエリアを置きます。完全固定はしません。',tactic:'止まりやすい場所を作って位置を守る。',weakness:'自分が通っても減速します。',category:'路面',color:'#deb45f',mass:.18,friction:.64,shapes:[box(.4,.4,.9)],active:'glue',maxForce:1.1}),
  part({id:'crayon',name:'クレヨンカーブ',shortName:'クレヨン',description:'発射前に曲がる向きを設定。接地中だけ控えめな回転補助が働きます。',tactic:'障害物の横を曲がりながら通る。',weakness:'曲げるほど直進速度が落ち、追尾はしません。',category:'技巧',color:'#ad8dc2',mass:.11,friction:.5,shapes:[box(.3,.3,1)],active:'curve',maxForce:.65}),
  part({id:'protractor',name:'分度器サイト',shortName:'分度器',description:'半円の目盛り付き薄板。最初の反射まで、同じ物理条件の予測を表示します。',tactic:'角度を読み、反射先を目安に狙う。',weakness:'幅と質量が増え、予測は成功の保証ではありません。',category:'技巧',color:'#a9d9cc',mass:.14,friction:.36,shapes:[hull([[-.75,.05],[.75,.05],[.68,.43],[.43,.75],[0,.9],[-.43,.75],[-.68,.43]],.1)],passive:'predict'}),
  part({id:'pencil_extender',name:'鉛筆補助軸テール',shortName:'補助軸',description:'長い筒状の尾。長さと質量分布で回転時のリーチを増やします。',tactic:'後方へ伸ばして両端の回転を使う。',weakness:'横を取られやすく、細い通路で引っ掛かります。',category:'押す',color:'#b89970',mass:.21,metal:true,shapes:[box(.3,.3,1.7)]}),
]

const o=(id:string,kind:StageObject['kind'],x:number,y:number,z:number,sx:number,sy:number,sz:number,extra:Partial<StageObject>={}):StageObject=>({id,kind,position:v(x,y,z),size:v(sx,sy,sz),...extra})
const desk=()=>o('desk','desk',0,-.5,0,24,1,17,{color:'#c89b66',friction:.52})
const spawn=(y=.4)=>[v(-6,y,-2),v(6,y,2),v(-6,y,2),v(6,y,-2)]
const stage=(id:string,name:string,subtitle:string,description:string,difficulty:string,color:string,objects:StageObject[],spawns=spawn(),music='classroom',extra:Partial<StageDef>={}):StageDef=>({id,name,subtitle,description,difficulty,color,objects,spawns,fallY:-6,music,...extra})
export const STAGES:StageDef[] = [
  stage('classroom','放課後の木の机','いつもの机が、アリーナ。','広い木の机と開けた外周。押し合いと端での踏ん張りを楽しもう。','はじめて','#d8b480',[desk()]),
  stage('rebound','定規リバウンド広場','角度を読んで、もう一撃。','上下の定規壁で反射。左右は開けているので反動にも注意。','かんたん','#8ec8cc',[desk(),o('wall_n','ruler',0,.45,-7.6,15,.9,.25,{restitution:.7} as Partial<StageObject>),o('wall_s','ruler',0,.45,7.6,15,.9,.25),o('notebook','book',0,.12,0,3,.24,4,{color:'#f3cb75'})]),
  stage('twin_desks','つながる2つの机','橋を渡る？飛び越える？','間隔4の机を、幅5の橋でつなぎました。橋以外の隙間はジャンプでも越えられます。','ふつう','#e1b886',[o('desk_l','desk',-7,-.5,0,10,1,17),o('desk_r','desk',7,-.5,0,10,1,17),o('bridge','bridge',0,-.15,0,4.4,.3,5,{color:'#d5ac76'})]),
  stage('art_room','図工室マット','路面を読み、すっと走る。','緑の工作マットと滑る下敷き、止まりやすい紙の道。低いブロックを回り込もう。','ふつう','#6fa993',[desk(),o('mat','mat',0,.035,0,20,.07,14,{color:'#5e9b80',friction:.7}),o('slide','mat',0,.09,-3,16,.04,3,{color:'#a8d6de',friction:.16}),o('paper','mat',0,.09,3,16,.04,3,{color:'#f2dfb8',friction:.85}),o('block','bumper',0,.4,0,2,.65,2,{color:'#e8a375'})],spawn(.5),'art'),
  stage('book_steps','本の段々アリーナ','下の足場も、作戦のうち。','中央の本から外れても下段の本へ着地できます。緩い斜面で上段へ戻れます。','ふつう','#b5a0cf',[o('lower','book',0,-2,0,24,1,17,{color:'#8199b6'}),o('left_book','book',-6,-.5,0,10,1,10,{color:'#c97a70'}),o('right_book','book',6,-.5,0,10,1,10,{color:'#91b19c'}),o('center_bridge','bridge',0,-.15,0,2.4,.3,5),o('ramp_n','bridge',0,-.76,-5.7,8,.22,5,{tilt:-.3,color:'#e7c899'}),o('ramp_s','bridge',0,-.76,5.7,8,.22,5,{tilt:.3,color:'#e7c899'})],spawn(),'library'),
  stage('pencil_case','筆箱ブリッジ','その幅で、通れるかな。','2つの筆箱の間に幅3.8と幅5.6の通路。横の装備を含めた機体幅を確かめよう。','むずかしい','#759cb6',[o('case_l','case',-8,-.55,0,8,1.1,14,{color:'#6c92aa'}),o('case_r','case',8,-.55,0,8,1.1,14,{color:'#dd9a8f'}),o('narrow','bridge',0,-.16,-3.3,8.4,.32,3.8),o('wide_bridge','bridge',0,-.16,3.3,8.4,.32,5.6)],spawn()),
  stage('protractor_circle','分度器サークル','斜めの壁で、ひらめく。','円に近い段付きの外周と斜めの短い壁。開いた角度を見つけて反射させよう。','ふつう','#a6c2b3',[o('center','desk',0,-.5,0,24,1,10),o('north','desk',0,-.5,-6.5,18,1,3),o('south','desk',0,-.5,6.5,18,1,3),o('angle_n','ruler',-3,.5,-5.8,5,1,.25,{rotation:.45}),o('angle_s','ruler',3,.5,5.8,5,1,.25,{rotation:.45})]),
  stage('pinball','文房具ピンボール','ころん、かつん、連鎖。','固定バンパーの間で反射し、軽い消しゴム障害物を押して道をつくろう。','むずかしい','#e2b06d',[desk(),o('bumper_a','bumper',0,.45,-3.8,1.5,.9,1.5,{color:'#dd8a80'}),o('bumper_b','bumper',0,.45,3.8,1.5,.9,1.5,{color:'#7cafa5'}),o('bumper_c','bumper',0,.45,0,1.4,.9,1.4,{rotation:.65,color:'#d4b968'}),o('loose_l','bumper',-3,.3,0,1,.6,1.7,{dynamic:true,color:'#dda6b7'}),o('loose_r','bumper',3,.3,0,1,.6,1.7,{dynamic:true,color:'#9bbecf'})]),
  stage('seesaw','工作シーソー','重さがつくる、新しい角度。','中央の板は接触した重さで傾きます。安定した左右の台から乗り移ろう。','むずかしい','#b1b18a',[o('base','desk',0,-1.5,0,24,1,17),o('platform_l','book',-8,-.6,0,7,.8,10,{color:'#93aea0'}),o('platform_r','book',8,-.6,0,7,.8,10,{color:'#bea08b'}),o('pivot','bumper',0,-.3,0,1,1.3,4,{color:'#a98965'}),o('seesaw','seesaw',0,.5,0,12,.3,5,{dynamic:true,color:'#dfbc7e'})],spawn(.3),'art'),
  stage('night_lab','夜の自由研究机','あかりの下で、最後の実験。','4つの足場を広い橋で接続。明るい端を目印に、進む足場を選ぼう。','研究級','#788daf',[o('island_l','desk',-8,-.5,0,8,1,11),o('island_r','desk',8,-.5,0,8,1,11),o('island_n','book',0,-.5,-5.2,6,1,5.6,{color:'#a293c1'}),o('island_s','book',0,-.5,5.2,6,1,5.6,{color:'#79a4a0'}),o('bridge_main','bridge',0,-.15,0,8.5,.3,4),o('bridge_n','bridge',0,-.15,-2.2,4.2,.3,3),o('bridge_s','bridge',0,-.15,2.2,4.2,.3,3)],spawn(),'boss',{night:true}),
]

const c=(a:string,b:string,name:string,description:string,tag:string):Combo=>({ids:[a,b],name,description,tag})
export const COMBOS:Combo[] = [
 c('ruler','binder_clip','押し出しブルドーザー','幅広い接触面と重さでじわっと押す。','重い'),c('ruler','rubber_band','リバウンドスイーパー','幅広いバンパーで反射させる。','跳ねる'),c('ruler','pencil','ワイド＆ピンポイント','横への広さと狭い先端を使い分ける。','技巧派'),c('ruler','protractor','バンクショット職人','角度を読んで壁越しに狙う。','技巧派'),
 c('pencil','correction_tape','直進スナイパー','長い移動と細い接触点で狙う。','滑る'),c('pencil','sticky_note','姿勢安定ランス','空中で姿勢を保ち、先端から接触を狙う。','技巧派'),c('pencil','pencil_extender','スピンランサー','両端の長さを使った回転を楽しむ。','曲がる'),c('binder_clip','eraser_shield','どっしりガード','重さと低反発で相手の勢いを受ける。','守る'),
 c('binder_clip','magnet','マグネットタンク','重い機体で金属装備との位置関係を変える。','重い'),c('rubber_band','pen_cap','ホップ＆バウンド','ジャンプと着地後の跳ねを組み合わせる。','跳ねる'),c('rubber_band','triangle_ruler','ピンボールカスタム','斜面と反発で変則的に弾く。','跳ねる'),c('rubber_band','tape_roll','ロングリバウンド','壁から跳ねて長く滑る。','滑る'),
 c('sticky_note','pen_cap','ふせんグライダー','障害物を越え、姿勢を整えて着地する。','跳ねる'),c('sticky_note','brush','きれいに着地','空中の姿勢と着地後の停止を整える。','守る'),c('triangle_ruler','binder_clip','いなしの構え','安定した本体と斜めの面で進路をそらす。','守る'),c('triangle_ruler','paper_clip','ひっかけターン','斜めに寄せてから端を引っ掛ける。','曲がる'),
 c('tape_roll','correction_tape','すべすべ特急','とてもよく滑るが、止める位置が難しい。','滑る'),c('tape_roll','crayon','カーブライダー','曲がりながら障害物の横を通る。','曲がる'),c('stapler','eraser_shield','反動を読む一撃','前後の配置で押し込みと反動に備える。','押す'),c('magnet','paper_clip','メタルキャッチ','金属装備を寄せ、形状で接触を続ける。','技巧派'),
 c('magnet','sharpener','重量マグネット','重い本体で反作用を受け止める。','重い'),c('chalk','glue_stick','路面コントローラー','滑る場所と止まりやすい場所を作る。','技巧派'),c('brush','protractor','丁寧な一手','角度を読み、停止位置を調整する。','守る'),c('protractor','pencil_extender','回転の設計士','反射位置と回転時の長さを利用する。','曲がる'),
]

export const DEFAULT_BUILD:Build = {body:'standard',equipment:[{id:'ruler',socket:'front',rotation:0},{id:'binder_clip',socket:'back',rotation:0}],name:'ぼくの相棒',color:'#f6f1df',sleeve:'#238b81',face:'smile',pattern:'stripe'}
const build=(name:string,body:string,a:string,b:string,color:string,sleeve:string):Build=>({body,name,equipment:[{id:a,socket:'front',rotation:0},{id:b,socket:'back',rotation:0}],color,sleeve,face:'smile',pattern:'stripe'})
export const CPU_BUILDS:Build[] = [
 build('直球くん','standard','pencil','correction_tape','#fff0c5','#d38a37'),
 build('反射名人','round','rubber_band','protractor','#d4e8ef','#387fa3'),
 build('どっしり先輩','wide','eraser_shield','binder_clip','#dce9cf','#789459'),
 build('工作好き','mini','pen_cap','sticky_note','#f5d5d6','#c76273'),
 build('くるくる研究員','slim','crayon','pencil_extender','#e4d7ef','#9470b7'),
 build('自由研究チャンピオン','tall','magnet','chalk','#dce3ef','#536ca7'),
]
export const CHALLENGES = [
 {id:'bank',name:'反射のひらめき',description:'壁に反射させた発射で相手を落とそう。',stageId:'rebound',goal:'bank'},
 {id:'behind',name:'障害物のむこう',description:'中央の障害物を回り込み、相手へ接触しよう。',stageId:'pinball',goal:'contact'},
 {id:'bridge',name:'橋を渡って',description:'橋を通って反対側の足場へ到達しよう。',stageId:'twin_desks',goal:'bridge'},
 {id:'jump',name:'小さな大ジャンプ',description:'キャップを装備し、ジャンプして着地しよう。',stageId:'art_room',goal:'jump'},
 {id:'spin',name:'くるりとタッチ',description:'中央以外の打点で回転をつけて相手に当てよう。',stageId:'classroom',goal:'spin'},
 {id:'return',name:'中央へ、おかえり',description:'机の端から、中央の安全な場所へ戻ろう。',stageId:'classroom',goal:'return'},
 {id:'heavy',name:'重さに負けない',description:'どっしり先輩を角度で崩してリングアウト。',stageId:'classroom',goal:'win'},
 {id:'surface',name:'路面の研究',description:'チョークかのりを選び、路面を変えて発射しよう。',stageId:'art_room',goal:'surface'},
]
export const TOURS = [
 {name:'1時間目・直球くん',description:'「まずは、まっすぐ！ いくよ！」',stageId:'classroom',build:CPU_BUILDS[0]},
 {name:'2時間目・反射名人',description:'「定規の向こうにも、道はあるよ。」',stageId:'rebound',build:CPU_BUILDS[1]},
 {name:'3時間目・どっしり先輩',description:'「あわてず、どっしり。これがコツ。」',stageId:'book_steps',build:CPU_BUILDS[2]},
 {name:'4時間目・工作好き',description:'「このキャップ、空まで飛べるかな？」',stageId:'art_room',build:CPU_BUILDS[3]},
 {name:'5時間目・くるくる研究員',description:'「打点をちょっと変えると……ほら！」',stageId:'protractor_circle',build:CPU_BUILDS[4]},
 {name:'放課後・自由研究チャンピオン',description:'「最後は自由研究。きみの工夫を見せて！」',stageId:'night_lab',build:CPU_BUILDS[5]},
]
