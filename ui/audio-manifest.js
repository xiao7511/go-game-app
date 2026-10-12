(() => {
  'use strict';
  // Classical recordings and real explosion recording; see the local source/credit record.
  const license='docs/nobi-v2/guandan-audio-provenance.md';
  const tracks=Object.freeze([
    Object.freeze({id:'moonlight',title:'月光奏鸣曲 · 第一乐章',composer:'贝多芬',credit:'Paul Pitman / Musopen',src:'assets/music/guandan-moonlight.mp3',license}),
    Object.freeze({id:'nocturne',title:'降 E 大调夜曲 · Op.9 No.2',composer:'肖邦',credit:'Musopen',src:'assets/music/guandan-nocturne.mp3',license}),
    Object.freeze({id:'dreaming',title:'梦幻曲 · Op.15 No.7',composer:'舒曼',credit:'Donald Betts / Musopen',src:'assets/music/guandan-dreaming.mp3',license})
  ]);
  window.NobiAudioManifest = Object.freeze({
    scenes: Object.freeze({ lobby:tracks[2], guandan:tracks[0], go:tracks[2], result:null }),
    tracks:Object.freeze({guandan:tracks,go:tracks}),
    effects: Object.freeze({
      click:'assets/sounds/button-25.mp3', pass:'assets/sounds/button-25.mp3',
      placeStone:'assets/sounds/button-22.mp3', capture:'assets/sounds/button-21.mp3',
      invalidMove:'assets/sounds/button-12.mp3', yourTurn:'assets/sounds/button-3.mp3',
      countdown:'assets/sounds/guandan-countdown.wav', bomb:'assets/sounds/guandan-bomb.wav'
    })
  });
})();
