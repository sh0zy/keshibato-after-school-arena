import { BODIES, PARTS } from './catalog'
import type { AssemblyStats, Build, Equipment, Quat, ShapeSpec, Socket, Vec3 } from './types'

export const SOCKETS: Socket[] = ['front','back','left','right','top_left','top_right']
export const ZERO: Vec3 = {x:0,y:0,z:0}
export const IDENTITY: Quat = {x:0,y:0,z:0,w:1}
export const bodyDef = (id:string) => { const def=BODIES.find(b=>b.id===id); if(!def) throw new Error('本体が見つかりません。'); return def }
export const partDef = (id:string) => { const def=PARTS.find(p=>p.id===id); if(!def) throw new Error('装備パーツが見つかりません。'); return def }
export function rotate(v:Vec3,q:Quat):Vec3 { const tx=2*(q.y*v.z-q.z*v.y),ty=2*(q.z*v.x-q.x*v.z),tz=2*(q.x*v.y-q.y*v.x); return {x:v.x+q.w*tx+q.y*tz-q.z*ty,y:v.y+q.w*ty+q.z*tx-q.x*tz,z:v.z+q.w*tz+q.x*ty-q.y*tx} }
export function multiply(a:Quat,b:Quat):Quat { return {x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z} }
export const add = (a:Vec3,b:Vec3):Vec3 => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z})
export const scale = (a:Vec3,n:number):Vec3 => ({x:a.x*n,y:a.y*n,z:a.z*n})
export const yaw = (r:number):Quat => ({x:0,y:Math.sin(r/2),z:0,w:Math.cos(r/2)})

export function shapePoints(shape:ShapeSpec):Vec3[] {
  const raw:Vec3[]=[]
  if(shape.kind==='hull'&&shape.points) for(let i=0;i<shape.points.length;i+=3) raw.push({x:shape.points[i],y:shape.points[i+1],z:shape.points[i+2]})
  else for(const x of [-1,1]) for(const y of [-1,1]) for(const z of [-1,1]) raw.push({x:x*shape.size.x/2,y:y*shape.size.y/2,z:z*shape.size.z/2})
  return raw.map(p=>add(rotate(p,shape.rotation??IDENTITY),shape.position))
}

/** One shared mounting transform for visible models and physical colliders. */
export function getEquipmentTransform(build:Build,equipment:Equipment):{position:Vec3;rotation:Quat} {
  const body=bodyDef(build.body), part=partDef(equipment.id)
  const angle={front:0,back:Math.PI,left:-Math.PI/2,right:Math.PI/2,top_left:0,top_right:0}[equipment.socket]+equipment.rotation*Math.PI/180
  const rotation=yaw(angle)
  const points=part.shapes.flatMap(shapePoints).map(p=>rotate(p,rotation))
  const min=(key:'x'|'y'|'z')=>Math.min(...points.map(p=>p[key]))
  const max=(key:'x'|'y'|'z')=>Math.max(...points.map(p=>p[key]))
  const position:Vec3={x:0,y:Math.max(0,-body.size.y/2-min('y')+.035),z:0}
  // Rotations retain a visible, floor-clearing mount: the innermost face rests on the chosen socket.
  if(equipment.socket==='front') position.z=body.size.z/2-min('z')+.015
  if(equipment.socket==='back') position.z=-body.size.z/2-max('z')-.015
  if(equipment.socket==='left') position.x=-body.size.x/2-max('x')-.015
  if(equipment.socket==='right') position.x=body.size.x/2-min('x')+.015
  if(equipment.socket.startsWith('top_')) { position.x=body.size.x*(equipment.socket==='top_left'?-.26:.26); position.y=body.size.y/2-min('y')+.025; position.z=-(min('z')+max('z'))/2 }
  return {position,rotation}
}

