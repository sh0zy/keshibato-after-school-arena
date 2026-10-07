import { describe, expect, it } from 'vitest'
import { DEFAULT_CALIBRATION, DEFAULT_STEER, LeverTracker, SteerTracker, steerDirection } from './lever'
import type { LeverCalibration, LeverEvent } from './lever'

// 実機のかわりに、生の ADC 値の列を 10ms おきに流し込んでレバーの判定を確かめる。
function stream(calibration:LeverCalibration=DEFAULT_CALIBRATION){
 const tracker=new LeverTracker({...calibration});const events:LeverEvent[]=[];let now=1000
 const api={
  tracker,events,
  /** 同じ位置で止まっているあいだの値を流す。 */
  hold(raw:number,ms:number){for(let t=0;t<ms;t+=10){now+=10;const event=tracker.feed(raw,now);if(event)events.push(event)}return api},
  /** from から to へ、指定の時間をかけて動く値を流す。 */
  ramp(from:number,to:number,ms:number){const steps=Math.max(1,Math.round(ms/10));for(let i=1;i<=steps;i++){now+=10;const event=tracker.feed(from+(to-from)*i/steps,now);if(event)events.push(event)}return api},
  /** 静止位置から最大まで引いて保つ。 */
  pullFull(raw=DEFAULT_CALIBRATION.full){return api.hold(DEFAULT_CALIBRATION.rest,60).ramp(DEFAULT_CALIBRATION.rest,raw,120).hold(raw,200)},
  releases(){return events.flatMap(e=>e.type==='release'?[e.power]:[])},
  kinds(){return [...new Set(events.map(e=>e.type))]}
 }
 return api
}

describe('T字レバーの引き量', ()=>{
 it('静止位置では0%、いちばん奥まで引くと100%になる',()=>{
  const lever=stream()
  lever.hold(DEFAULT_CALIBRATION.rest,200)
  expect(lever.tracker.value).toBeLessThan(.02)
  expect(lever.kinds()).toEqual([])
  lever.pullFull()
  expect(lever.tracker.value).toBeGreaterThan(.97)
  expect(lever.tracker.pulling).toBe(true)
  expect(lever.kinds()).toEqual(['pull'])
 })
 it('途中まで引いた量が、そのまま強さの割合になる',()=>{
  const half=DEFAULT_CALIBRATION.rest+(DEFAULT_CALIBRATION.full-DEFAULT_CALIBRATION.rest)*.5
  const lever=stream().pullFull(Math.round(half))
  expect(lever.tracker.value).toBeCloseTo(.5,2)
 })
 it('配線が逆でも、キャリブレーションの向きで吸収する',()=>{
  const lever=stream({rest:3900,full:60})
  lever.hold(3900,200)
  expect(lever.tracker.value).toBeLessThan(.02)
  lever.ramp(3900,60,120).hold(60,200)
  expect(lever.tracker.value).toBeGreaterThan(.97)
 })
 it('0%と100%の差が小さすぎる間は、強さを計算しない',()=>{
  const lever=stream({rest:1000,full:1100})
  expect(lever.tracker.calibrated).toBe(false)
  lever.hold(1000,100).ramp(1000,1100,120).hold(1100,200).hold(1000,200)
  expect(lever.events).toEqual([])
 })
})

