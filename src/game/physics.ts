import RAPIER from '@dimforge/rapier3d-compat'
import { add, bodyDef, getAssemblyStats, getEquipmentShapes, getEquipmentTransform, IDENTITY, multiply, partDef, rotate, scale, shapeVolume, validateBuild, yaw, ZERO } from './equipment'
import type { ActorState, AssemblyStats, BattleConfig, BattleSnapshot, BattleView, GameEvent, Quat, ShapeSpec, Shot, SurfaceArea, Vec3 } from './types'

export const FIXED_STEP=1/120
// フルパワーで相手（初期配置で約12離れている）へ確実に届き、
// 全力の直撃およそ2〜2.5回で場外へ押し出せる値。
// 上げすぎると一撃で決まり、下げすぎると当たっても出せなくなる。
export const MAX_SHOT_IMPULSE=25
const length=(v:Vec3)=>Math.hypot(v.x,v.y,v.z)
const subtract=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
const copy=(v:Vec3):Vec3=>({x:v.x,y:v.y,z:v.z})
const copyQ=(v:Quat):Quat=>({x:v.x,y:v.y,z:v.z,w:v.w})
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
let ready:Promise<void>|undefined
interface ColliderInfo { actor?:number; equipment?:number; object?:string; friction:number }
interface Actor { body:RAPIER.RigidBody; colliders:RAPIER.Collider[]; fallen:boolean; grounded:boolean }
interface EngineState { phase:BattleView['phase']; priorPhase:BattleView['phase']; activeShot:Shot|null; shooter:number; strikeUsed:boolean; stillSteps:number; elapsedSteps:number; winner:number|null; draw:boolean; grounded:boolean[]; accumulator:number }
type SavedSnapshot=BattleSnapshot & { engine?:EngineState; physics?:number[] }

export async function createPhysics(config:BattleConfig,snapshot?:BattleSnapshot):Promise<PhysicsGame> {
  ready??=RAPIER.init()
  await ready
  return new PhysicsGame(config,snapshot)
}

/** Renderer-independent simulation. Thinking and pause never step the world. */
export class PhysicsGame {
  readonly config:BattleConfig
  world:RAPIER.World
  readonly actors:Actor[]=[]
  private objects=new Map<string,RAPIER.RigidBody>()
  private colliderInfo=new Map<number,ColliderInfo>()
  private queue:RAPIER.EventQueue
  private pending:GameEvent[]=[]
  private phase:BattleView['phase']='aiming'
  private priorPhase:BattleView['phase']='aiming'
  private currentPlayer:number
  private turn=1
  private seed:number
  private areas:SurfaceArea[]=[]
  private winner:number|null=null
  private draw=false
  private activeShot:Shot|null=null
  private shooter=0
  private strikeUsed=false
  private stillSteps=0
  private elapsedSteps=0
  private accumulator=0
  disposed=false

  constructor(config:BattleConfig,snapshot?:BattleSnapshot) {
    if(config.players.length<2||config.players.length>4) throw new Error('参加する機体は2〜4体にしてください。')
    this.config=structuredClone(config)
    this.config.players=this.config.players.map(p=>({...p,build:validateBuild(p.build)}))
    this.currentPlayer=clamp(Math.trunc(config.firstPlayer),0,config.players.length-1)
    this.seed=config.seed>>>0
    this.world=new RAPIER.World({x:0,y:-12,z:0})
    this.world.timestep=FIXED_STEP
    this.world.numSolverIterations=8
    this.queue=new RAPIER.EventQueue(true)
    this.createStage()
    this.createActors()
    // Settle the initial placement once, then freeze indefinitely for the opening aim.
    for(let n=0;n<100;n++) this.world.step()
    this.actors.forEach(a=>{a.body.setLinvel(ZERO,true);a.body.setAngvel(ZERO,true);a.grounded=this.isGrounded(a)})
    this.objects.forEach(b=>{b.setLinvel(ZERO,true);b.setAngvel(ZERO,true)})
    if(snapshot) this.restore(snapshot)
  }

