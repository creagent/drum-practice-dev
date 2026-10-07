'use strict';
// Salamander Drumkit by Alexander Holm; adapted WAVs remain CC BY-SA 3.0.
// Exact sources and processing are documented beside the audio files.
const ACOUSTIC_CACHE = 'rhythm-dev-samples-v1';
const ACOUSTIC_ROOT = './assets/audio/salamander-v1/';
const ACOUSTIC_BANKS = {
  kick: {hits:['kick-1.wav','kick-2.wav']},
  snare: {hits:['snare-1.wav','snare-2.wav','snare-3.wav'],soft:['snare-soft-1.wav','snare-soft-2.wav','snare-soft-3.wav']},
  hat: {hits:['hat-1.wav','hat-2.wav']},
  openHat: {hits:['open-hat-1.wav','open-hat-2.wav']},
  tomHigh: {hits:['tom-high-1.wav','tom-high-2.wav']},
  tomLow: {hits:['tom-low-1.wav','tom-low-2.wav']},
  ride: {hits:['ride-1.wav','ride-2.wav']},
  crash: {hits:['crash-1.wav','crash-2.wav']}
};
class AcousticLibrary {
  constructor(context,{fetcher=(...args)=>fetch(...args),cacheStorage=typeof caches==='undefined'?null:caches,timeout=20000}={}) {
    this.context=context;this.fetcher=fetcher;this.timeout=timeout;
    this.banks={};this.pending={};this.offlineReady=!!cacheStorage;
    this.cache=cacheStorage?cacheStorage.open(ACOUSTIC_CACHE).catch(()=>{this.offlineReady=false;return null;}):Promise.resolve(null);
  }
  async readSample(file) {
    const url=ACOUSTIC_ROOT+file,cache=await this.cache;
    if(cache) {
      try {
        const cached=await cache.match(url);
        if(cached){
          const buffer=await this.context.decodeAudioData(await cached.arrayBuffer());
          if(!Number.isFinite(buffer.duration)||buffer.duration<=0)throw new Error('Empty audio');
          return buffer;
        }
      }catch{await cache.delete(url).catch(()=>{});}
    }
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeout);
    try {
      const response=await this.fetcher(url,{signal:controller.signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const copy=cache?response.clone():null;
      const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
      if(!Number.isFinite(buffer.duration)||buffer.duration<=0)throw new Error('Empty audio');
      if(cache)try{await cache.put(url,copy);}catch{this.offlineReady=false;}
      return buffer;
    }catch{
      throw new Error('Не удалось загрузить акустические записи. Проверь интернет и нажми «Слушать» ещё раз или выбери синтезированный тембр.');
    }finally{clearTimeout(timer);}
  }
  async load(instruments,onProgress=()=>{}) {
    const ids=[...new Set(instruments)];
    if(ids.some(id=>!Object.hasOwn(ACOUSTIC_BANKS,id)))throw new RangeError('Неизвестный инструмент.');
    let completed=0;onProgress(completed,ids.length);
    await Promise.all(ids.map(async id=>{
      if(!this.banks[id]) {
        if(!this.pending[id])this.pending[id]=(async()=>{
          const bank={};
          await Promise.all(Object.entries(ACOUSTIC_BANKS[id]).map(async ([layer,files])=>{
            bank[layer]=await Promise.all(files.map(file=>this.readSample(file)));
          }));
          this.banks[id]=bank;
        })().finally(()=>{delete this.pending[id];});
        await this.pending[id];
      }
      onProgress(++completed,ids.length);
    }));
    return this.banks;
  }
}