describe('手を離した瞬間の判定', ()=>{
 it('バネで一気に戻ると、引いた最大の強さで発射する',()=>{
  const lever=stream().pullFull()
  lever.ramp(DEFAULT_CALIBRATION.full,DEFAULT_CALIBRATION.rest,60).hold(DEFAULT_CALIBRATION.rest,100)
  expect(lever.releases()).toHaveLength(1)
  expect(lever.releases()[0]).toBeGreaterThan(.95)
  expect(lever.tracker.pulling).toBe(false)
 })
 it('ゆっくり戻しても、引いた最大の強さで一度だけ発射する',()=>{
  const lever=stream().pullFull()
  lever.ramp(DEFAULT_CALIBRATION.full,DEFAULT_CALIBRATION.rest,2000).hold(DEFAULT_CALIBRATION.rest,200)
  expect(lever.releases()).toHaveLength(1)
  expect(lever.releases()[0]).toBeGreaterThan(.95)
 })
 it('途中で止めた位置ではなく、いちばん引いた位置の強さを使う',()=>{
  const span=DEFAULT_CALIBRATION.full-DEFAULT_CALIBRATION.rest
  const lever=stream().pullFull(Math.round(DEFAULT_CALIBRATION.rest+span*.8))
  lever.ramp(DEFAULT_CALIBRATION.rest+span*.8,DEFAULT_CALIBRATION.rest,60).hold(DEFAULT_CALIBRATION.rest,100)
  expect(lever.releases()[0]).toBeCloseTo(.8,1)
 })
 it('軽く触っただけでは発射せず、照準の取り消しとして扱う',()=>{
  const touch=Math.round(DEFAULT_CALIBRATION.rest+(DEFAULT_CALIBRATION.full-DEFAULT_CALIBRATION.rest)*.09)
  const lever=stream().hold(DEFAULT_CALIBRATION.rest,60).ramp(DEFAULT_CALIBRATION.rest,touch,60).hold(touch,200)
  lever.ramp(touch,DEFAULT_CALIBRATION.rest,60).hold(DEFAULT_CALIBRATION.rest,100)
  expect(lever.releases()).toEqual([])
  expect(lever.kinds()).toContain('cancel')
 })
 it('一度発射したら、レバーが静止位置へ戻るまで続けて発射しない',()=>{
  const lever=stream().pullFull()
  lever.ramp(DEFAULT_CALIBRATION.full,DEFAULT_CALIBRATION.rest,60)
  expect(lever.releases()).toHaveLength(1)
  // 戻りきる前にもう一度引いても、2発目にはならない。
  lever.ramp(DEFAULT_CALIBRATION.rest,DEFAULT_CALIBRATION.full,60).hold(DEFAULT_CALIBRATION.full,300).ramp(DEFAULT_CALIBRATION.full,DEFAULT_CALIBRATION.rest,60)
  expect(lever.releases()).toHaveLength(1)
  // 静止位置まで戻せば、次の一手が撃てる。
  lever.hold(DEFAULT_CALIBRATION.rest,100).pullFull().ramp(DEFAULT_CALIBRATION.full,DEFAULT_CALIBRATION.rest,60).hold(DEFAULT_CALIBRATION.rest,100)
  expect(lever.releases()).toHaveLength(2)
 })
 it('つないだ直後に引いたままでも、手を離すまで発射しない',()=>{
  const lever=stream()
  lever.hold(DEFAULT_CALIBRATION.full,300)
  expect(lever.events).toEqual([])
  lever.ramp(DEFAULT_CALIBRATION.full,DEFAULT_CALIBRATION.rest,60).hold(DEFAULT_CALIBRATION.rest,100)
  expect(lever.releases()).toEqual([])
 })
 it('照準をやり直すと、レバーを戻すまで発射しない',()=>{
  const lever=stream().pullFull()
  lever.tracker.disarm()
  lever.ramp(DEFAULT_CALIBRATION.full,DEFAULT_CALIBRATION.rest,60).hold(DEFAULT_CALIBRATION.rest,100)
  expect(lever.releases()).toEqual([])
 })
})

describe('キャリブレーション', ()=>{
 it('いまの位置を0%と100%として覚える',()=>{
  const lever=stream()
  lever.hold(820,600)
  expect(lever.tracker.captureRest().rest).toBeCloseTo(820,-1)
  lever.hold(3100,600)
  const calibration=lever.tracker.captureFull()
  expect(calibration.full).toBeCloseTo(3100,-1)
  expect(lever.tracker.calibrated).toBe(true)
  // 覚えた範囲のちょうど真ん中で、強さが50%になる。
  lever.hold(820,200).ramp(820,(820+3100)/2,120).hold((820+3100)/2,300)
  expect(lever.tracker.value).toBeCloseTo(.5,1)
 })
 it('差が小さすぎる登録はエラーにして、前の設定を残す',()=>{
  const lever=stream()
  lever.hold(3800,600)
  expect(()=>lever.tracker.captureRest()).toThrow('差が小さすぎます')
  expect(lever.tracker.calibration).toEqual(DEFAULT_CALIBRATION)
 })
 it('初期の値へ戻せる',()=>{
  const lever=stream({rest:500,full:2500})
  expect(lever.tracker.clear()).toEqual(DEFAULT_CALIBRATION)
 })
})

describe('T字グリップの回転（ハンドル）', ()=>{
 const calibration={center:2000,right:3000}
 function settle(tracker:SteerTracker,raw:number){let now=1000;for(let i=0;i<60;i++){now+=10;tracker.feed(raw,now)}return tracker.value}
 it('まっすぐで0、右いっぱいで+1、左いっぱいで-1になる',()=>{
  expect(settle(new SteerTracker({...calibration}),2000)).toBeCloseTo(0,3)
  expect(settle(new SteerTracker({...calibration}),3000)).toBeGreaterThan(.98)
  expect(settle(new SteerTracker({...calibration}),1000)).toBeLessThan(-.98)
 })
 it('まっすぐ付近の小さなぶれは0として扱う',()=>{
  expect(settle(new SteerTracker({...calibration}),2030)).toBe(0)
 })
 it('配線の向きが逆（右に回すと値が下がる）でも、右がプラスになる',()=>{
  expect(settle(new SteerTracker({center:3000,right:2000}),2000)).toBeGreaterThan(.98)
 })
 it('登録前は向きを決めない',()=>{
  const tracker=new SteerTracker({...DEFAULT_STEER})
  expect(settle(tracker,4000)).toBe(0)
  expect(tracker.ready).toBe(false)
 })
 it('右に回すと右へ、左に回すと左へ最大60°曲がる',()=>{
  const base={x:0,z:1}
  const right=steerDirection(base,1),left=steerDirection(base,-1)
  expect(right.x).toBeCloseTo(-Math.sin(Math.PI/3),5)
  expect(left.x).toBeCloseTo(Math.sin(Math.PI/3),5)
  expect(right.z).toBeCloseTo(.5,5)
  expect(steerDirection(base,0).x).toBeCloseTo(0,5)
 })
})
