import { load, save } from './storage'

// 自作のT字レバー（ESP32＋スライドボリューム）とのつなぎ込み。
// ESP32 は USB シリアルへ生の ADC 値を "V <値>" の1行として流すだけで、
// 「引いた量 → 強さ」の変換と「手を離した瞬間」の判定はすべてこちら側で行う。
// こうしておけば、しきい値を変えるたびにファームウェアを書き直す必要がない。

export interface LeverCalibration { rest:number; full:number }
export const DEFAULT_CALIBRATION:LeverCalibration={rest:60,full:3900}
const RAW_LIMIT=65535     // 想定しうる ADC の最大値（12bitでも16bitでも受けられるように）
const MIN_SPAN=250        // 静止位置と最大位置の差。これ未満ではキャリブレーションとして成立しない
const ENGAGE=.07          // ここを超えたら「引いている」とみなす
const DROP=.1             // ピークからこれだけ戻れば、手を離したと判断する
const RETURN_SPEED=-1.1   // 戻り速度（毎秒）のしきい値。バネの戻りはこれよりずっと速い
const MIN_FIRE=.12        // これ未満のピークは発射しない（軽く触っただけの誤射を防ぐ）
const SMOOTH=.03          // 表示と判定に使う一次ローパスの時定数（秒）
const SLOW=.15            // キャリブレーション用、ゆっくりした平均の時定数（秒）。ADCのばらつきを抑えつつ、1秒止めればほぼ追いつく

export type LeverEvent = {type:'pull';power:number}|{type:'release';power:number}|{type:'cancel'}

function clampRaw(value:number){return Math.min(RAW_LIMIT,Math.max(0,Math.round(value)))}

export function loadCalibration():LeverCalibration {
 const value=load<Partial<LeverCalibration>>('lever',{})
 const pick=(x:unknown,fallback:number)=>typeof x==='number'&&Number.isFinite(x)?clampRaw(x):fallback
 return {rest:pick(value.rest,DEFAULT_CALIBRATION.rest),full:pick(value.full,DEFAULT_CALIBRATION.full)}
}

/** シリアル通信から切り離した、レバーの状態機械。生の ADC 値の列だけから発射を判定する。 */
export class LeverTracker {
 calibration:LeverCalibration
 raw=0        // 直近の生の値
 average=0    // ゆっくりした平均（キャリブレーションで位置を読むときに使う）
 value=0      // 0〜1 に正規化した引き量
 private phase:'rest'|'pulling'|'spent'='spent'
 private peak=0
 private time=0
 private started=false
 constructor(calibration:LeverCalibration=loadCalibration()){this.calibration=calibration}
 /** 静止位置と最大位置の差が足りていて、強さに変換できる状態か。 */
 get calibrated(){return Math.abs(this.calibration.full-this.calibration.rest)>=MIN_SPAN}
 get pulling(){return this.phase==='pulling'}
 /** つないだ直後など、いちどレバーが静止位置へ戻るまで発射させない。 */
 disarm(){this.phase='spent';this.peak=0}
 reset(){this.disarm();this.value=0;this.time=0;this.started=false}
 private normalize(raw:number){const span=this.calibration.full-this.calibration.rest;if(Math.abs(span)<MIN_SPAN)return 0;return Math.min(1,Math.max(0,(raw-this.calibration.rest)/span))}
 private static power(value:number){return Math.min(1,Math.max(.05,value))}
 feed(raw:number,now:number):LeverEvent|null {
  if(!Number.isFinite(raw))return null
  this.raw=clampRaw(raw)
  const target=this.normalize(this.raw)
  if(!this.started){this.started=true;this.time=now;this.average=this.raw;this.value=target;return null}
  const delta=Math.min(.12,Math.max(0,(now-this.time)/1000));this.time=now
  // dt が 0 の（同じミリ秒に2件届いた）ときは平滑化を飛ばし、速度を 0 とみなす。
  if(delta>0){this.average+=(this.raw-this.average)*(1-Math.exp(-delta/SLOW))}
  const previous=this.value
  if(delta>0)this.value+=(target-this.value)*(1-Math.exp(-delta/SMOOTH))
  const speed=delta>0?(this.value-previous)/delta:0
  if(!this.calibrated)return null
  if(this.phase==='spent'){if(this.value<ENGAGE)this.phase='rest';return null}
  if(this.phase==='rest'){if(this.value<ENGAGE)return null;this.phase='pulling';this.peak=this.value;return {type:'pull',power:LeverTracker.power(this.value)}}
  if(this.value>this.peak)this.peak=this.value
  // バネで一気に戻ったか、ゆっくり静止位置まで戻したか。どちらも「離した」と扱う。
  if(!((this.peak-this.value>=DROP&&speed<=RETURN_SPEED)||this.value<ENGAGE))return {type:'pull',power:LeverTracker.power(this.value)}
  const peak=this.peak
  this.phase='spent';this.peak=0
  return peak<MIN_FIRE?{type:'cancel'}:{type:'release',power:LeverTracker.power(peak)}
 }
 /** いまの位置を 0%（手を離した位置）として覚える。 */
 captureRest(){return this.store({rest:Math.round(this.average),full:this.calibration.full})}
 /** いまの位置を 100%（いちばん奥まで引いた位置）として覚える。 */
 captureFull(){return this.store({rest:this.calibration.rest,full:Math.round(this.average)})}
 private store(next:LeverCalibration){
  if(Math.abs(next.full-next.rest)<MIN_SPAN)throw new Error('0%と100%の差が小さすぎます。配線と、スライドボリュームが端まで動くかを確認してください。')
  this.calibration={rest:clampRaw(next.rest),full:clampRaw(next.full)}
  this.reset()
  return this.calibration
 }
 /** 保存した値を捨てて、初期のめやすへ戻す。 */
 clear(){this.calibration={...DEFAULT_CALIBRATION};this.reset();return this.calibration}
}