  private createStage() {
    for(const obj of this.config.stage.objects) {
      const q=multiply(yaw(obj.rotation??0),{x:Math.sin((obj.tilt??0)/2),y:0,z:0,w:Math.cos((obj.tilt??0)/2)})
      const desc=(obj.dynamic?RAPIER.RigidBodyDesc.dynamic():RAPIER.RigidBodyDesc.fixed()).setTranslation(obj.position.x,obj.position.y,obj.position.z).setRotation(q)
      if(obj.dynamic) desc.setLinearDamping(.55).setAngularDamping(1.4).setCcdEnabled(true)
      const rb=this.world.createRigidBody(desc)
      this.objects.set(obj.id,rb)
      const shape=obj.kind==='bumper'?RAPIER.ColliderDesc.cylinder(obj.size.y/2,Math.min(obj.size.x,obj.size.z)/2):RAPIER.ColliderDesc.cuboid(obj.size.x/2,obj.size.y/2,obj.size.z/2)
      const friction=obj.friction??.28
      const col=this.world.createCollider(shape.setFriction(friction).setRestitution(obj.kind==='bumper'?.78:obj.kind==='ruler'?.65:.06).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setMass(obj.kind==='seesaw'?5:obj.dynamic?.65:0).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),rb)
      this.colliderInfo.set(col.handle,{object:obj.id,friction})
      if(obj.kind==='seesaw'&&obj.dynamic) {
        const pivot=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(obj.position.x,obj.position.y,obj.position.z))
        const joint=this.world.createImpulseJoint(RAPIER.JointData.revolute(ZERO,ZERO,{x:0,y:0,z:1}),pivot,rb,true) as RAPIER.RevoluteImpulseJoint
        joint.setLimits(-.23,.23)
      }
    }
  }

  private colliderDesc(shape:ShapeSpec):RAPIER.ColliderDesc {
    let desc:RAPIER.ColliderDesc
    if(shape.kind==='ball') desc=RAPIER.ColliderDesc.ball(Math.max(shape.size.x,shape.size.y,shape.size.z)/2)
    else if(shape.kind==='cylinder') desc=RAPIER.ColliderDesc.cylinder(shape.size.y/2,Math.max(shape.size.x,shape.size.z)/2)
    else if(shape.kind==='hull'&&shape.points) desc=RAPIER.ColliderDesc.convexHull(new Float32Array(shape.points))??RAPIER.ColliderDesc.cuboid(shape.size.x/2,shape.size.y/2,shape.size.z/2)
    else desc=RAPIER.ColliderDesc.cuboid(shape.size.x/2,shape.size.y/2,shape.size.z/2)
    return desc.setTranslation(shape.position.x,shape.position.y,shape.position.z).setRotation(shape.rotation??IDENTITY)
  }

  private createActors() {
    this.config.players.forEach((player,index)=>{
      const base=bodyDef(player.build.body),spawn=this.config.stage.spawns[index%this.config.stage.spawns.length]
      const rb=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.x,spawn.y+base.size.y/2+.06,spawn.z).setRotation(yaw(index%2===0?0:Math.PI)).setLinearDamping(.055).setAngularDamping(.25).setCcdEnabled(true).setAdditionalSolverIterations(4))
      let desc:RAPIER.ColliderDesc
      if(base.id==='round') desc=RAPIER.ColliderDesc.roundCylinder(Math.max(.02,base.size.y/2-.06),Math.min(base.size.x,base.size.z)/2-.06,.06)
      else desc=RAPIER.ColliderDesc.roundCuboid(Math.max(.04,base.size.x/2-.065),Math.max(.04,base.size.y/2-.065),Math.max(.04,base.size.z/2-.065),.065)
      const col=this.world.createCollider(desc.setMass(base.mass).setFriction(base.friction).setRestitution(base.restitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),rb)
      const actor:Actor={body:rb,colliders:[col],fallen:false,grounded:true}
      this.colliderInfo.set(col.handle,{actor:index,friction:base.friction})
      player.build.equipment.forEach((equipment,eqIndex)=>{
        const part=partDef(equipment.id),shapes=getEquipmentShapes(player.build,equipment),volume=shapes.reduce((sum,s)=>sum+shapeVolume(s),0)
        shapes.forEach(shape=>{
          const collider=this.world.createCollider(this.colliderDesc(shape).setMass(part.mass*shapeVolume(shape)/volume).setFriction(part.friction).setRestitution(clamp(part.restitution,0,.9)).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),rb)
          actor.colliders.push(collider)
          this.colliderInfo.set(collider.handle,{actor:index,equipment:eqIndex,friction:part.friction})
        })
      })
      this.actors.push(actor)
    })
  }

  getStats(index:number):AssemblyStats { return getAssemblyStats(this.config.players[index].build) }
  getObjectTransforms() { return [...this.objects].map(([id,body])=>({id,position:copy(body.translation()),rotation:copyQ(body.rotation())})) }
  private actorState(a:Actor):ActorState { return {position:copy(a.body.translation()),rotation:copyQ(a.body.rotation()),velocity:copy(a.body.linvel()),angularVelocity:copy(a.body.angvel()),fallen:a.fallen} }
  view():BattleView { return {phase:this.phase,currentPlayer:this.currentPlayer,actors:this.actors.map(a=>this.actorState(a)),areas:structuredClone(this.areas),winner:this.winner,draw:this.draw,turn:this.turn} }

  shoot(input:Shot):boolean {
    if(this.disposed||this.phase!=='aiming'||this.actors[this.currentPlayer].fallen) return false
    const horizontal=Math.hypot(input.direction?.x,input.direction?.z)
    if(!Number.isFinite(horizontal)||horizontal<.001||!Number.isFinite(input.power)||input.power<=0||!Number.isFinite(input.offset)||!Number.isFinite(input.curve)) return false
    const shot:Shot={direction:{x:input.direction.x/horizontal,y:0,z:input.direction.z/horizontal},power:clamp(input.power,.015,1),offset:clamp(input.offset,-1,1),jump:!!input.jump,strike:!!input.strike,magnet:['attract','repel'].includes(input.magnet)?input.magnet:'off',chalk:!!input.chalk,glue:!!input.glue,curve:clamp(input.curve,-1,1)}
    this.activeShot=shot;this.shooter=this.currentPlayer;this.strikeUsed=false;this.stillSteps=0;this.elapsedSteps=0;this.accumulator=0
    const actor=this.actors[this.currentPlayer],build=this.config.players[this.currentPlayer].build,parts=build.equipment.map(e=>partDef(e.id))
    const impulse=MAX_SHOT_IMPULSE*shot.power
    const jump=shot.jump&&parts.some(p=>p.active==='jump')&&actor.grounded
    const vertical=jump?.54:0,forward=Math.sqrt(1-vertical*vertical)
    const force:Vec3={x:shot.direction.x*impulse*forward,y:impulse*vertical,z:shot.direction.z*impulse*forward}
    const base=bodyDef(build.body)
    // Clamp the selected hit to an actual point inside the local eraser body.
    const hitLocal:Vec3={x:shot.offset*base.size.x*.43,y:0,z:0}
    const hit=add(actor.body.translation(),rotate(hitLocal,actor.body.rotation()))
    actor.body.applyImpulseAtPoint(force,hit,true)
    if(jump) this.pending.push({type:'ability',ability:'jump',player:this.currentPlayer,position:copy(actor.body.translation())})
    for(const kind of ['chalk','glue'] as const) if(shot[kind]&&parts.some(p=>p.active===kind)&&actor.grounded) this.placeArea(kind)
    this.phase='simulating'
    this.pending.push({type:'launch',player:this.currentPlayer,position:copy(actor.body.translation()),strength:shot.power})
    return true
  }

  private placeArea(kind:'chalk'|'glue') {
    const player=this.shooter,actor=this.actors[player],build=this.config.players[player].build
    const eq=build.equipment.find(e=>partDef(e.id).active===kind)!
    const p=add(actor.body.translation(),rotate(getEquipmentTransform(build,eq).position,actor.body.rotation()))
    p.y=actor.body.translation().y-bodyDef(build.body).size.y/2+.012
    const own=this.areas.filter(a=>a.owner===player&&a.kind===kind),limit=kind==='chalk'?3:1
    if(own.length>=limit) this.areas.splice(this.areas.indexOf(own[0]),1)
    this.areas.push({owner:player,kind,position:p,radius:kind==='chalk'?1.4:1.05})
    this.pending.push({type:'ability',ability:kind,player,position:copy(p)})
  }

  pause() { if(this.phase!=='paused'&&!this.disposed) {this.priorPhase=this.phase;this.phase='paused'} }
  resume() { if(this.phase==='paused'&&!this.disposed) this.phase=this.priorPhase }

  step(dt:number):GameEvent[] {
    if(this.disposed) return []
    if(this.phase==='simulating'&&Number.isFinite(dt)&&dt>0) {
      this.accumulator+=Math.min(dt,.1)
      while(this.accumulator>=FIXED_STEP&&this.phase==='simulating') {this.accumulator-=FIXED_STEP;this.fixedStep()}
    }
    const events=this.pending;this.pending=[];return events
  }

  private isGrounded(actor:Actor):boolean {
    let grounded=false
    for(const collider of actor.colliders) this.world.contactPairsWith(collider,other=>{
      if(this.colliderInfo.get(other.handle)?.actor!==undefined) return
      this.world.contactPair(collider,other,manifold=>{
        if(manifold.numSolverContacts()>0&&Math.abs(manifold.normal().y)>.45) grounded=true
      })
    })
    return grounded
  }

  private fixedStep() {
    this.elapsedSteps++
    this.actors.forEach(a=>{a.body.resetForces(false);a.body.resetTorques(false)})
    this.applyEffects()
    this.world.step(this.queue)
    this.queue.drainCollisionEvents((h1,h2,started)=>{if(started)this.collision(h1,h2)})
    this.actors.forEach((actor,index)=>{
      if(actor.fallen) return
      const was=actor.grounded;actor.grounded=this.isGrounded(actor)
      if(!was&&actor.grounded&&this.elapsedSteps>4) this.pending.push({type:'land',player:index,position:copy(actor.body.translation()),strength:.3})
      if(actor.body.translation().y<this.config.stage.fallY) {
        actor.fallen=true;actor.body.setEnabled(false)
        this.pending.push({type:'fall',player:index,position:copy(actor.body.translation())})
      }
    })
    let stable=this.elapsedSteps>24
    for(const actor of this.actors) if(!actor.fallen&&(!actor.grounded||length(actor.body.linvel())>.07||length(actor.body.angvel())>.1)) stable=false
    for(const rb of this.objects.values()) if(rb.isDynamic()&&rb.translation().y>this.config.stage.fallY&&(length(rb.linvel())>.06||length(rb.angvel())>.075)) stable=false
    this.stillSteps=stable?this.stillSteps+1:0
    // This is a low-velocity confirmation window, never a deadline on a shot or a match.
    if(this.stillSteps>=42) this.finishShot()
  }

  private applyEffects() {
    this.actors.forEach((actor,index)=>{
      if(actor.fallen) return
      const build=this.config.players[index].build,parts=build.equipment.map(e=>partDef(e.id)),vel=actor.body.linvel(),angular=actor.body.angvel(),p=actor.body.translation()
      const area=this.areas.filter(a=>Math.hypot(p.x-a.position.x,p.z-a.position.z)<a.radius&&Math.abs(p.y-a.position.y)<2).at(-1)
      const slide=build.equipment.some(e=>partDef(e.id).passive==='slide'&&!e.socket.startsWith('top_'))
      actor.colliders.forEach(c=>{const base=this.colliderInfo.get(c.handle)!.friction;c.setFriction(area?(area.kind==='chalk'?.035:.92):slide?Math.min(.075,base):base)})
      if(actor.grounded&&parts.some(part=>part.passive==='brush')) {
        const f=rotate({x:0,y:0,z:1},actor.body.rotation()),side={x:f.z,y:0,z:-f.x},lateral=vel.x*side.x+vel.z*side.z
        actor.body.applyImpulse({x:-side.x*lateral*actor.body.mass()*.045,y:0,z:-side.z*lateral*actor.body.mass()*.045},true)
        actor.body.setAngvel({x:angular.x*.985,y:angular.y*.97,z:angular.z*.985},true)
      }
      if(!actor.grounded&&parts.some(part=>part.passive==='glide')) actor.body.setAngvel({x:angular.x*.978,y:angular.y*.997,z:angular.z*.978},true)
      if(index===this.shooter&&this.activeShot&&actor.grounded&&parts.some(part=>part.active==='curve')&&Math.hypot(vel.x,vel.z)>.2) {
        const curve=this.activeShot.curve,angle=curve*.8*FIXED_STEP,loss=1-Math.abs(curve)*.18*FIXED_STEP
        actor.body.setLinvel({x:(vel.x*Math.cos(angle)+vel.z*Math.sin(angle))*loss,y:vel.y,z:(vel.z*Math.cos(angle)-vel.x*Math.sin(angle))*loss},true)
        actor.body.applyTorqueImpulse({x:0,y:clamp(curve*.012,-.012,.012),z:0},true)
      }
    })
    if(this.activeShot?.magnet!=='off') this.applyMagnet()
  }

  private applyMagnet() {
    const shooter=this.actors[this.shooter],shot=this.activeShot
    if(!shot||shooter.fallen) return
    const build=this.config.players[this.shooter].build,magnets=build.equipment.filter(e=>partDef(e.id).active==='magnet')
    if(!magnets.length) return
    const pairs:{target:Actor;from:Vec3;to:Vec3;distance:number}[]=[]
    for(const equipment of magnets) {
      const from=add(shooter.body.translation(),rotate(add(getEquipmentTransform(build,equipment).position,rotate({x:0,y:0,z:.45},getEquipmentTransform(build,equipment).rotation)),shooter.body.rotation()))
      this.actors.forEach((target,index)=>{
        if(index===this.shooter||target.fallen) return
        const targetBuild=this.config.players[index].build
        const metal=targetBuild.equipment.find(e=>partDef(e.id).metal)
        if(!metal) return
        const to=add(target.body.translation(),rotate(getEquipmentTransform(targetBuild,metal).position,target.body.rotation())),distance=length(subtract(to,from))
        if(distance<.22||distance>4.2) return
        const ray=new RAPIER.Ray(from,scale(subtract(to,from),1/distance))
        let blocked=false
        for(const object of this.objects.values()) for(let j=0;j<object.numColliders();j++) {const hit=object.collider(j).castRay(ray,distance,true);if(hit>=0&&hit<distance-.03)blocked=true}
        if(!blocked)pairs.push({target,from,to,distance})
      })
    }
    for(const pair of pairs) {
      const magnitude=(1-pair.distance/4.2)*3.6/Math.max(1,pairs.length),sign=shot.magnet==='repel'?-1:1,force=scale(subtract(pair.to,pair.from),sign*magnitude/pair.distance)
      shooter.body.addForceAtPoint(force,pair.from,true);pair.target.body.addForceAtPoint(scale(force,-1),pair.to,true)
    }
  }

  private collision(h1:number,h2:number) {
    const a=this.colliderInfo.get(h1),b=this.colliderInfo.get(h2)
    if(!a||!b||a.actor===undefined&&b.actor===undefined) return
    const i=a.actor??b.actor!,j=a.actor!==undefined?b.actor:a.actor,actor=this.actors[i]
    const speed=length(actor.body.linvel())
    if(speed>.35) this.pending.push({type:j!==undefined?'collision':'wall',player:i,other:j,position:copy(actor.body.translation()),strength:clamp(speed/8,.08,1),material:(a.equipment!==undefined?partDef(this.config.players[a.actor!].build.equipment[a.equipment].id).id:b.object)??'rubber'})
    if(this.strikeUsed||!this.activeShot?.strike||j===undefined) return
    let source=a,target=b,sourceHandle=h1,targetHandle=h2
    if(source.actor!==this.shooter) {source=b;target=a;sourceHandle=h2;targetHandle=h1}
    if(source.actor!==this.shooter||target.actor===undefined||source.equipment===undefined) return
    const build=this.config.players[this.shooter].build,eq=build.equipment[source.equipment]
    if(partDef(eq.id).active!=='strike') return
    const rb=this.actors[this.shooter].body,other=this.actors[target.actor].body,forward=rotate(rotate({x:0,y:0,z:1},getEquipmentTransform(build,eq).rotation),rb.rotation()),toward=subtract(other.translation(),rb.translation())
    if((toward.x*forward.x+toward.y*forward.y+toward.z*forward.z)/Math.max(.001,length(toward))<.35) return
    let contact:Vec3|undefined
    this.world.contactPair(this.world.getCollider(sourceHandle),this.world.getCollider(targetHandle),manifold=>{if(manifold.numSolverContacts()>0)contact=copy(manifold.solverContactPoint(0))})
    if(!contact) return
    this.strikeUsed=true
    const impulse=scale(forward,Math.min(2.3,MAX_SHOT_IMPULSE*this.activeShot.power*.19))
    other.applyImpulseAtPoint(impulse,contact,true);rb.applyImpulseAtPoint(scale(impulse,-1),contact,true)
    this.pending.push({type:'ability',ability:'strike',player:this.shooter,other:target.actor,position:contact,strength:.7})
  }

  private finishShot() {
    this.actors.forEach(a=>{a.body.resetForces(false);a.body.resetTorques(false);if(!a.fallen){a.body.setLinvel(ZERO,false);a.body.setAngvel(ZERO,false)}})
    this.objects.forEach(b=>{if(b.isDynamic()){b.setLinvel(ZERO,false);b.setAngvel(ZERO,false)}})
    this.activeShot=null
    const alive=this.actors.map((a,i)=>a.fallen?null:this.config.players[i].team).filter((x):x is number=>x!==null),teams=new Set(alive)
    if(teams.size<=1) {this.phase='result';this.draw=teams.size===0;this.winner=teams.size===1?[...teams][0]:null;this.pending.push({type:'result'});return}
    this.phase='aiming';this.turn++
    do {this.currentPlayer=(this.currentPlayer+1)%this.actors.length} while(this.actors[this.currentPlayer].fallen)
    this.pending.push({type:'turn',player:this.currentPlayer})
  }

  snapshot():BattleSnapshot {
    const snapshot:SavedSnapshot={version:1,config:structuredClone(this.config),actors:this.actors.map(a=>this.actorState(a)),objects:[...this.objects].filter(([,b])=>b.isDynamic()).map(([id,b])=>({id,position:copy(b.translation()),rotation:copyQ(b.rotation()),velocity:copy(b.linvel()),angularVelocity:copy(b.angvel())})),currentPlayer:this.currentPlayer,turn:this.turn,seed:this.seed,areas:structuredClone(this.areas),engine:{phase:this.phase,priorPhase:this.priorPhase,activeShot:structuredClone(this.activeShot),shooter:this.shooter,strikeUsed:this.strikeUsed,stillSteps:this.stillSteps,elapsedSteps:this.elapsedSteps,winner:this.winner,draw:this.draw,grounded:this.actors.map(a=>a.grounded),accumulator:this.accumulator},physics:Array.from(this.world.takeSnapshot())}
    return snapshot
  }

  restore(input:BattleSnapshot) {
    if(this.disposed) throw new Error('終了した対戦は復元できません。')
    const snapshot=input as SavedSnapshot
    if(snapshot.version!==1||snapshot.actors.length!==this.actors.length||snapshot.config.stage.id!==this.config.stage.id) throw new Error('保存データとステージが一致しません。')
    const engine=snapshot.engine
    if(snapshot.physics&&snapshot.physics.length>0) {
      const actorHandles=this.actors.map(a=>({body:a.body.handle,colliders:a.colliders.map(c=>c.handle)})),objectHandles=[...this.objects].map(([id,b])=>({id,handle:b.handle}))
      const restored=RAPIER.World.restoreSnapshot(new Uint8Array(snapshot.physics))
      if(!restored)throw new Error('保存した物理データを読み込めませんでした。')
      this.world.free();this.world=restored
      actorHandles.forEach((handles,i)=>{this.actors[i].body=this.world.getRigidBody(handles.body);this.actors[i].colliders=handles.colliders.map(h=>this.world.getCollider(h))})
      objectHandles.forEach(({id,handle})=>this.objects.set(id,this.world.getRigidBody(handle)))
    }
    snapshot.actors.forEach((state,i)=>{const a=this.actors[i];a.body.setTranslation(state.position,false);a.body.setRotation(state.rotation,false);a.body.setLinvel(state.velocity,false);a.body.setAngvel(state.angularVelocity,false);a.fallen=state.fallen;a.body.setEnabled(!state.fallen);a.grounded=engine?.grounded[i]??this.isGrounded(a)})
    snapshot.objects?.forEach(s=>{const b=this.objects.get(s.id);if(b){b.setTranslation(s.position,false);b.setRotation(s.rotation,false);b.setLinvel(s.velocity,false);b.setAngvel(s.angularVelocity,false)}})
    this.currentPlayer=snapshot.currentPlayer;this.turn=snapshot.turn;this.seed=snapshot.seed;this.areas=structuredClone(snapshot.areas)
    this.phase=engine?.phase??'aiming';this.priorPhase=engine?.priorPhase??'aiming';this.activeShot=engine?.activeShot??null;this.shooter=engine?.shooter??this.currentPlayer;this.strikeUsed=engine?.strikeUsed??false;this.stillSteps=engine?.stillSteps??0;this.elapsedSteps=engine?.elapsedSteps??0;this.winner=engine?.winner??null;this.draw=engine?.draw??false;this.accumulator=engine?.accumulator??0
    this.pending=[];this.queue.clear()
  }

  /** A bounded preview simulation uses the exact same shapes, materials, and shot code. */
  predict(shot:Shot,maxSteps=330):Vec3[] {
    if(this.disposed||this.phase!=='aiming')return []
    const saved=this.snapshot(),index=this.currentPlayer,points:Vec3[]=[]
    try {if(!this.shoot(shot))return [];for(let step=0;step<maxSteps&&this.view().phase==='simulating';step++){this.fixedStep();if(step%10===0)points.push(copy(this.actors[index].body.translation()));if(this.actors[index].fallen)break}return points}
    finally {this.restore(saved)}
  }
  dispose() { if(!this.disposed){this.disposed=true;this.world.free();this.queue.free();this.pending=[]} }
}
