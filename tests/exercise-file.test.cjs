const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=vm.createContext({TextEncoder});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],core);
const plain=value=>JSON.parse(JSON.stringify(value));
let seed=93241;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const playback={bpm:137,metronome:true,volume:47,sounds:plain(core.normalizeSoundSettings({metronome:'wood',kit:{snare:'acoustic',kick:'deep'}}))};
const families=['eighth','triplet','sixteenth','quintuplet','sextuplet'];
let checked=0;
function roundTrip(exercise){
  const before=JSON.stringify(exercise),text=core.serializeExerciseFile(exercise,playback),loaded=core.parseExerciseFile(text);
  assert.equal(JSON.stringify(exercise),before,'Saving does not modify the exercise');
  assert.deepEqual(plain(loaded.exercise),plain(exercise));assert.deepEqual(plain(loaded.playback),playback);
  assert.deepEqual(plain(core.makePlaybackPlan(loaded.exercise,137,true)),plain(core.makePlaybackPlan(exercise,137,true)),'Every attack, rest, accent and loop boundary survives exactly');
  assert.equal(core.scoreSVG(loaded.exercise,2),core.scoreSVG(exercise,2),'The notation survives exactly');
  checked++;return text;
}
for(const family of [...families,'all'])for(const chance of [0,.35,.99])for(const accentChance of [0,.25,1]){
  const selection=Object.fromEntries((family==='all'?families:[family]).map(id=>[id,{notes:true,rests:true,dotted:true}]));
  roundTrip(core.addEtudeAccents(core.makeEtude(8,selection,chance,random),accentChance,random));
}
for(let notes=1;notes<=64;notes++)roundTrip(core.makeAccentEtude(2,3,notes,Math.ceil(notes/2),random));
roundTrip(core.makeAccentEtude(256,1,1,1,random));
roundTrip(core.addEtudeAccents(core.makeEtude(64,{sixteenth:{notes:true,rests:true}},.3,random),.1,random));
roundTrip(core.makeAccentEtude(1,64,64,64,random));
const sample=JSON.parse(roundTrip(core.addEtudeAccents(core.makeEtude(1,{triplet:{notes:true}},0,random),.5,random)));
const rejects=mutate=>{const copy=structuredClone(sample);mutate(copy);assert.throws(()=>core.parseExerciseFile(JSON.stringify(copy)));};
for(const text of ['',null,'null','{}','[1,2]','<svg>','%PDF-1.4','{',' '.repeat(5*1024*1024+1)])assert.throws(()=>core.parseExerciseFile(text));
for(const mutate of [
  d=>d.format='elsewhere',d=>d.version=2,d=>d.kind='sounds',d=>d.exercise.bars=0,d=>d.exercise.bars=65,
  d=>d.exercise.accentChance=-1,d=>d.exercise.measures=[],d=>d.exercise.measures[0].pop(),
  d=>d.exercise.measures[0][0][0]='<script>',d=>d.exercise.measures[0][0][1]='false',d=>d.exercise.measures[0][0][2]=true,
  d=>{d.exercise.measures[0][0][1]=true;d.exercise.measures[0][0][3]=true;},
  d=>d.exercise.measures[0][1][0]='eighth',d=>d.exercise.measures[0][2][0]='quintuplet',
  d=>{d.exercise.accentChance=0;d.exercise.measures[0][0][3]=true;},
  d=>d.playback.bpm=39,d=>d.playback.bpm=240.5,d=>d.playback.metronome=1,d=>d.playback.volume=101,
  d=>d.playback.sounds.kit.snare='url:https://example.org/file',d=>d.playback.sounds.metronome='unknown'
])rejects(mutate);
const accents=JSON.parse(core.serializeExerciseFile(core.makeAccentEtude(2,3,5,3,random),playback));
for(const mutate of [d=>d.exercise.bars=257,d=>d.exercise.beats=65,d=>d.exercise.subdivision=0,d=>d.exercise.subdivision=65,d=>d.exercise.maxAccents=6,d=>d.exercise.accentPositions.pop(),d=>d.exercise.accentPositions[0].pop(),d=>d.exercise.accentPositions[0][0]=[],d=>d.exercise.accentPositions[0][0]=[1,1],d=>d.exercise.accentPositions[0][0]=[2,1],d=>d.exercise.accentPositions[0][0]=[6],d=>d.exercise.accentPositions[0][0]=[1,2,3,4]]){
  const copy=structuredClone(accents);mutate(copy);assert.throws(()=>core.parseExerciseFile(JSON.stringify(copy)));
}
assert.equal(core.parseExerciseFile('\uFEFF'+JSON.stringify(sample)).kind,'etudes');
const untrusted=JSON.parse(JSON.stringify(sample));untrusted.exercise.measures[0][0].push('extra');assert.throws(()=>core.parseExerciseFile(JSON.stringify(untrusted)));
const unknown={...sample,title:'<img src=x onerror=alert(1)>',url:'https://example.org',__proto__:{polluted:true}};
assert.equal(core.parseExerciseFile(JSON.stringify(unknown)).title,undefined,'Only known data is restored; strings and URLs are never rendered or fetched');
// Worst supported accent exercise remains comfortably below the file-size limit.
const dense=core.makeAccentEtude(256,64,64,64,()=>.999999);
const denseText=core.serializeExerciseFile(dense,playback);assert.ok(Buffer.byteLength(denseText)<5*1024*1024);
const decoded=core.parseExerciseFile(denseText);assert.equal(decoded.exercise.measures.length,256);assert.equal(decoded.exercise.measures.at(-1).length,4096);assert.equal(decoded.exercise.measures.at(-1).at(-1).accented,true);
console.log(`PASS: ${checked} exact notation/audio round-trips, both exercise types, all 1–64 subdivisions, saved settings, full-size files, malformed files and version rejection.`);