export type LeverStatus = 'unsupported'|'offline'|'connecting'|'online'
export interface LeverSnapshot { status:LeverStatus; message:string; value:number; raw:number; calibrated:boolean; pulling:boolean; receiving:boolean }

export function serialSupported(){return typeof navigator!=='undefined'&&'serial' in navigator}
function describe(error:unknown){const e=error as {message?:string;name?:string};return e?.message||e?.name||String(error)}

/** T字レバーとの USB シリアル接続。画面をまたいで使うので、このモジュールの `lever` を共有する。 */
export class LeverLink {
 readonly tracker=new LeverTracker()
 onEvent:((event:LeverEvent)=>void)|null=null
 onChange:((snapshot:LeverSnapshot)=>void)|null=null
 private port:SerialPort|null=null
 private reader:ReadableStreamDefaultReader<Uint8Array>|null=null
 private alive=false
 private receiving=false
 private status:LeverStatus=serialSupported()?'offline':'unsupported'
 private message=''
 private pulled=0
 private notified=0
 constructor(){if(serialSupported())navigator.serial.addEventListener('disconnect',this.unplugged)}
 // 抜かれた通知の形はブラウザによって target か port に入る。どちらでもない通知は、
 // 受信ループ側がエラーで気づくので無視する。
 private unplugged=(event:Event)=>{const source=event as unknown as {target?:unknown;port?:unknown};if(this.port&&(source.target===this.port||source.port===this.port))void this.teardown('レバーのケーブルが抜けました。')}
 snapshot():LeverSnapshot {return {status:this.status,message:this.message,value:this.tracker.value,raw:this.tracker.raw,calibrated:this.tracker.calibrated,pulling:this.tracker.pulling,receiving:this.receiving}}
 get connected(){return this.status==='online'}
 private update(status:LeverStatus,message:string){this.status=status;this.message=message;this.notified=0;this.onChange?.(this.snapshot())}
 // 100Hz で届くので、画面の更新は 20Hz 程度に間引く。
 private notify(){const now=performance.now();if(now-this.notified<50)return;this.notified=now;this.onChange?.(this.snapshot())}
 /** ポート選択ダイアログを開く。クリックなどの操作の中から呼ぶこと。 */
 async connect(){
  if(this.status==='unsupported'){this.update('unsupported','このブラウザはUSBシリアルに対応していません。パソコンのChromeまたはEdgeで開いてください。');return false}
  if(this.status!=='offline')return this.status==='online'
  try{return await this.open(await navigator.serial.requestPort())}
  catch(error){
   // 選択ダイアログを閉じただけのときは、エラーとして見せない。
   if((error as DOMException)?.name==='NotFoundError'){this.update('offline','');return false}
   this.update('offline',`レバーにつなげませんでした：${describe(error)}`);return false
  }
 }
 /** 以前に許可したポートがあれば、ダイアログなしでつなぎ直す。 */
 async restore(){
  if(this.status!=='offline')return this.status==='online'
  try{const ports=await navigator.serial.getPorts();return ports.length?await this.open(ports[0]):false}catch{return false}
 }
 private async open(port:SerialPort){
  this.update('connecting','レバーをさがしています…')
  try{await port.open({baudRate:115200,bufferSize:2048})}
  catch(error){this.update('offline',`ポートを開けませんでした：${describe(error)}。Arduino IDEのシリアルモニタなど、他のアプリが使っていないか確認してください。`);return false}
  this.port=port;this.alive=true;this.receiving=false;this.tracker.reset()
  this.update('online','レバーにつながりました。値がとどくまで少し待ってください。')
  void this.pump()
  void this.send('?')
  return true
 }
 private async pump(){
  const port=this.port
  if(!port?.readable){await this.teardown('レバーからの受信を開けませんでした。');return}
  const decoder=new TextDecoder();let buffer=''
  try{
   this.reader=port.readable.getReader()
   while(this.alive){
    const {value,done}=await this.reader.read()
    if(done)break
    buffer+=decoder.decode(value,{stream:true})
    for(let index=buffer.indexOf('\n');index>=0;index=buffer.indexOf('\n')){this.line(buffer.slice(0,index));buffer=buffer.slice(index+1)}
    if(buffer.length>512)buffer=''  // 改行が来ないときは溜め込まずに捨てる
   }
  }catch(error){if(this.alive){await this.teardown(`レバーとの通信が切れました：${describe(error)}`);return}}
  finally{try{this.reader?.releaseLock()}catch{}this.reader=null}
  if(this.alive)await this.teardown('レバーの接続が切れました。ケーブルを確認してください。')
 }
 private line(text:string){
  const line=text.trim()
  if(!line||line.startsWith('#'))return      // "#" で始まる行は機器からの説明なので読み飛ばす
  const match=/^V[ \t]+(-?\d+)/.exec(line)
  if(!match)return
  const raw=Number(match[1])
  if(!Number.isFinite(raw))return
  if(!this.receiving){this.receiving=true;this.update('online',this.tracker.calibrated?'レバーが使えます。':'レバーの0%と100%を登録してください。')}
  const event=this.tracker.feed(raw,performance.now())
  if(event?.type==='pull'){
   // 照準のプレビューは 30Hz あれば足りる。離した瞬間だけは必ず即座に伝える。
   const now=performance.now()
   if(now-this.pulled>=33){this.pulled=now;this.onEvent?.(event)}
  }else if(event){this.pulled=0;this.onEvent?.(event)}
  this.notify()
 }
 private async send(text:string){
  const writable=this.port?.writable
  if(!writable)return
  const writer=writable.getWriter()
  try{await writer.write(new TextEncoder().encode(`${text}\n`))}catch{}
  finally{try{writer.releaseLock()}catch{}}
 }
 disarm(){this.tracker.disarm()}
 /** いまの位置を 0% か 100% として覚え、端末へ保存する。 */
 calibrate(end:'rest'|'full'){
  if(!this.receiving)throw new Error('レバーの値がまだとどいていません。つないでから少し待って、もう一度お試しください。')
  const value=end==='rest'?this.tracker.captureRest():this.tracker.captureFull()
  this.persist()
  this.update(this.status,end==='rest'?'手を離した位置を0%として覚えました。':'いちばん奥の位置を100%として覚えました。')
  return value
 }
 clearCalibration(){this.tracker.clear();this.persist();this.update(this.status,'キャリブレーションを初期の値へ戻しました。')}
 private persist(){if(!save('lever',this.tracker.calibration))throw new Error('キャリブレーションを保存できませんでした。端末の空き容量をご確認ください。')}
 async disconnect(){await this.teardown('レバーを切りはなしました。')}
 private async teardown(message:string){
  this.alive=false
  const port=this.port;this.port=null;this.receiving=false
  try{await this.reader?.cancel()}catch{}
  try{await port?.close()}catch{}
  this.tracker.reset()
  this.update('offline',message)
 }
}

export const lever=new LeverLink()
