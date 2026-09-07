import type { Settings } from './types'
import { DEFAULT_SETTINGS } from './storage'

class AudioManager {
 private context:AudioContext|null=null
 private master:GainNode|null=null
 private musicGain:GainNode|null=null
 private sfxGain:GainNode|null=null
 private ambientGain:GainNode|null=null
 private buffers=new Map<string,Promise<AudioBuffer>>()
 private music:AudioBufferSourceNode|null=null
 private ambient:AudioBufferSourceNode|null=null
 private requested='customize'
 private musicPlaying=''
 private token=0
 private settings=DEFAULT_SETTINGS
 private voices=new Set<AudioBufferSourceNode>()
 async unlock(){if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);this.musicGain=this.context.createGain();this.sfxGain=this.context.createGain();this.ambientGain=this.context.createGain();this.musicGain.connect(this.master);this.sfxGain.connect(this.master);this.ambientGain.connect(this.master);this.setSettings(this.settings)}if(this.context.state==='suspended')await this.context.resume();this.setMusic(this.requested);if(!this.ambient){try{const buffer=await this.buffer('ambient');if(!this.context||this.ambient)return;this.ambient=this.context.createBufferSource();this.ambient.buffer=buffer;this.ambient.loop=true;this.ambient.connect(this.ambientGain!);this.ambient.start()}catch{}}}
 private buffer(id:string){if(!this.buffers.has(id))this.buffers.set(id,fetch(`/audio/${id}.wav`).then(r=>{if(!r.ok)throw new Error(`音声 ${id} を読み込めませんでした`);return r.arrayBuffer()}).then(b=>this.context!.decodeAudioData(b)).catch(e=>{this.buffers.delete(id);throw e}));return this.buffers.get(id)!}
 setMusic(id:string){this.requested=id;if(!this.context||id===this.musicPlaying)return;this.musicPlaying=id;const token=++this.token;this.buffer(id).then(buffer=>{if(!this.context||token!==this.token)return;this.music?.stop();this.music?.disconnect();const source=this.context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(this.musicGain!);source.start();this.music=source}).catch(()=>{this.musicPlaying='';window.dispatchEvent(new CustomEvent('audio-error',{detail:'音楽を読み込めませんでした。設定画面の「音声を再開」から再試行できます。'}))})}
 play(id:string,volume=.6,pan=0){if(!this.context||this.settings.muted||this.voices.size>=20)return;const aliases:Record<string,string>={collision:'rubber',ability:'confirm',result:'win',victory:'win',defeat:'lose'};id=aliases[id]??id;this.buffer(id).then(buffer=>{if(!this.context)return;const source=this.context.createBufferSource();source.buffer=buffer;const gain=this.context.createGain();gain.gain.value=Math.max(0,Math.min(1,volume));const stereo=this.context.createStereoPanner();stereo.pan.value=Math.max(-.65,Math.min(.65,pan));source.connect(gain).connect(stereo).connect(this.sfxGain!);this.voices.add(source);source.onended=()=>{source.disconnect();gain.disconnect();stereo.disconnect();this.voices.delete(source)};source.start()}).catch(()=>{})}
 setSettings(settings:Settings){this.settings=settings;if(!this.context)return;const t=this.context.currentTime;this.master!.gain.setTargetAtTime(settings.muted?0:settings.master,t,.025);this.musicGain!.gain.setTargetAtTime(settings.bgm,t,.025);this.sfxGain!.gain.setTargetAtTime(settings.sfx,t,.025);this.ambientGain!.gain.setTargetAtTime(settings.ambient,t,.025)}
 suspend(){void this.context?.suspend()}
 resume(){void this.unlock()}
 dispose(){++this.token;this.music?.stop();this.ambient?.stop();this.voices.forEach(v=>v.stop());void this.context?.close();this.context=null;this.music=null;this.ambient=null;this.musicPlaying='';this.buffers.clear()}
}
export const audio=new AudioManager()
