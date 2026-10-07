const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const core=vm.createContext({});vm.runInContext(code,core);
const {KIT_SOUNDS,METRONOME_SOUNDS,RhythmPlayer}=vm.runInContext('({KIT_SOUNDS,METRONOME_SOUNDS,RhythmPlayer})',core);
const defaults=core.normalizeSoundSettings();
for(const invalid of [null,undefined,5,[],{}, {metronome:'missing',kit:{snare:'missing'}}])assert.equal(JSON.stringify(core.normalizeSoundSettings(invalid)),JSON.stringify(defaults));
const saved={metronome:'wood',kit:{snare:'deep',kick:'electronic',hat:'unknown'},unexpected:true};
const normalized=core.normalizeSoundSettings(saved);
assert.equal(normalized.metronome,'wood');assert.equal(normalized.kit.snare,'deep');assert.equal(normalized.kit.kick,'electronic');assert.equal(normalized.kit.hat,'dry');assert.equal(normalized.unexpected,undefined);
const rms=samples=>Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
function context(sampleRate){
  const sources=[];
  return {state:'running',currentTime:0,sampleRate,destination:{},sources,
    createBuffer(channels,length,rate){const data=new Float32Array(length);return {duration:length/rate,getChannelData(){return data;}};},
    createGain(){return {gain:{value:0,setTargetAtTime(value){this.value=value;}},connect(){}};},
    createBufferSource(){const source={connect(){},disconnect(){this.disconnected=true;},start(at){this.at=at;},stop(){this.stopped=true;}};sources.push(source);return source;}
  };
}
for(const rate of [44100,48000]){
  const audio=context(rate);
  for(const [instrument,item] of Object.entries(KIT_SOUNDS))for(const [variant] of item.options.filter(([id])=>id!=='acoustic')){
    const samples=core.makeSoundBuffer(audio,instrument,variant).getChannelData(0);
    assert.ok(samples.every(Number.isFinite),`${instrument}/${variant} must contain finite audio`);
    assert.ok(rms(samples)>.003,`${instrument}/${variant} must be audible`);
    assert.ok(samples.every(sample=>Math.abs(sample)<1),'Each voice stays below digital clipping');
    assert.equal(Math.abs(samples[0]),0);assert.ok(Math.abs(samples.at(-1))<.001,'The tail fades out smoothly');
  }
  for(const [variant] of METRONOME_SOUNDS){
    const weak=core.makeSoundBuffer(audio,'click',variant).getChannelData(0),strong=core.makeSoundBuffer(audio,'accent',variant).getChannelData(0);
    assert.ok(rms(weak)>.01&&rms(strong)>.01);assert.notDeepEqual(weak,strong,'First beat differs from the other beats');
  }
  const player=new RhythmPlayer(audio,{}, {setInterval(){},clearInterval(){},requestAnimationFrame(){},cancelAnimationFrame(){}});
  for(const [variant] of KIT_SOUNDS.snare.options.filter(([id])=>id!=='acoustic')){
    player.setSounds({metronome:'bell',kit:{snare:variant}});
    assert.equal(player.buffers.snare,player.buffers.drum);
    assert.ok(Math.abs(rms(player.buffers.softDrum.getChannelData(0))/rms(player.buffers.drum.getChannelData(0))-.12)<1e-6,'Every selected snare retains accent dynamics');
  }
}
for(const bpm of [40,100,240])for(const kind of ['metronome','kit','together']){
  const plan=core.makeDemoPlan(kind,bpm),q=60/bpm;
  assert.equal(plan.loop,false);assert.equal(plan.bars,4);assert.equal(plan.positions.length,16);
  assert.equal(plan.positions.at(-1).end,16*q);assert.ok(plan.duration>16*q,'Cymbal tails are allowed to finish');
  assert.ok(plan.sounds.every((event,i)=>event.at>=0&&event.at<16*q&&(!i||event.at>=plan.sounds[i-1].at)));
  const clicks=plan.sounds.filter(s=>s.kind==='click'||s.kind==='accent');
  assert.equal(clicks.length,kind==='kit'?0:16);
  assert.equal(clicks.filter(s=>s.kind==='accent').length,kind==='kit'?0:4);
  if(kind!=='metronome')for(const voice of ['kick','drum','softDrum','hat','openHat','tomHigh','tomLow','ride','crash'])assert.ok(plan.sounds.some(s=>s.kind===voice),`Demo includes ${voice}`);
  const audio=context(44100),intervals=new Set(),frames=new Set(),reasons=[];
  const timers={setInterval(fn){intervals.add(fn);return fn;},clearInterval(fn){intervals.delete(fn);},requestAnimationFrame(fn){frames.add(fn);return fn;},cancelAnimationFrame(fn){frames.delete(fn);}};
  const player=new RhythmPlayer(audio,{onStop:reason=>reasons.push(reason)},timers);player.setSounds(normalized);player.play(plan);
  for(let now=0;now<plan.duration+.15;now+=.025){
    audio.currentTime=now;player.schedule();
    const queued=[...frames];frames.clear();queued.forEach(fn=>fn());
    for(const source of audio.sources)if(source.onended&&now>=source.at+source.buffer.duration){const end=source.onended;source.onended=null;end();}
  }
  assert.equal(audio.sources.length,plan.sounds.length,'Each demo event is scheduled once');
  audio.sources.forEach((source,i)=>{assert.equal(source.buffer,player.buffers[plan.sounds[i].kind]);assert.ok(Math.abs(source.at-(.08+plan.sounds[i].at))<1e-10);});
  assert.deepEqual(reasons,['ended']);assert.equal(player.sources.size,0);assert.equal(intervals.size,0);assert.equal(frames.size,0);
}
for(const id of Object.keys(KIT_SOUNDS)){
  const plan=core.makeInstrumentPreviewPlan(id),audio=context(44100),player=new RhythmPlayer(audio,{}, {setInterval(){},clearInterval(){},requestAnimationFrame(){},cancelAnimationFrame(){}});
  assert.equal(plan.loop,false);assert.equal(plan.positions.length,0);player.play(plan);audio.currentTime=.8;player.animate();
  player.setSounds(normalized);assert.equal(player.playing,false);assert.equal(player.sources.size,0);assert.ok(audio.sources.every(s=>s.stopped&&s.disconnected));
}
// Render the combined demo at maximum volume to catch overload from stacked voices.
for(const variant of ['pad','dry','deep','electronic']){
  const audio=context(44100),player=new RhythmPlayer(audio,{}, {setInterval(){},clearInterval(){},requestAnimationFrame(){},cancelAnimationFrame(){}});
  player.setSounds({metronome:'bell',kit:Object.fromEntries(Object.keys(KIT_SOUNDS).map(id=>[id,variant]))});
  const plan=core.makeDemoPlan('together',240),mix=new Float32Array(Math.ceil(plan.duration*audio.sampleRate));
  player.play(plan);assert.equal(player.planGain.gain.value,plan.gain);
  for(const event of plan.sounds){
    const samples=player.buffers[event.kind].getChannelData(0),offset=Math.round(event.at*audio.sampleRate);
    for(let i=0;i<samples.length&&offset+i<mix.length;i++)mix[offset+i]+=samples[i]*plan.gain;
  }
  assert.ok(mix.every(x=>Number.isFinite(x)&&Math.abs(x)<1),'The mixed kit and metronome do not clip at full volume');
  player.stop();player.play(core.makePlaybackPlan(core.makeEtude(1,{eighth:{notes:true}},0),100));assert.equal(player.planGain.gain.value,1,'An exercise restores its normal playback level');player.stop();
}
for(const bpm of [39,241,NaN,80.5])assert.throws(()=>core.makeDemoPlan('kit',bpm));
assert.throws(()=>core.makeDemoPlan('unknown'));assert.throws(()=>core.makeInstrumentPreviewPlan('unknown'));
console.log('PASS: sound settings validation, 25 instrument timbres, four metronomes, dynamics, four-bar demos, exact scheduling, preview cancellation and clean endings at 44.1/48 kHz.');
