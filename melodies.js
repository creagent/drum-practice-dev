'use strict';
const MELODY_PATTERNS=[
  {id:'single',name:'Парадидл',label:'Четверть',short:'П',hands:'RLRR',notes:[['quarter',false,4]],accents:[0]},
  {id:'diddle',name:'Парадидл-дидл',label:'Четверть с точкой',short:'П-д',hands:'RLRRLL',notes:[['quarter',true,6]],accents:[0]},
  {id:'triple',name:'Тройной парадидл',label:'Половинная',short:'3П',hands:'RLRLRLRR',notes:[['half',false,8]],accents:[0]},
  {id:'double',name:'Двойной парадидл',label:'Восьмая + четверть',short:'2П',hands:'RLRLRR',notes:[['eighth',false,2],['quarter',false,4]],accents:[0,2]}
];
const MELODY_VOICES={
  snare:{label:'Малый барабан',help:'Все удары — на малом. Акценты громче, остальные ноты — тихие.'},
  toms:{label:'Малый + акценты в тома',help:'Тихие удары — малый. Акцент L — высокий том, R — низкий том.'},
  cymbals:{label:'Малый + тарелки и бочка',help:'Тихие удары — малый. Акцент R — райд и бочка, L — крэш и бочка.'},
  beat:{label:'Бит',help:'R: хэт, с бочкой на акцентах. L: малый, громче на акцентах и тише между ними.'}
};
const oppositeHand=hand=>hand==='R'?'L':'R';
function melodyNextHand(pattern,hand){return pattern.hands.at(-1)==='R'?oppositeHand(hand):hand;}
function buildMelodyExercise(blocks,startingHand='R',voice='snare'){
  if(!Array.isArray(blocks)||blocks.length<1||blocks.length>64||!['R','L'].includes(startingHand)||!Object.hasOwn(MELODY_VOICES,voice))throw new Error('Некорректные параметры мелодии.');
  let hand=startingHand;
  const measures=[],strokes=[];
  for(const bar of blocks){
    if(!Array.isArray(bar)||bar.length<2||bar.length>4)throw new Error('Некорректный такт мелодии.');
    const melody=[],playing=[];let slot=0;
    for(const [block,id] of bar.entries()){
      const p=MELODY_PATTERNS.find(p=>p.id===id);
      if(!p||slot+p.hands.length>16)throw new Error('Фигуры должны составлять полный такт 4/4.');
      let noteSlot=slot;
      for(const [type,dotted,length] of p.notes){melody.push({type,dotted,ticks:length*30,time:noteSlot*30,rest:false,accented:false,tuplet:null});noteSlot+=length;}
      for(let j=0;j<p.hands.length;j++){
        const time=(slot+j)*30;
        playing.push({type:'sixteenth',ticks:30,time,rest:false,dotted:false,tuplet:null,accented:p.accents.includes(j),hand:hand==='R'?p.hands[j]:oppositeHand(p.hands[j]),block,pattern:id,blockStart:j===0,melodyIndex:melody.length-p.notes.length+(p.id==='double'&&j>=2?1:0)});
      }
      slot+=p.hands.length;hand=melodyNextHand(p,hand);
    }
    if(slot!==16)throw new Error('Фигуры должны составлять полный такт 4/4.');
    measures.push(melody);strokes.push(playing);
  }
  if(hand!==startingHand)throw new Error('Аппликатура должна продолжаться без разрыва на репризе.');
  return {mode:'melodies',bars:blocks.length,beats:4,blocks:blocks.map(bar=>[...bar]),startingHand,voice,measures,strokes};
}
function makeMelodyExercise(bars,selected,startingHand='R',voice='snare',random=Math.random){
  if(!Number.isInteger(bars)||bars<1||bars>64)throw new RangeError('Количество тактов должно быть от 1 до 64.');
  if(!Array.isArray(selected)||!selected.length||selected.some(id=>!MELODY_PATTERNS.some(p=>p.id===id)))throw new Error('Выбери хотя бы одну фигуру.');
  const patterns=MELODY_PATTERNS.filter(p=>selected.includes(p.id)),memo=new Map(),end=bars*16;
  // Close both time and sticking across the repeat; no group is cut at a barline.
  function fits(p,slot){return slot%16+p.hands.length<=16;}
  function finish(slot,hand){
    if(slot===end)return hand===startingHand;
    const key=slot+hand;
    if(!memo.has(key))memo.set(key,patterns.some(p=>fits(p,slot)&&finish(slot+p.hands.length,melodyNextHand(p,hand))));
    return memo.get(key);
  }
  if(!finish(0,startingHand))throw new Error('Из этих фигур не собрать 4/4. Добавь четверть или половинную ноту.');
  const blocks=Array.from({length:bars},()=>[]),counts={};let slot=0,hand=startingHand;
  while(slot<end){
    const choices=patterns.filter(p=>fits(p,slot)&&finish(slot+p.hands.length,melodyNextHand(p,hand)));
    const weights=choices.map(p=>1/(1+(counts[p.id]||0))),total=weights.reduce((a,b)=>a+b,0);let pick=random()*total;
    const p=choices.find((_,i)=>(pick-=weights[i])<0)||choices.at(-1);
    blocks[Math.floor(slot/16)].push(p.id);counts[p.id]=(counts[p.id]||0)+1;slot+=p.hands.length;hand=melodyNextHand(p,hand);
  }
  return buildMelodyExercise(blocks,startingHand,voice);
}
function melodyPlaybackPlan(exercise,bpm,metronome){
  const seconds=60/bpm/4,sounds=[],positions=[];
  exercise.strokes.forEach((bar,b)=>bar.forEach((e,i)=>{
    const at=(b*16+i)*seconds;
    positions.push({at,end:at+seconds,bar:b,index:e.melodyIndex,stroke:i});
    let kinds;
    if(exercise.voice==='beat')kinds=e.hand==='R'?(e.accented?['hat','kick']:['softHat']):[e.accented?'drum':'softDrum'];
    else if(!e.accented)kinds=['softDrum'];
    else if(exercise.voice==='toms')kinds=[e.hand==='L'?'tomHigh':'tomLow'];
    else if(exercise.voice==='cymbals')kinds=[e.hand==='R'?'ride':'crash','kick'];
    else kinds=['drum'];
    kinds.forEach(kind=>sounds.push({at,kind}));
  }));
  if(metronome)for(let beat=0;beat<exercise.bars*4;beat++)sounds.push({at:beat*60/bpm,kind:beat%4===0?'accent':'click'});
  sounds.sort((a,b)=>a.at-b.at);
  return {sounds,positions,duration:exercise.bars*16*seconds,bars:exercise.bars,loop:true,gain:exercise.voice==='snare'?1:.65};
}
function melodyLayout(exercise,availableWidth,forcedColumns,firstBar=0,lastBar=exercise.bars){
  const minimum=380,columns=forcedColumns||(availableWidth>=minimum*4&&exercise.bars>=4?4:availableWidth>=minimum*2?2:1);
  const width=Math.max(320*columns,availableWidth),measureWidth=width/columns,rows=[];
  for(let start=firstBar;start<lastBar;start+=columns){
    let content='';const end=Math.min(lastBar,start+columns);
    for(let b=start;b<end;b++){
      const offset=(b-start)*measureWidth,left=b===0?30:16,right=b===exercise.bars-1?24:12,step=(measureWidth-left-right)/16;
      const xs=exercise.strokes[b].map((_,i)=>left+i*step);
      const melodyXs=exercise.measures[b].map(e=>left+e.time/30*step);
      const top=drawMeasure(exercise.measures[b],measureWidth,0,0,melodyXs);
      let lower=drawMeasure(exercise.strokes[b],measureWidth/.72,0,0,xs.map(x=>x/.72)).replaceAll('data-event=','data-stroke=');
      const letters=exercise.strokes[b].map((e,i)=>`<text x="${xs[i]}" y="173" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="${e.accented?750:450}" data-hand="${i}">${e.hand}</text>`).join('');
      let position=0;
      const groups=exercise.blocks[b].map(id=>{
        const p=MELODY_PATTERNS.find(p=>p.id===id),x1=xs[position]-5,x2=xs[position+p.hands.length-1]+5;position+=p.hands.length;
        return `<path d="M${x1} 181v3H${x2}v-3" fill="none" stroke="currentColor" opacity=".35"/><text x="${(x1+x2)/2}" y="200" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" opacity=".65">${p.short}</text>`;
      }).join('');
      const opening=b===0?repeatBarline(2,true):'<path d="M1 35V85M1 119V159" fill="none" stroke="currentColor"/>';
      const closing=b===exercise.bars-1?repeatBarline(measureWidth-2,false):`<path d="M${measureWidth-4} 35V85M${measureWidth-4} 119V159" fill="none" stroke="currentColor"/>`;
      content+=`<g data-measure="${b}" transform="translate(${offset} 0)"><rect class="playback-bar" x="2" y="3" width="${measureWidth-7}" height="205" rx="5" fill="#f4ecd2" opacity="0"/>${opening}${top}<g transform="translate(0 94) scale(.72)">${lower}</g>${letters}${groups}${closing}</g>`;
    }
    rows.push({start,end,width,height:214,content});
  }
  return {columns,width,rows};
}
