import { createPhysics, MAX_SHOT_IMPULSE } from './physics'
import type { PhysicsGame } from './physics'
import { PARTS } from './catalog'
import type { Difficulty, Shot } from './types'

export async function chooseShot(game:PhysicsGame,difficulty:Difficulty):Promise<Shot>{
 const view=game.view(),index=view.currentPlayer,actor=view.actors[index],player=game.config.players[index],targetIndex=view.actors.findIndex((a,i)=>!a.fallen&&game.config.players[i].team!==player.team),target=view.actors[targetIndex]
 const dx=target.position.x-actor.position.x,dz=target.position.z-actor.position.z,distance=Math.hypot(dx,dz),angle=Math.atan2(dx,dz)
 const parts=player.build.equipment.map(e=>PARTS.find(p=>p.id===e.id)!),stats=game.getStats(index)
 let seed=(game.config.seed+view.turn*982451653)>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 const power=Math.min(.98,Math.max(.22,Math.sqrt(2*Math.max(.16,stats.friction)*12*(distance+2))*stats.mass/MAX_SHOT_IMPULSE))
 const make=(a:number,p:number,offset=0,jump=false):Shot=>({direction:{x:Math.sin(a),y:0,z:Math.cos(a)},power:Math.max(.1,Math.min(1,p)),offset,jump,strike:parts.some(p=>p.active==='strike'),magnet:parts.some(p=>p.active==='magnet')?'attract':'off',chalk:parts.some(p=>p.active==='chalk'),glue:false,curve:0})
 if(difficulty==='easy')return make(angle+(random()-.5)*.14,power*(.82+random()*.12))
 const candidates=[make(angle,power),make(angle,power*.72),make(angle,Math.min(1,power*1.12)),make(angle-.17,power),make(angle+.17,power),make(Math.atan2(-actor.position.x,-actor.position.z),.28)]
 if(parts.some(p=>p.active==='jump'))candidates.push(make(angle,power,0,true))
 if(difficulty==='hard'){for(const offset of [-.42,.42])for(const a of [-.3,0,.3])candidates.push(make(angle+a,power,offset));for(const wall of [-7.3,7.3])candidates.push(make(Math.atan2(dx,wall*2-target.position.z-actor.position.z),.9));candidates.push(make(angle-.6,.65),make(angle+.6,.65))}
 const initial=game.snapshot(),simulation=await createPhysics(game.config,initial);let best=candidates[0],bestScore=-Infinity
 try{for(let c=0;c<candidates.length;c++){if(game.disposed)break;simulation.restore(initial);simulation.shoot(candidates[c]);for(let step=0;step<1600&&simulation.view().phase==='simulating';step++)simulation.step(1/120);const result=simulation.view(),own=result.actors[index],enemy=result.actors[targetIndex];const nextDistance=Math.hypot(own.position.x-enemy.position.x,own.position.z-enemy.position.z);const outward=Math.hypot(enemy.position.x,enemy.position.z)-Math.hypot(target.position.x,target.position.z);let score=outward*3+(distance-nextDistance)*.25-Math.hypot(own.position.x,own.position.z)*.15;if(enemy.fallen)score+=150;if(own.fallen)score-=190;if(result.phase==='simulating')score-=3;if(score>bestScore){bestScore=score;best=candidates[c]}if(c%2===1)await new Promise<void>(resolve=>setTimeout(resolve,0))}}finally{simulation.dispose()}
 return best
}