export function getEquipmentShapes(build:Build,equipment:Equipment):ShapeSpec[] {
  const transform=getEquipmentTransform(build,equipment)
  return partDef(equipment.id).shapes.map(s=>({...s,position:add(transform.position,rotate(s.position,transform.rotation)),rotation:multiply(transform.rotation,s.rotation??IDENTITY)}))
}
export function shapeVolume(s:ShapeSpec):number { return Math.max(.0001,s.size.x*s.size.y*s.size.z*(s.kind==='ball'?Math.PI/6:s.kind==='cylinder'?Math.PI/4:1)) }

export function validateBuild(value:unknown):Build {
  if(!value||typeof value!=='object') throw new Error('機体データの形式が正しくありません。')
  const b=value as Build
  bodyDef(b.body)
  if(!Array.isArray(b.equipment)||b.equipment.length>2) throw new Error('装備できるパーツは合計2個までです。交換するパーツを選んでください。')
  const occupied=new Set<Socket>()
  for(const eq of b.equipment) {
    if(!eq||typeof eq!=='object') throw new Error('装備データの形式が正しくありません。')
    const p=partDef(eq.id)
    if(!SOCKETS.includes(eq.socket)||!p.sockets.includes(eq.socket)) throw new Error('この位置には取り付けられません。前・後・左右・上面から選んでください。')
    if(![0,90,180,270].includes(eq.rotation)) throw new Error('パーツの向きは0・90・180・270度から選んでください。')
    if(occupied.has(eq.socket)) throw new Error('同じ取り付け位置には重ねられません。空いている位置を選んでください。')
    occupied.add(eq.socket)
  }
  if(b.equipment.length===2) {
    const bounds=b.equipment.map(e=>{const p=getEquipmentShapes(b,e).flatMap(shapePoints);return {min:{x:Math.min(...p.map(v=>v.x)),y:Math.min(...p.map(v=>v.y)),z:Math.min(...p.map(v=>v.z))},max:{x:Math.max(...p.map(v=>v.x)),y:Math.max(...p.map(v=>v.y)),z:Math.max(...p.map(v=>v.z))}}})
    const overlaps=(['x','y','z'] as const).map(k=>Math.min(bounds[0].max[k],bounds[1].max[k])-Math.max(bounds[0].min[k],bounds[1].min[k]))
    if(overlaps.every(v=>v>.13)) throw new Error('パーツ同士が大きく重なっています。前と後など、離れた位置を選んでください。')
  }
  for(const key of ['color','sleeve'] as const) if(typeof b[key]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(b[key])) throw new Error('色は不透明な6桁のカラーコードで指定してください。')
  if(typeof b.name!=='string'||b.name.length>30) throw new Error('機体名は30文字以内で入力してください。')
  if(typeof b.face!=='string'||typeof b.pattern!=='string') throw new Error('ステッカーのデータが正しくありません。')
  return structuredClone(b)
}

export function getAssemblyStats(build:Build):AssemblyStats {
  const body=bodyDef(build.body)
  let mass=body.mass,center:Vec3={...ZERO},friction=body.friction,restitution=body.restitution
  const points:Vec3[]=[]
  for(const x of [-1,1]) for(const z of [-1,1]) points.push({x:x*body.size.x/2,y:0,z:z*body.size.z/2})
  for(const eq of build.equipment) {
    const part=partDef(eq.id),shapes=getEquipmentShapes(build,eq),totalVolume=shapes.reduce((n,s)=>n+shapeVolume(s),0)
    mass+=part.mass
    for(const s of shapes) { center=add(center,scale(s.position,part.mass*shapeVolume(s)/totalVolume)); points.push(...shapePoints(s)) }
    if(part.passive==='slide'&&!eq.socket.startsWith('top_')) friction=Math.min(friction,part.friction)
    restitution=Math.max(restitution,part.restitution)
  }
  return {mass,center:scale(center,1/mass),width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),length:Math.max(...points.map(p=>p.z))-Math.min(...points.map(p=>p.z)),friction,restitution}
}
