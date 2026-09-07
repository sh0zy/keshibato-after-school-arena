import { Vector3 } from 'three'
import type { GameScene } from './scene'
import type { Shot, Vec3 } from './types'

export function attachInput(scene:GameScene,options:{canAim:()=>boolean;position:()=>Vec3|null;shot:()=>Shot;onAim:(shot:Shot|null)=>void;onShoot:(shot:Shot)=>void}){
 const canvas=scene.renderer.domElement
 let pointer:number|null=null,start:{x:number;y:number}|null=null,draft:Shot|null=null,blocked=false
 const active=new Set<number>()
 function cancel(){pointer=null;start=null;draft=null;options.onAim(null)}
 function down(e:PointerEvent){active.add(e.pointerId);if(active.size>1){blocked=true;cancel();return}if(e.button!==0||scene.cameraMode||!options.canAim())return;const p=options.position();if(!p)return;const screen=scene.screenPosition(p);if(Math.hypot(e.clientX-screen.x,e.clientY-screen.y)>Math.max(65,canvas.clientWidth*.09))return;e.preventDefault();pointer=e.pointerId;start={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)}
 function move(e:PointerEvent){if(e.pointerId!==pointer||!start||blocked||!options.canAim())return;const pos=options.position();if(!pos)return;const a=scene.groundPoint(start.x,start.y,pos.y),b=scene.groundPoint(e.clientX,e.clientY,pos.y);if(!a||!b)return;const vector=new Vector3().subVectors(a,b);vector.y=0;const power=Math.min(1,Math.hypot(e.clientX-start.x,e.clientY-start.y)/Math.min(220,canvas.clientWidth*.38));if(vector.lengthSq()<.0001)return;vector.normalize();draft={...options.shot(),direction:{x:vector.x,y:0,z:vector.z},power};options.onAim(draft)}
 function up(e:PointerEvent){const rect=canvas.getBoundingClientRect();const edge=e.clientX<rect.left+6||e.clientX>rect.right-6||e.clientY<rect.top+6||e.clientY>rect.bottom-6;const fire=e.pointerId===pointer&&!blocked&&!edge&&draft&&draft.power>.035&&options.canAim()?draft:null;active.delete(e.pointerId);if(active.size===0)blocked=false;cancel();if(fire)options.onShoot(fire)}
 function canceled(e:PointerEvent){active.delete(e.pointerId);blocked=active.size>0;cancel()}
 function key(e:KeyboardEvent){if(e.key==='Escape')cancel()}
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',canceled);canvas.addEventListener('lostpointercapture',canceled);window.addEventListener('keydown',key)
 return {cancel,dispose(){canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',canceled);canvas.removeEventListener('lostpointercapture',canceled);window.removeEventListener('keydown',key)}}
}
