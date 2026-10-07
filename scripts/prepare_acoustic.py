#!/usr/bin/env python3
"""Create the web subset from the original Salamander Drumkit WAVs (stdlib only)."""
import array
import hashlib
import json
import math
from pathlib import Path
import sys
import wave

SOURCE = Path(sys.argv[1])
DEST = Path(__file__).resolve().parents[1] / 'assets/audio/salamander-v1'
DEST.mkdir(parents=True, exist_ok=True)
GROUPS = [
    ('kick', 'kick_OH_F', 2, .55, .7),
    ('snare', 'snare_OH_F', 3, .55, 1.0),
    ('snare-soft', 'snare_OH_Ghost', 3, .04, .7),
    ('hat', 'hihatClosed_OH_F', 2, .18, .4),
    ('open-hat', 'hihatOpen_OH_F', 2, .24, 2.0),
    ('tom-high', 'hiTom_OH_F', 2, .4, 1.8),
    ('tom-low', 'loTom_OH_MP', 2, .4, 1.8),
    ('ride', 'ride1_OH_MP', 2, .22, 4.0),
    ('crash', 'crash1_OH_FF', 2, .32, 5.0),
]
manifest = {'title':'Salamander Drumkit — Ritmika web subset', 'author':'Alexander Holm',
    'license':'CC BY-SA 3.0', 'licenseURL':'https://creativecommons.org/licenses/by-sa/3.0/',
    'source':'https://archive.org/details/SalamanderDrumkit',
    'changes':'Mono PCM16; leading silence removed; tails trimmed and faded; gain balanced by instrument and snare layer. Original pitch and sample rate preserved.', 'files':[]}
for name, original, count, target, limit in GROUPS:
    recordings=[]
    for index in range(1,count+1):
        file=SOURCE / 'OH' / f'{original}_{index}.wav'
        with wave.open(str(file),'rb') as audio:
            rate=audio.getframerate();width=audio.getsampwidth();channels=audio.getnchannels()
            assert width in (2,3,4) and audio.getcomptype()=='NONE'
            raw=audio.readframes(audio.getnframes())
        scale=2**(width*8-1)
        values=[int.from_bytes(raw[i:i+width],'little',signed=True)/scale for i in range(0,len(raw),width)]
        mono=[sum(values[i:i+channels])/channels for i in range(0,len(values),channels)]
        dc=sum(mono)/len(mono);mono=[x-dc for x in mono]
        peak=max(map(abs,mono));assert peak>.0001
        first=next(i for i,x in enumerate(mono) if abs(x)>peak*.008)
        start=max(0,first-round(rate*.0005))
        last=len(mono)-next(i for i,x in enumerate(reversed(mono)) if abs(x)>peak*.001)
        end=min(len(mono),last+round(rate*.025),start+round(rate*limit))
        samples=mono[start:end]
        recordings.append((index,file,rate,start,end,samples))
    gain=target/max(abs(x) for *_,samples in recordings for x in samples)
    for index,file,rate,start,end,samples in recordings:
        fade_in=max(1,round(rate*.00015));fade_out=round(rate*(.06 if name in ('ride','crash','open-hat') else .02))
        out=array.array('h',(round(max(-1,min(1,x*gain*min(1,i/fade_in,(len(samples)-1-i)/fade_out)))*32767) for i,x in enumerate(samples)))
        if sys.byteorder!='little':out.byteswap()
        dest=DEST/f'{name}-{index}.wav'
        with wave.open(str(dest),'wb') as audio:
            audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(rate);audio.writeframes(out.tobytes())
        manifest['files'].append({'file':dest.name,'source':'OH/'+file.name,'sourceSHA256':hashlib.sha256(file.read_bytes()).hexdigest(),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'sampleRate':rate,'startFrame':start,'endFrame':end,'gain':round(gain,8),'seconds':round(len(samples)/rate,4),'bytes':dest.stat().st_size})
        print(f'{dest.name}: {len(samples)/rate:.2f}s, trim {start/rate*1000:.1f}ms, peak {max(map(abs,out))/32768:.3f}')
manifest['totalBytes']=sum(file['bytes'] for file in manifest['files'])
(DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f"Total: {len(manifest['files'])} recordings, {manifest['totalBytes']/1000000:.2f} MB")
