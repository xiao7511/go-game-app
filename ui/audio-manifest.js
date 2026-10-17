(() => {
  'use strict';
  // Classical recordings and real explosion recording; see the local source/credit record.
  const license='docs/nobi-v2/guandan-audio-provenance.md';
  const chinese=Object.freeze([
    Object.freeze({id:'pingsha',title:'平沙落雁',composer:'中国古曲 · 古琴',credit:'Charlie Huang / CC BY 2.5',src:'assets/music/chinese-pingsha.mp3',license:'assets/music/chinese-classical-credits.txt'}),
    Object.freeze({id:'liushui',title:'流水',composer:'中国古曲 · 古琴',credit:'Charlie Huang / CC BY 2.5',src:'assets/music/chinese-liushui.mp3',license:'assets/music/chinese-classical-credits.txt'}),
    Object.freeze({id:'duyi',title:'孔子读易',composer:'中国古曲 · 古琴',credit:'Charlie Huang / CC BY 2.5',src:'assets/music/chinese-duyi.mp3',license:'assets/music/chinese-classical-credits.txt'})
  ]);
  const tracks=Object.freeze([...chinese,
    Object.freeze({id:'moonlight',title:'月光奏鸣曲 · 第一乐章',composer:'贝多芬',credit:'Paul Pitman / Musopen',src:'assets/music/guandan-moonlight.mp3',license}),
    Object.freeze({id:'nocturne',title:'降 E 大调夜曲 · Op.9 No.2',composer:'肖邦',credit:'Musopen',src:'assets/music/guandan-nocturne.mp3',license}),
    Object.freeze({id:'dreaming',title:'梦幻曲 · Op.15 No.7',composer:'舒曼',credit:'Donald Betts / Musopen',src:'assets/music/guandan-dreaming.mp3',license})
  ]);
  window.NobiAudioManifest = Object.freeze({
    scenes: Object.freeze({ lobby:tracks[5], guandan:tracks[3], go:tracks[5], xiangqi:chinese[0], result:null }),
    tracks:Object.freeze({guandan:tracks,go:tracks,xiangqi:tracks}),
    effects: Object.freeze({
      click:'assets/sounds/button-25.mp3', pass:'assets/sounds/button-25.mp3',
      placeStone:'assets/sounds/button-22.mp3', capture:'assets/sounds/button-21.mp3',
      xiangqiMove:'assets/sounds/xiangqi-move.wav', xiangqiCapture:'assets/sounds/xiangqi-capture.wav',
      invalidMove:'assets/sounds/button-12.mp3', yourTurn:'assets/sounds/button-3.mp3',
      countdown:'assets/sounds/guandan-countdown.wav', bomb:'assets/sounds/guandan-bomb.wav'
    })
  });
})();
