"""Generate original HOKAGO music and effects. Python + NumPy, no external audio samples."""
from pathlib import Path
import json, wave
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'audio';OUT.mkdir(parents=True,exist_ok=True)
RATE=22050
rng=np.random.default_rng(20260907)
report={}
def write(name,a,loop=False):
    a=np.nan_to_num(a); peak=float(np.max(np.abs(a)))
    if peak>.85:a=a/peak*.85
    if not loop:
        fade=min(len(a)//4,500);a[:fade]*=np.linspace(0,1,fade);a[-fade:]*=np.linspace(1,0,fade)
    # Soft onset/end blend suppresses discontinuities while preserving loop rhythm.
    if loop:
        k=220;a[:k]*=np.linspace(.04,1,k);a[-k:]*=np.linspace(1,.04,k)
    pcm=(a*32767).astype('<i2')
    with wave.open(str(OUT/(name+'.wav')),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(pcm.tobytes())
    report[name]={'seconds':round(len(a)/RATE,3),'peak':round(float(np.max(np.abs(a))),4),'rms':round(float(np.sqrt(np.mean(a*a))),4),'loop':loop,'seam':round(float(abs(a[-1]-a[0])),6)}
def tone(note,length,timbre='wood'):
    t=np.arange(int(RATE*length))/RATE;freq=440*2**((note-69)/12)
    if timbre=='bass':return (np.sin(2*np.pi*freq*t)+.22*np.sin(4*np.pi*freq*t))*np.exp(-t*4)*np.minimum(1,t*70)
    return (np.sin(2*np.pi*freq*t)*np.exp(-t*7)+.25*np.sin(2*np.pi*freq*3*t)*np.exp(-t*15)+.12*np.sin(2*np.pi*freq*4*t)*np.exp(-t*23))*np.minimum(1,t*250)
def insert(track,sound,start,gain):
    indices=(np.arange(len(sound))+int(start*RATE))%len(track);np.add.at(track,indices,sound*gain)
themes={
 'title':(104,0,[0,4,7,9,7,4,2,4,0,7,9,12,11,7,4,2]),
 'customize':(94,5,[0,7,4,2,4,9,7,4,2,5,4,0,7,4,2,0]),
 'classroom':(116,0,[0,4,7,4,9,7,4,2,5,9,7,4,2,4,7,0]),
 'art':(108,7,[0,2,7,4,9,4,7,2,0,5,9,7,4,2,4,0]),
 'library':(82,2,[0,7,4,9,7,4,2,0,5,9,7,4,2,7,4,0]),
 'boss':(122,9,[0,3,7,10,7,3,5,7,0,5,8,12,10,7,5,3]),
 'practice':(88,5,[0,4,7,9,4,2,7,4,5,9,7,2,4,0,2,0]),
 'collection':(80,0,[7,4,0,2,4,7,9,7,5,4,2,0,7,4,2,0])}
for name,(bpm,key,melody) in themes.items():
    beat=60/bpm;duration=32*beat;a=np.zeros(int(RATE*duration))
    for step in range(64):
        start=step*beat/2;bar=step//16;root=[0,5,9,7][bar]
        if step%2==0:insert(a,tone(72+key+melody[(step//2)%16],.65),start,.20)
        if step%8 in [0,4]:insert(a,tone(36+key+root,.7,'bass'),start,.17)
        if step%4==0:
            t=np.arange(int(RATE*.15))/RATE;kick=np.sin(2*np.pi*(68*t-25*t*t))*np.exp(-t*28);insert(a,kick,start,.09)
        if step%8==4:
            noise=rng.standard_normal(int(RATE*.1));noise=np.convolve(noise,[1,-1],mode='same');insert(a,noise*np.exp(-np.arange(len(noise))/RATE*65),start,.018)
        if step%2==1:
            noise=rng.standard_normal(int(RATE*.035));insert(a,noise*np.exp(-np.arange(len(noise))/RATE*160),start,.012)
        if step%16==0:
            for interval in [0,4,7]:insert(a,tone(60+key+root+interval,1.4),start,.045)
    write(name,a,True)
for name,notes in {'win':[72,76,79,84],'lose':[67,65,62,60],'draw':[67,72,67,72],'challenge':[72,79,84,88]}.items():
    a=np.zeros(RATE*2)
    for i,n in enumerate(notes):insert(a,tone(n,.8),i*.22,.35)
    write(name,a)
effects=['select','confirm','back','attach','detach','replace','body','color','save','unlock','aim','launch','slide_rubber','slide_plastic','slide_metal','roll','jump','land','land_heavy','fall','rubber','wood','ruler','metal','paper','bounce','strike','wall','stapler','magnet','glide','chalk','brush','glue','curve','hook','start','turn']
for i,name in enumerate(effects):
    duration=.16 if name in ['select','attach','color','aim'] else .34;t=np.arange(int(RATE*duration))/RATE
    pitch=320+(i%8)*96;noise=rng.standard_normal(len(t));noise=np.convolve(noise,np.ones(5)/5,mode='same')
    if name in ['launch','jump','bounce','fall','magnet']:
        sign=-1 if name=='fall' else 1;freq=pitch*t+sign*500*t*t;a=np.sin(2*np.pi*freq)*np.exp(-t*13)*.24
    elif name in ['slide_rubber','slide_plastic','slide_metal','chalk','brush','glue','curve','paper','roll']:
        a=noise*np.exp(-t*9)*.19+.04*np.sin(2*np.pi*pitch*t)*np.exp(-t*18)
    else:a=np.sin(2*np.pi*pitch*t)*np.exp(-t*28)*.17+noise*np.exp(-t*55)*.25
    write(name,a)
t=np.arange(RATE*12)/RATE;air=rng.standard_normal(len(t));air=np.convolve(air,np.ones(240)/240,mode='same')*.1
for start in [2.2,6.8,9.3]:
    n=np.arange(int(RATE*.2))/RATE;bird=np.sin(2*np.pi*(1800*n+900*n*n))*np.sin(np.pi*n/.2)**2*.025;insert(air,bird,start,1)
write('ambient',air,True)
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
assert all(x['peak']<=.851 for x in report.values())
assert all(x['seam']<.03 for x in report.values() if x['loop'])
print(f'Generated and verified {len(report)} original WAV files, '+str(round(sum(p.stat().st_size for p in OUT.glob('*.wav'))/1024/1024,2))+' MB')
