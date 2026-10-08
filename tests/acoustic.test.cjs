const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),folder=path.join(root,'assets/audio/salamander-v1');
const core=vm.createContext({AbortController,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(path.join(root,'acoustic.js'),'utf8'),core);
vm.runInContext(fs.readFileSync(path.join(root,'melodies.js'),'utf8'),core);
vm.runInContext(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],core);
const {AcousticLibrary,ACOUSTIC_BANKS,RhythmPlayer,KIT_SOUNDS}=vm.runInContext('({AcousticLibrary,ACOUSTIC_BANKS,RhythmPlayer,KIT_SOUNDS})',core);
function decode(bytes){
  const b=Buffer.from(bytes);assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');
  assert.equal(b.readUInt16LE(20),1);assert.equal(b.readUInt16LE(22),1);assert.equal(b.readUInt16LE(34),16);
  const rate=b.readUInt32LE(24),n=b.readUInt32LE(40)/2,data=Float32Array.from({length:n},(_,i)=>b.readInt16LE(44+i*2)/32768);
  return {duration:n/rate,sampleRate:rate,getChannelData:()=>data};
}
const rms=a=>Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length);
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),decoded={};let bytes=0;
assert.equal(manifest.files.length,20);
for(const file of manifest.files){
  const b=fs.readFileSync(path.join(folder,file.file));bytes+=b.length;
  assert.equal(crypto.createHash('sha256').update(b).digest('hex'),file.sha256);
  const buffer=decoded[file.file]=decode(b),data=buffer.getChannelData(0);
  assert.equal(buffer.sampleRate,48000);assert.ok(Math.abs(buffer.duration-file.seconds)<.0001);
  assert.equal(data[0],0);assert.equal(data.at(-1),0);assert.ok(rms(data)>.0001);
  assert.ok(data.every(x=>Number.isFinite(x)&&Math.abs(x)<.6));
}
assert.equal(bytes,manifest.totalBytes);assert.ok(bytes<3.5e6);
const banks=Object.fromEntries(Object.entries(ACOUSTIC_BANKS).map(([id,layers])=>[id,Object.fromEntries(Object.entries(layers).map(([layer,files])=>[layer,files.map(file=>decoded[file])]))]));
for(let i=0;i<3;i++)assert.ok(rms(banks.snare.soft[i].getChannelData(0).slice(0,9600))/rms(banks.snare.hits[i].getChannelData(0).slice(0,9600))<.15,'Ghost strokes remain clearly softer');
const allAcoustic={kit:Object.fromEntries(Object.keys(KIT_SOUNDS).map(id=>[id,'acoustic']))};
assert.ok(Object.values(core.normalizeSoundSettings(allAcoustic).kit).every(x=>x==='acoustic'));
function audio(){
  const sources=[];
  return {state:'running',currentTime:0,sampleRate:48000,destination:{},sources,decodeAudioData:async bytes=>decode(bytes),
    createBuffer(channels,length,rate){const data=new Float32Array(length);return {duration:length/rate,getChannelData:()=>data};},
    createGain(){return {gain:{value:1,events:[],setTargetAtTime(v){this.value=v;},cancelScheduledValues(t){this.events.push(['cancel',t]);},setValueAtTime(v,t){this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);}},connect(){},disconnect(){this.disconnected=true;}};},
    createBufferSource(){const source={connect(target){this.target=target;},disconnect(){this.disconnected=true;},start(at){this.at=at;},stop(at){this.stoppedAt=at??0;}};sources.push(source);return source;}
  };
}
const timers={setInterval(){},clearInterval(){},requestAnimationFrame(){},cancelAnimationFrame(){}};
const a=audio(),player=new RhythmPlayer(a,{},timers),original=player.buffers;
assert.throws(()=>player.setSounds(allAcoustic));assert.equal(player.buffers,original,'Missing samples never partly change the kit');
player.setSounds(allAcoustic,banks);
for(let i=0;i<player.variants.softHat.length;i++)assert.ok(Math.abs(rms(player.variants.softHat[i].getChannelData(0))/rms(banks.hat.hits[i].getChannelData(0))-.45)<1e-7,'Quiet hi-hat preserves each recording at lower volume');
const pattern={sounds:[{at:0,kind:'openHat'},...Array.from({length:6},(_,i)=>({at:.1+i*.1,kind:i===5?'hat':'drum'}))],positions:[],duration:1,loop:false};
player.play(pattern);for(let t=0;t<1;t+=.025){a.currentTime=t;player.schedule();}
assert.deepEqual(a.sources.slice(1,6).map(s=>banks.snare.hits.indexOf(s.buffer)),[0,1,2,0,1]);
assert.ok(Math.abs(a.sources[0].stoppedAt-(.08+.6+.025))<1e-9,'Closed hi-hat chokes the open recording on the audio clock');
assert.equal(a.sources[0].target.gain.events.at(-1)[0],'ramp');assert.ok(player.plan.duration>=2);
const hatGain=a.sources[0].target;player.stop();assert.equal(player.openHats.size,0);assert.equal(player.sources.size,0);assert.ok(hatGain.disconnected);
assert.ok(a.sources.every(s=>s.stoppedAt===0&&s.disconnected));
for(const bpm of [40,100,240]){
  const ctx=audio(),p=new RhythmPlayer(ctx,{},timers);p.setSounds({...allAcoustic,metronome:'bell'},banks);p.play(core.makeDemoPlan('together',bpm));
  const plan=p.plan,mix=new Float32Array(Math.ceil(plan.duration*ctx.sampleRate)),counts={};
  for(const event of plan.sounds){
    const variants=p.variants[event.kind]||[p.buffers[event.kind]],i=counts[event.kind]||0;counts[event.kind]=i+1;
    const data=variants[i%variants.length].getChannelData(0),offset=Math.round(event.at*ctx.sampleRate);
    for(let n=0;n<data.length;n++)mix[offset+n]+=data[n]*plan.gain;
  }
  assert.ok(mix.every(x=>Number.isFinite(x)&&Math.abs(x)<1),'Full-volume demo has no digital clipping');
  for(let now=0;now<plan.duration+.2;now+=.025){ctx.currentTime=now;p.schedule();}
  assert.equal(ctx.sources.length,plan.sounds.length);assert.equal(p.playing,false);assert.equal(p.sources.size,0);
}
// Four fast laps include cymbal tails overlapping later hits and the repeat boundary.
for(const recorded of [false,true])for(const voice of ['snare','toms','cymbals','beat']){
  const ctx=audio(),p=new RhythmPlayer(ctx,{},timers);p.setSounds(recorded?allAcoustic:undefined,recorded?banks:{});
  const exercise=core.buildMelodyExercise([['double','double','single'],['double','double','single']],'R',voice),plan=core.makePlaybackPlan(exercise,240,true);
  const mix=new Float32Array(Math.ceil((plan.duration*4+4)*ctx.sampleRate)),counts={};
  for(let lap=0;lap<4;lap++)for(const event of plan.sounds){
    const variants=p.variants[event.kind]||[p.buffers[event.kind]],i=counts[event.kind]||0;counts[event.kind]=i+1;
    const data=variants[i%variants.length].getChannelData(0),offset=Math.round((lap*plan.duration+event.at)*ctx.sampleRate);
    for(let n=0;n<data.length;n++)mix[offset+n]+=data[n]*plan.gain;
  }
  assert.ok(mix.every(x=>Number.isFinite(x)&&Math.abs(x)<1),`${voice} ${recorded?'recorded':'synth'} has no full-volume clipping across repeats`);
  p.play(plan);for(let now=0;now<plan.duration*3;now+=.025){ctx.currentTime=now;p.schedule();}
  const starts=ctx.sources.map(s=>s.at);assert.ok(starts.some(t=>Math.abs(t-(.08+plan.duration))<1e-9));
  assert.ok(p.playing);p.stop();assert.ok(ctx.sources.every(s=>s.stoppedAt===0&&s.disconnected));
}
(async()=>{
  const stored=new Map(),cache={match:async key=>stored.get(key)?.clone(),put:async(key,response)=>stored.set(key,response.clone()),delete:async key=>stored.delete(key)},cacheStorage={open:async()=>cache};
  let calls=0;
  const fetcher=async url=>{calls++;return new Response(fs.readFileSync(path.join(folder,path.basename(url))));};
  const library=new AcousticLibrary(audio(),{fetcher,cacheStorage});
  await Promise.all([library.load(['snare','snare']),library.load(['snare'])]);assert.equal(calls,6,'Concurrent callers share a bank download');
  await library.load(Object.keys(ACOUSTIC_BANKS));assert.equal(calls,20);assert.equal(stored.size,20);
  const offline=new AcousticLibrary(audio(),{cacheStorage,fetcher:async()=>{throw Error('offline');}});
  await offline.load(Object.keys(ACOUSTIC_BANKS));assert.equal(Object.keys(offline.banks).length,8,'A fresh session can decode every cached recording offline');
  stored.set('./assets/audio/salamander-v1/kick-1.wav',new Response('corrupt'));
  await new AcousticLibrary(audio(),{cacheStorage,fetcher}).load(['kick']);assert.equal(calls,21,'Corrupt cached recordings are replaced');
  let failed=true;
  const retry=new AcousticLibrary(audio(),{cacheStorage:null,fetcher:async url=>failed?new Response('',{status:503}):fetcher(url)});
  await assert.rejects(retry.load(['kick']),/Не удалось/);assert.equal(retry.banks.kick,undefined);failed=false;await retry.load(['kick']);assert.equal(retry.banks.kick.hits.length,2);
  const denied=new AcousticLibrary(audio(),{cacheStorage:{open:async()=>{throw Error('denied');}},fetcher});await denied.load(['kick']);assert.equal(denied.offlineReady,false);
  const timeout=new AcousticLibrary(audio(),{cacheStorage:null,timeout:5,fetcher:(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))});await assert.rejects(timeout.load(['kick']),/Не удалось/);
  // Exercise actual worker activation and navigation, preserving the independently loaded library.
  const handlers={},deleted=[],puts=[];let waited;
  vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),{URL,self:{addEventListener:(type,fn)=>handlers[type]=fn,clients:{claim:async()=>{}},location:{origin:'https://example.org'},registration:{scope:'https://example.org/drum-practice-dev/'}},caches:{keys:async()=>['rhythm-dev-v3','rhythm-dev-v4','rhythm-dev-v5','rhythm-dev-v6','rhythm-dev-samples-v1','rhythm-practice-v1'],delete:async key=>deleted.push(key),open:async()=>({put:async(...args)=>puts.push(args)})},fetch:async()=>new Response('updated page')});
  handlers.activate({waitUntil:p=>waited=p});await waited;assert.deepEqual(deleted,['rhythm-dev-v3','rhythm-dev-v4','rhythm-dev-v5']);
  handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://example.org/drum-practice-dev/'},respondWith:p=>waited=p});assert.equal(await(await waited).text(),'updated page');assert.equal(puts[0].length,2);assert.equal(puts[0][0],'./index.html');
  console.log('PASS: 20 recorded WAVs, dynamics, alternating hits, hi-hat choke, headroom, tails, scheduling, cached offline playback, retries, timeouts and service-worker updates.');
})().catch(error=>{console.error(error);process.exitCode=1;});
