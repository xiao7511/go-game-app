(() => {
  'use strict';
  const KEY='nobi.audio.v1';
  const defaults=Object.freeze({musicEnabled:true,musicVolume:.35,effectsEnabled:true,effectsVolume:.8,promptEnabled:true,promptVolume:.7,guandanTrack:'moonlight',goTrack:'dreaming',xiangqiTrack:'pingsha'});
  function normalize(input={}) {
    const output={...defaults};
    for(const key of Object.keys(defaults)) {
      if(typeof defaults[key]==='boolean') { if(typeof input[key]==='boolean') output[key]=input[key]; }
      else if(key.endsWith('Track')) { if(['pingsha','liushui','duyi','moonlight','nocturne','dreaming'].includes(input[key])) output[key]=input[key]; }
      else if(typeof input[key]==='number' && Number.isFinite(input[key])) output[key]=Math.max(0,Math.min(1,input[key]));
    }
    return output;
  }
  function create(options={}) {
    const manifest=options.manifest || window.NobiAudioManifest;
    let storage=options.storage;
    if(!storage) { try { storage=localStorage; } catch (_) {} }
    storage=storage || {getItem:()=>null,setItem(){}};
    const makeAudio=options.makeAudio || (src=>new Audio(src));
    const schedule=options.schedule || ((fn,ms)=>setTimeout(fn,ms));
    const cancel=options.cancel || (id=>clearTimeout(id));
    const now=options.now || (()=>performance.now());
    const scenes=['lobby','guandan','go','xiangqi','result'];
    function safePath(src) { return typeof src==='string' && /^assets\/(?:sounds|music)\/[a-zA-Z0-9_./-]+\.(?:mp3|ogg|wav)$/.test(src) && !src.includes('..'); }
    for(const scene of scenes) {
      const entry=manifest?.scenes?.[scene];
      if(entry && (!safePath(entry.src) || !entry.license)) throw new Error('Music needs a local path and license record');
      const choices=manifest?.tracks?.[scene] || [];
      if(choices.some(track=>!track.id || !safePath(track.src) || !track.license) || new Set(choices.map(track=>track.id)).size!==choices.length) throw new Error('Invalid music choices');
    }
    if(!manifest?.effects || Object.values(manifest.effects).some(src=>!safePath(src))) throw new Error('Invalid effect paths');
    let settings;
    try { settings=normalize(JSON.parse(storage.getItem(KEY) || '{}')); } catch (_) { settings={...defaults}; }
    let scene='lobby', unlocked=false, suspended=false, blocked=null, epoch=0, interruptions=0, current=null;
    const active=new Set(), fades=new Map(), listeners=new Set();
    const getTracks=next=>Object.freeze([...(manifest.tracks?.[next] || [])]);
    const selectedTrack=()=>['go','guandan','xiangqi'].includes(scene)?(getTracks(scene).find(track=>track.id===settings[scene+'Track']) || manifest.scenes[scene]):manifest.scenes[scene];
    const status=()=>Object.freeze({scene,unlocked,suspended,blocked,available:!!selectedTrack(),trackId:selectedTrack()?.id || null,playing:!!current && !current.paused});
    const emit=()=>listeners.forEach(fn=>fn(status()));
    function stopFade(audio) { if(fades.has(audio)) { cancel(fades.get(audio)); fades.delete(audio); } }
    function stop(audio) { if(!audio) return; stopFade(audio); active.delete(audio); audio.pause(); }
    function fade(audio,to,done) {
      stopFade(audio);
      const start=now(), from=audio.volume;
      function step() {
        const progress=Math.min(1,(now()-start)/450);
        audio.volume=from+(to-from)*progress;
        if(progress<1) fades.set(audio,schedule(step,30));
        else { fades.delete(audio); done?.(); }
      }
      step();
    }
    async function reconcile() {
      const track=selectedTrack();
      if(!unlocked || suspended || !settings.musicEnabled || !track) {
        epoch++;
        current=null;
        for(const audio of active) if(audio.nobiSource) { if(suspended) stop(audio); else fade(audio,0,()=>stop(audio)); }
        emit(); return false;
      }
      if(current?.nobiSource===track.src && !current.paused) { fade(current,settings.musicVolume); emit(); return true; }
      const revision=++epoch;
      const previous=current;
      const audio=makeAudio(track.src); audio.nobiSource=track.src; audio.loop=true; audio.volume=0;
      active.add(audio); current=audio;
      audio.addEventListener?.('pause',()=>{ if(current===audio && !suspended) { blocked='interrupted'; emit(); } });
      try {
        await audio.play();
        // A resolved play() from a superseded scene/background transition must not revive audio.
        if(revision!==epoch || suspended || !settings.musicEnabled) { stop(audio); return false; }
        blocked=null; fade(audio,settings.musicVolume);
        for(const old of active) if(old!==audio && old.nobiSource) fade(old,0,()=>stop(old));
        emit(); return true;
      } catch (_) {
        if(revision===epoch) { blocked='autoplay'; current=null; emit(); }
        stop(audio); if(previous) stop(previous); return false;
      }
    }
    const getSettings=()=>Object.freeze({...settings});
    function setSettings(patch) {
      settings=normalize({...settings,...patch});
      try { storage.setItem(KEY,JSON.stringify(settings)); } catch (_) {}
      // Apply mute/volume immediately to already playing effects, not just subsequent ones.
      for(const audio of active) if(audio.nobiDomain) {
        const domain=audio.nobiDomain;
        if(!settings[domain+'Enabled']) stop(audio);
        else audio.volume=settings[domain+'Volume'];
      }
      reconcile(); return getSettings();
    }
    async function unlock() { unlocked=true; blocked=null; return reconcile(); }
    async function playEffect(name) {
      const domain=['yourTurn','countdown'].includes(name)?'prompt':'effects', src=manifest.effects[name];
      if(!src || !unlocked || suspended || !settings[domain+'Enabled']) return false;
      const revision=interruptions;
      const audio=makeAudio(src); audio.volume=settings[domain+'Volume']; audio.nobiDomain=domain; active.add(audio);
      audio.addEventListener?.('ended',()=>active.delete(audio),{once:true});
      try { await audio.play(); if(revision!==interruptions || suspended || !settings[domain+'Enabled']) { stop(audio); return false; } return true; }
      catch (_) { stop(audio); blocked='autoplay'; emit(); return false; }
    }
    function suspend() { suspended=true; epoch++; interruptions++; current=null; for(const audio of [...active]) stop(audio); emit(); }
    function resume() { suspended=false; return reconcile(); }
    async function setScene(next) { if(!scenes.includes(next)) throw new Error('Unknown audio scene'); scene=next; return reconcile(); }
    function dispose() { suspend(); listeners.clear(); }
    return Object.freeze({ getSettings,setSettings,getTracks,getStatus:status,unlock,playEffect,setScene,suspend,resume,dispose,
      subscribe(fn) { listeners.add(fn); return ()=>listeners.delete(fn); } });
  }
  window.NobiAudioFactory=Object.freeze({create,normalize,storageKey:KEY});
  window.NobiAudio=create();
  // Real user gestures unlock playback; backgrounding stops both music and one-shot effects.
  document.addEventListener('pointerdown',()=>window.NobiAudio.unlock(),{capture:true,passive:true});
  document.addEventListener('keydown',()=>window.NobiAudio.unlock(),{capture:true});
  document.addEventListener('visibilitychange',()=>document.hidden?window.NobiAudio.suspend():window.NobiAudio.resume());
  window.addEventListener('pagehide',()=>window.NobiAudio.suspend());
  window.addEventListener('pageshow',()=>window.NobiAudio.resume());
  window.addEventListener('storage',event=>{if(event.key===KEY){try{window.NobiAudio.setSettings(JSON.parse(event.newValue||'{}'));}catch{}}});
})();
