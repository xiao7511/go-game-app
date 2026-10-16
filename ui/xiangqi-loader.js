// Keep game modules as public resources across relative Web/App deployment paths.
(() => {
 const ready=import(new URL('xiangqi.js',document.currentScript.src).href);
 ready.catch(()=>{});window.NobiXiangqiReady=ready;
})();
