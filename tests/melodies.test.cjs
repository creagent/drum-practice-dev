const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),ctx=vm.createContext({TextEncoder});
vm.runInContext(fs.readFileSync(path.join(root,'melodies.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
const {MELODY_PATTERNS,MELODY_VOICES}=vm.runInContext('({MELODY_PATTERNS,MELODY_VOICES})',ctx),plain=x=>JSON.parse(JSON.stringify(x));
let seed=28193;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);let checked=0;
for(let mask=1;mask<16;mask++)for(const bars of [1,2,8,64])for(const start of ['R','L']){
  const ids=MELODY_PATTERNS.filter((_,i)=>mask&(1<<i)).map(p=>p.id);
  if(!(mask&5)){assert.throws(()=>ctx.makeMelodyExercise(bars,ids,start,'snare',rng),/4\/4/);continue;}
  const ex=ctx.makeMelodyExercise(bars,ids,start,'snare',rng);assert.equal(ex.measures.length,bars);
  let next=start;
  for(let bar=0;bar<bars;bar++){
    const notes=ex.measures[bar],strokes=ex.strokes[bar];assert.equal(strokes.length,16);assert.equal(notes.reduce((n,e)=>n+e.ticks,0),480);
    assert.deepEqual(Array.from(strokes.filter(e=>e.accented),e=>e.time),Array.from(notes,e=>e.time),'Melody attacks exactly match paradiddle accents');
    assert.ok(strokes.every((e,i)=>e.time===i*30&&!e.rest&&e.ticks===30&&notes[e.melodyIndex].time<=e.time));
    let slot=0;
    for(const id of ex.blocks[bar]){
      assert.ok(ids.includes(id));const pattern=MELODY_PATTERNS.find(p=>p.id===id),group=strokes.slice(slot,slot+pattern.hands.length);
      const expected=next==='R'?pattern.hands:Array.from(pattern.hands,h=>h==='R'?'L':'R').join('');
      assert.equal(group.map(e=>e.hand).join(''),expected);
      assert.deepEqual(Array.from(group,(e,i)=>e.accented?i:-1).filter(i=>i>=0),Array.from(pattern.accents));
      next=group.at(-1).hand==='R'?'L':'R';slot+=group.length;
    }
    assert.equal(slot,16);checked++;
  }
  assert.equal(next,start,'The repeat continues the sticking without three consecutive hits');
  const mirror=ctx.buildMelodyExercise(ex.blocks,start==='R'?'L':'R','snare');
  assert.ok(ex.strokes.flat().every((e,i)=>e.hand!==mirror.strokes.flat()[i].hand));
}
const ex=ctx.buildMelodyExercise([['double','diddle','single'],['triple','triple']],'R','snare');
assert.deepEqual(Array.from(ex.measures[0],e=>[e.type,e.dotted,e.time,e.ticks]),[['eighth',false,0,60],['quarter',false,60,120],['quarter',true,180,180],['quarter',false,360,120]]);
for(const voice of Object.keys(MELODY_VOICES))for(const bpm of [40,93,240])for(const metro of [false,true]){
  const exercise={...ex,voice},plan=ctx.makePlaybackPlan(exercise,bpm,metro);assert.equal(plan.loop,true);assert.equal(plan.positions.length,32);assert.equal(plan.duration,8*60/bpm);
  const quarter=60/bpm,delta=quarter/4;
  plan.positions.forEach((position,i)=>{assert.ok(Math.abs(position.at-i*delta)<1e-9);assert.equal(position.stroke,i%16);});
  for(const [i,e] of exercise.strokes.flat().entries()){
    const kinds=plan.sounds.filter(s=>Math.abs(s.at-i*delta)<1e-9&&!['click','accent'].includes(s.kind)).map(s=>s.kind);
    const expected=voice==='beat'?(e.hand==='R'?(e.accented?['hat','kick']:['softHat']):[e.accented?'drum':'softDrum']):!e.accented?['softDrum']:voice==='toms'?[e.hand==='L'?'tomHigh':'tomLow']:voice==='cymbals'?[e.hand==='R'?'ride':'crash','kick']:['drum'];
    assert.deepEqual(Array.from(kinds),expected);
  }
  assert.equal(plan.sounds.filter(s=>['click','accent'].includes(s.kind)).length,metro?8:0);
  const settings={bpm,metronome:metro,volume:60,sounds:ctx.normalizeSoundSettings()};
  const text=ctx.serializeExerciseFile(exercise,settings),restored=ctx.parseExerciseFile(text);
  assert.equal(JSON.parse(text).version,2);assert.equal(restored.kind,'melodies');assert.deepEqual(plain(restored.exercise),plain(exercise));assert.deepEqual(plain(ctx.makePlaybackPlan(restored.exercise,bpm,metro)),plain(plan));
}
for(const width of [260,390,900,1600]){
  const layout=ctx.layoutScore(ex,width,width<=390?1:undefined);
  assert.ok(layout.rows.every(row=>row.height===214&&!/NaN|undefined/.test(row.content)));
  const svg=ctx.scoreSVG(ex,layout.columns);assert.equal((svg.match(/data-stroke=/g)||[]).length,32);assert.equal((svg.match(/data-hand=/g)||[]).length,32);
  assert.equal((svg.match(/class="repeat-start"/g)||[]).length,1);assert.equal((svg.match(/class="repeat-end"/g)||[]).length,1);
  assert.equal((svg.match(/class="accent-mark"/g)||[]).length,ex.measures.flat().length);
  assert.ok(svg.includes('R')&&svg.includes('L'));
}
const long=ctx.makeMelodyExercise(64,['single','diddle','triple','double'],'R','beat',rng),pages=ctx.scorePDFPages(long),content=pages.join('');
assert.ok(pages.length>1);assert.equal((content.match(/data-stroke=/g)||[]).length,1024);assert.equal((content.match(/data-hand=/g)||[]).length,1024);
assert.deepEqual(Array.from(content.matchAll(/data-measure="(\d+)"/g),m=>+m[1]),Array.from({length:64},(_,i)=>i));
for(const invalid of [[],[['unknown','triple']], [['diddle','diddle','single']], [['single']],Array(65).fill(['triple','triple'])])assert.throws(()=>ctx.buildMelodyExercise(invalid));
for(const bars of [0,65,NaN,2.5])assert.throws(()=>ctx.makeMelodyExercise(bars,['single']));
assert.throws(()=>ctx.makeMelodyExercise(1,[]));assert.throws(()=>ctx.makeMelodyExercise(1,['bad']));
assert.throws(()=>ctx.buildMelodyExercise([['triple','triple']],'Z'));assert.throws(()=>ctx.buildMelodyExercise([['triple','triple']],'R','unknown'));
const saved=JSON.parse(ctx.serializeExerciseFile(ex,{bpm:80,metronome:true,volume:60,sounds:ctx.normalizeSoundSettings()}));
for(const field of ['startingHand','voice']){const broken=structuredClone(saved);delete broken.exercise[field];assert.throws(()=>ctx.parseExerciseFile(JSON.stringify(broken)),/повреждён/);}
console.log(`PASS: ${checked} melody measures, all figure subsets, mirrored sticking and seamless repeats, four exact orchestrations, SVG/PDF layers and portable files.`);
