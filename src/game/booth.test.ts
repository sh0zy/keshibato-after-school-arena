import { describe, expect, it } from 'vitest'
import { boothImageUrl, boothPlayer, readBoothStart } from './booth'
import type { BoothPlayer } from './booth'

// ブースからの postMessage は外からの入口なので、受け入れる条件をここで固めておく。
const ORIGIN='https://moffy-booth.vercel.app'
const BASE=`${ORIGIN}/keshibato-game/index.html?booth`
const parent={}      // window.parent のかわり
const players=():BoothPlayer[]=>[{name:'1-023 ほしぞら',image:'/moffy/1-023.png'},{name:'1-024 こもれび',image:'/moffy/1-024.png'}]
const message=(over:Record<string,unknown>={})=>({origin:ORIGIN,source:parent,data:{type:'moffy-booth:start',players:players(),versus:'cpu',...over}})

describe('ブースからの合図を受け入れる条件',()=>{
 it('同じオリジンの親フレームからの正しい合図だけを受け取る',()=>{
  const start=readBoothStart(message(),ORIGIN,parent)
  expect(start?.type).toBe('moffy-booth:start')
  expect(start?.players).toHaveLength(2)
  expect(start?.players[0].name).toBe('1-023 ほしぞら')
 })
 it('ちがうオリジンからの合図は受け取らない',()=>{
  expect(readBoothStart({...message(),origin:'https://evil.example.com'},ORIGIN,parent)).toBeNull()
  expect(readBoothStart({...message(),origin:`${ORIGIN}.evil.com`},ORIGIN,parent)).toBeNull()
  expect(readBoothStart({...message(),origin:'null'},ORIGIN,parent)).toBeNull()
 })
 it('親フレーム以外からの合図は受け取らない',()=>{
  expect(readBoothStart({...message(),source:{}},ORIGIN,parent)).toBeNull()
  expect(readBoothStart({...message(),source:undefined},ORIGIN,parent)).toBeNull()
 })
 it('埋め込まれていない（親がいない）ときは、何も受け取らない',()=>{
  expect(readBoothStart({...message(),source:null},ORIGIN,null)).toBeNull()
  expect(readBoothStart({...message(),source:undefined},ORIGIN,undefined)).toBeNull()
 })
 it('形が合わない合図は受け取らない',()=>{
  expect(readBoothStart({...message(),data:{type:'moffy-booth:result'}},ORIGIN,parent)).toBeNull()
  expect(readBoothStart({...message(),data:null},ORIGIN,parent)).toBeNull()
  expect(readBoothStart({...message(),data:'moffy-booth:start'},ORIGIN,parent)).toBeNull()
  expect(readBoothStart(message({players:[players()[0]]}),ORIGIN,parent)).toBeNull()
  expect(readBoothStart(message({players:[...players(),players()[0]]}),ORIGIN,parent)).toBeNull()
  expect(readBoothStart(message({players:'ふたり'}),ORIGIN,parent)).toBeNull()
 })
 it('画像の指定がない相手がいる合図は受け取らない',()=>{
  expect(readBoothStart(message({players:[players()[0],{name:'なまえだけ'}]}),ORIGIN,parent)).toBeNull()
  expect(readBoothStart(message({players:[players()[0],{name:'x',image:''}]}),ORIGIN,parent)).toBeNull()
  expect(readBoothStart(message({players:[players()[0],null]}),ORIGIN,parent)).toBeNull()
 })
 it('知らない対戦相手の指定は、CPU戦として扱う',()=>{
  expect(readBoothStart(message({versus:'human'}),ORIGIN,parent)?.versus).toBe('human')
  expect(readBoothStart(message({versus:'cpu'}),ORIGIN,parent)?.versus).toBe('cpu')
  expect(readBoothStart(message({versus:'なにか'}),ORIGIN,parent)?.versus).toBe('cpu')
  expect(readBoothStart(message({versus:undefined}),ORIGIN,parent)?.versus).toBe('cpu')
 })
})

describe('名前が無くても対戦を始められる',()=>{
 it('名前が空でも、代わりの名前が付く',()=>{
  for(const name of ['','   ','\n'])expect(boothPlayer({name,image:'/a.png'}).name).toBe('モッフィー')
 })
 it('名前が文字列でなくても、落ちずに代わりの名前が付く',()=>{
  for(const name of [undefined,null,42,{}])expect(boothPlayer({name,image:'/a.png'} as unknown as BoothPlayer).name).toBe('モッフィー')
 })
 it('長い名前は24文字に収める',()=>{
  expect(boothPlayer({name:'あ'.repeat(60),image:'/a.png'}).name).toHaveLength(24)
 })
 it('ふつうの名前は前後の空白だけ落としてそのまま使う',()=>{
  expect(boothPlayer({name:'  1-023 ほしぞら  ',image:'/a.png'}).name).toBe('1-023 ほしぞら')
 })
 it('合図を受け取る時点で名前が整うので、空の名前のまま対戦に渡らない',()=>{
  const start=readBoothStart(message({players:[{name:'',image:'/a.png'},{name:'   ',image:'/b.png'}]}),ORIGIN,parent)
  expect(start?.players.map(p=>p.name)).toEqual(['モッフィー','モッフィー'])
 })
})

describe('画像を取りに行ってよい先',()=>{
 it('同じオリジンの画像は受け付ける',()=>{
  expect(boothImageUrl('/moffy/1-023.png',BASE,ORIGIN).href).toBe(`${ORIGIN}/moffy/1-023.png`)
  expect(boothImageUrl('1-023.png',BASE,ORIGIN).origin).toBe(ORIGIN)
  expect(boothImageUrl(`${ORIGIN}/moffy/1-023.png`,BASE,ORIGIN).origin).toBe(ORIGIN)
 })
 it('よそのドメインの画像は取りに行かない',()=>{
  for(const image of ['https://evil.example.com/x.png','//evil.example.com/x.png',`${ORIGIN}.evil.com/x.png`,'http://moffy-booth.vercel.app/x.png'])
   expect(()=>boothImageUrl(image,BASE,ORIGIN)).toThrow('読み込めませんでした')
 })
 it('データURLや javascript: は受け付けない',()=>{
  for(const image of ['data:image/png;base64,iVBORw0KGgo=','javascript:alert(1)','blob:https://evil.example.com/abc'])
   expect(()=>boothImageUrl(image,BASE,ORIGIN)).toThrow('読み込めませんでした')
 })
 it('画像の指定がないときは、その理由を返す',()=>{
  for(const image of ['',undefined,null,42])expect(()=>boothImageUrl(image,BASE,ORIGIN)).toThrow('指定されていません')
 })
})
