import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BODIES, PARTS } from './catalog'
import { getEquipmentTransform } from './equipment'
import type { BattleConfig, BattleView, Build, GameEvent, Quat, Settings, Shot, StageDef, Vec3 } from './types'

const loader=new GLTFLoader()
const assets=new Map<string,Promise<THREE.Group>>()
const MODEL_SCALE=50
async function asset(path:string):Promise<THREE.Group>{
 if(!assets.has(path))assets.set(path,loader.loadAsync(path).then(g=>g.scene).catch(error=>{assets.delete(path);throw new Error(`モデルを読み込めませんでした：${path} (${String(error)})`)}))
 const model=(await assets.get(path)!).clone(true)
 model.traverse(child=>{if(child instanceof THREE.Mesh){child.castShadow=true;child.receiveShadow=true;child.material=Array.isArray(child.material)?child.material.map(m=>m.clone()):child.material.clone()}})
 return model
}
function destroy(root:THREE.Object3D){root.traverse(o=>{if(o instanceof THREE.Mesh){for(const material of Array.isArray(o.material)?o.material:[o.material]){if(material.userData.generated&&'map'in material)(material as THREE.MeshBasicMaterial).map?.dispose();material.dispose()}if(o.userData.generated)o.geometry.dispose()}if(o instanceof THREE.Line&&o.userData.generated){o.geometry.dispose();(o.material as THREE.Material).dispose()}});root.removeFromParent()}
function generatedMesh(geometry:THREE.BufferGeometry,material:THREE.Material){const mesh=new THREE.Mesh(geometry,material);mesh.userData.generated=true;mesh.receiveShadow=true;return mesh}
function ring(radius:number,color:number,opacity=.4){const mesh=generatedMesh(new THREE.RingGeometry(radius-.018,radius,100),new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;return mesh}
function labelTexture(build:Build){const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext('2d')!;ctx.clearRect(0,0,512,512);ctx.fillStyle='#fffef6';ctx.textAlign='center';ctx.font='900 64px sans-serif';ctx.fillText('HŌKAGO',256,145);ctx.font='500 21px sans-serif';ctx.fillText('YOUR LITTLE CHAMPION',256,183);ctx.lineWidth=9;ctx.strokeStyle='#fffef6';ctx.lineCap='round';if(build.face!=='none'){for(const x of [202,310]){if(build.face==='happy'){ctx.beginPath();ctx.arc(x,264,17,Math.PI,0);ctx.stroke()}else{ctx.beginPath();ctx.ellipse(x,260,9,18,0,0,Math.PI*2);ctx.fill()}}ctx.beginPath();if(build.face==='cool'){ctx.moveTo(230,310);ctx.lineTo(280,310)}else ctx.arc(256,294,24,0,Math.PI);ctx.stroke()}ctx.font='bold 25px sans-serif';ctx.fillText(build.name.slice(0,12),256,407);if(build.pattern==='dots'){ctx.globalAlpha=.3;for(let x=20;x<500;x+=48)for(let y=20;y<500;y+=48){if(x>145&&x<365&&y>100&&y<430)continue;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill()}}if(build.pattern==='stripes'){ctx.globalAlpha=.2;ctx.lineWidth=14;for(let y=-200;y<600;y+=55){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(512,y+400);ctx.stroke()}}const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture}

export async function createAssembly(build:Build):Promise<THREE.Group>{
 const body=BODIES.find(b=>b.id===build.body)!
 const group=new THREE.Group()
 const [bodyModel,...parts]=await Promise.all([asset(body.model),...build.equipment.map(e=>asset(PARTS.find(p=>p.id===e.id)!.model))])
 bodyModel.scale.setScalar(MODEL_SCALE)
 bodyModel.traverse(child=>{if(child instanceof THREE.Mesh)for(const material of Array.isArray(child.material)?child.material:[child.material]){if(material instanceof THREE.MeshStandardMaterial){if(/sleeve/i.test(material.name))material.color.set(build.sleeve);if(/rubber|eraser_body/i.test(material.name))material.color.set(build.color)}}})
 group.add(bodyModel)
 const decalMaterial=new THREE.MeshBasicMaterial({map:labelTexture(build),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});decalMaterial.userData.generated=true
 const decal=generatedMesh(new THREE.PlaneGeometry(body.size.x*.88,body.size.z*.59),decalMaterial);decal.rotation.x=-Math.PI/2;decal.position.y=body.size.y/2+.023;group.add(decal)
 parts.forEach((part,i)=>{const mount=getEquipmentTransform(build,build.equipment[i]);const wrapper=new THREE.Group();wrapper.position.set(mount.position.x,mount.position.y,mount.position.z);wrapper.quaternion.set(mount.rotation.x,mount.rotation.y,mount.rotation.z,mount.rotation.w);part.scale.setScalar(MODEL_SCALE);wrapper.add(part);wrapper.name=`equipment_${i}`;group.add(wrapper)})
 return group
}

export class GameScene {
 readonly renderer:THREE.WebGLRenderer
 readonly scene=new THREE.Scene()
 readonly camera=new THREE.PerspectiveCamera(36,1,.1,220)
 readonly controls:OrbitControls
 readonly content=new THREE.Group()
 readonly aim=new THREE.Group()
 readonly floor=new THREE.Group()
 private actors:THREE.Group[]=[]
 private markers:THREE.Mesh[]=[]
 private objects=new Map<string,THREE.Object3D>()
 private areas=new THREE.Group()
 private areaKey=''
 private light:THREE.DirectionalLight
 private resizeObserver:ResizeObserver
 private frame=0
 private disposed=false
 private serial=0
 private particles:{mesh:THREE.Mesh;velocity:THREE.Vector3;life:number}[]=[]
 private preview=false
 private aimVector:THREE.ArrowHelper|null=null
 private stage:StageDef|null=null
 cameraMode=false
 settings:Settings
 onFrame:((delta:number)=>void)|null=null
 constructor(private element:HTMLElement,settings:Settings){
  this.settings=settings
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'})
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='low'?1:1.7));this.renderer.shadowMap.enabled=settings.quality==='high';this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3
  this.renderer.domElement.setAttribute('aria-label','消しゴムと装備の3D表示');this.renderer.domElement.setAttribute('role','img');element.appendChild(this.renderer.domElement)
  this.scene.add(new THREE.HemisphereLight(0xf7fffb,0x9f8d72,3.4));this.light=new THREE.DirectionalLight(0xffefd6,4.5);this.light.position.set(-10,20,9);this.light.castShadow=true;this.light.shadow.mapSize.set(2048,2048);this.light.shadow.camera.left=-22;this.light.shadow.camera.right=22;this.light.shadow.camera.top=22;this.light.shadow.camera.bottom=-22;this.light.shadow.normalBias=.028;this.light.shadow.bias=-.00015;this.light.shadow.camera.far=80;this.light.shadow.radius=3;this.scene.add(this.light)
  const fill=new THREE.DirectionalLight(0xd6f6ff,2);fill.position.set(12,10,-12);this.scene.add(fill)
  this.scene.add(this.content,this.aim,this.floor,this.areas)
  this.camera.position.set(7,6.4,9)
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.minDistance=5;this.controls.maxDistance=58;this.controls.maxPolarAngle=Math.PI*.465;this.controls.enablePan=false;this.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE}
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(element);this.resize()
  let last=performance.now();const render=(now:number)=>{if(this.disposed)return;const dt=Math.min((now-last)/1000,.05);last=now;this.onFrame?.(dt);this.controls.update();this.animateParticles(dt);this.renderer.render(this.scene,this.camera);this.frame=requestAnimationFrame(render)};this.frame=requestAnimationFrame(render)
 }
 private resize(){const width=this.element.clientWidth,height=this.element.clientHeight;if(!width||!height)return;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false)}
 private clear(){for(const child of [...this.content.children])destroy(child);for(const child of [...this.floor.children])destroy(child);for(const child of [...this.areas.children])destroy(child);this.areaKey='';this.actors=[];this.markers=[];this.objects.clear();this.clearAim()}
 async showBuild(build:Build){const id=++this.serial;const assembly=await createAssembly(build);if(this.disposed||id!==this.serial){destroy(assembly);return}this.clear();this.preview=true;this.stage=null;this.content.add(assembly);this.actors=[assembly];const d=BODIES.find(b=>b.id===build.body)!;assembly.position.y=d.size.y/2+.075
  const pedestal=generatedMesh(new THREE.CylinderGeometry(3.7,3.7,.12,100),new THREE.MeshStandardMaterial({color:0xf7faf5,roughness:.9}));pedestal.position.y=-.01;pedestal.receiveShadow=true;this.floor.add(pedestal)
  for(const radius of [3.95,4.4,4.9]){const r=ring(radius,0x77aa96,.15);r.position.y=-.065;this.floor.add(r)}
  this.controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;this.controls.touches.ONE=THREE.TOUCH.ROTATE;this.controls.target.set(0,.25,0);this.controls.minDistance=5;this.controls.maxDistance=15;this.camera.position.set(7.7,6.8,8.8);this.camera.lookAt(this.controls.target)
 }
 async showBattle(config:BattleConfig){const id=++this.serial;const assemblies=await Promise.all(config.players.map(p=>createAssembly(p.build)));const props=await Promise.all(config.stage.objects.map(o=>asset(`/models/prop_${({ruler:'ruler_wall',mat:'mat',case:'case'} as Record<string,string>)[o.kind]??o.kind}.glb`)));if(this.disposed||id!==this.serial){assemblies.forEach(destroy);props.forEach(destroy);return}this.clear();this.preview=false;this.stage=config.stage;this.actors=assemblies;this.content.add(...assemblies)
  for(let i=0;i<props.length;i++){const o=config.stage.objects[i],prop=props[i],box=new THREE.Box3().setFromObject(prop),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());prop.position.sub(center);const wrapper=new THREE.Group();wrapper.add(prop);wrapper.scale.set(o.size.x/(size.x||1),o.size.y/(size.y||1),o.size.z/(size.z||1));const outer=new THREE.Group();outer.add(wrapper);outer.position.set(o.position.x,o.position.y,o.position.z);outer.rotation.set(o.tilt??0,o.rotation??0,0);this.content.add(outer);this.objects.set(o.id,outer)}
  const ground=generatedMesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:config.stage.night?0x222d35:0xe0e6dc,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-8.3;ground.receiveShadow=true;this.floor.add(ground)
  this.scene.fog=new THREE.Fog(config.stage.night?0x24353c:0xe9eee5,65,130)
  config.players.forEach((p,i)=>{const marker=ring(1.7,p.team===0?0x36b492:0xe9a15d,.7);marker.position.y=.028;this.markers.push(marker);this.floor.add(marker)})
  this.light.intensity=config.stage.night?3.5:4.5;this.controls.target.set(0,0,0);this.controls.minDistance=16;this.controls.maxDistance=60;this.camera.position.set(23,26,29);if(this.element.clientWidth<650)this.camera.position.multiplyScalar(1.18);this.controls.update();this.setCameraMode(false)
 }
 update(view:BattleView){view.actors.forEach((a,i)=>{const mesh=this.actors[i];if(!mesh)return;mesh.position.set(a.position.x,a.position.y,a.position.z);mesh.quaternion.set(a.rotation.x,a.rotation.y,a.rotation.z,a.rotation.w);mesh.visible=!a.fallen||a.position.y>-15;const marker=this.markers[i];if(marker){marker.position.set(a.position.x,.03,a.position.z);marker.visible=!a.fallen&&view.currentPlayer===i&&view.phase!=='result'}})
  const key=JSON.stringify(view.areas);if(key!==this.areaKey){this.areaKey=key;for(const child of [...this.areas.children])destroy(child);view.areas.forEach(area=>{const mesh=generatedMesh(new THREE.CircleGeometry(area.radius,48),new THREE.MeshBasicMaterial({color:area.kind==='chalk'?0xfdf3c5:0xe7b4e0,transparent:true,opacity:.52,depthWrite:false}));mesh.position.set(area.position.x,area.position.y+.013,area.position.z);mesh.rotation.x=-Math.PI/2;this.areas.add(mesh)})}
 }
 updateObjects(objects:{id:string;position:Vec3;rotation:Quat}[]){objects.forEach(o=>{const mesh=this.objects.get(o.id);if(mesh){mesh.position.set(o.position.x,o.position.y,o.position.z);mesh.quaternion.set(o.rotation.x,o.rotation.y,o.rotation.z,o.rotation.w)}})}
 setCameraMode(enabled:boolean){this.cameraMode=enabled;if(this.preview)return;this.controls.mouseButtons.LEFT=enabled?THREE.MOUSE.ROTATE:-1 as THREE.MOUSE;this.controls.touches.ONE=enabled?THREE.TOUCH.ROTATE:-1 as THREE.TOUCH;this.controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE}
 cameraView(view:'front'|'side'|'top'|'iso'){const target=this.controls.target;const distance=this.preview?11:42;const pos=view==='top'?new THREE.Vector3(.01,distance,.01):view==='front'?new THREE.Vector3(0,distance*.35,distance):view==='side'?new THREE.Vector3(distance,distance*.4,0):new THREE.Vector3(distance*.66,distance*.72,distance*.8);this.camera.position.copy(pos.add(target));this.controls.update()}
 setAim(shot:Shot|null,position?:Vec3,prediction?:Vec3[]){this.clearAim();if(!shot||!position)return;const origin=new THREE.Vector3(position.x,position.y+.45,position.z);const direction=new THREE.Vector3(shot.direction.x,0,shot.direction.z).normalize();this.aimVector=new THREE.ArrowHelper(direction,origin,1.4+shot.power*4.5,0x27b78b,.6,.36);this.aim.add(this.aimVector);if(prediction&&prediction.length>1){const points=prediction.map(p=>new THREE.Vector3(p.x,p.y+.12,p.z));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0x49b9a0,dashSize:.3,gapSize:.18,transparent:true,opacity:.7}));line.computeLineDistances();line.userData.generated=true;this.aim.add(line)}}
 clearAim(){for(const child of [...this.aim.children]){if(child===this.aimVector){this.aimVector.dispose();child.removeFromParent()}else destroy(child)}this.aimVector=null}
 screenPosition(position:Vec3){const point=new THREE.Vector3(position.x,position.y,position.z).project(this.camera);const rect=this.renderer.domElement.getBoundingClientRect();return {x:rect.left+(point.x+1)/2*rect.width,y:rect.top+(1-point.y)/2*rect.height}}
 groundPoint(x:number,y:number,height=0){const rect=this.renderer.domElement.getBoundingClientRect();const ndc=new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(ndc,this.camera);return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-height),new THREE.Vector3())}
 effect(event:GameEvent){if(!this.settings.particles||!event.position)return;if(!['launch','collision','fall','ability','wall'].includes(event.type))return;const count=event.type==='collision'?8:5;for(let i=0;i<count&&this.particles.length<80;i++){const mesh=generatedMesh(new THREE.BoxGeometry(.07,.025,.14),new THREE.MeshBasicMaterial({color:[0xf5ce6f,0x7ecbb2,0xf7faf4,0xe3a299][i%4]}));mesh.position.set(event.position.x,event.position.y+.3,event.position.z);this.scene.add(mesh);this.particles.push({mesh,velocity:new THREE.Vector3((Math.random()-.5)*3,1+Math.random()*2,(Math.random()-.5)*3),life:.65})}}
 celebrate(){const p=this.actors[0]?.position??new THREE.Vector3();for(let i=0;i<8;i++)this.effect({type:'collision',position:{x:p.x+(Math.random()-.5)*6,y:5+Math.random()*3,z:p.z+(Math.random()-.5)*6}})}
 private animateParticles(dt:number){for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;p.velocity.y-=8*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*3;p.mesh.rotation.z+=dt*2;if(p.life<=0){destroy(p.mesh);this.particles.splice(i,1)}}}
 setSettings(settings:Settings){this.settings=settings;this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='low'?1:1.7));this.renderer.shadowMap.enabled=settings.quality==='high';this.resize()}
 photo(background='paper'){const old=this.scene.background;this.scene.background=new THREE.Color(background==='mint'?0xe4f0e8:background==='night'?0x243c3a:0xf5f2e9);this.renderer.render(this.scene,this.camera);const uri=this.renderer.domElement.toDataURL('image/png');this.scene.background=old;return uri}
 setLight(angle:number){this.light.position.set(Math.cos(angle)*18,20,Math.sin(angle)*18)}
 dispose(){if(this.disposed)return;this.disposed=true;++this.serial;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.controls.dispose();this.clear();this.particles.forEach(p=>destroy(p.mesh));this.renderer.dispose();this.renderer.domElement.remove()}
}
