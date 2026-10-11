// WebView 101 has AbortController but not AbortSignal.timeout.
(() => {
 'use strict';
 window.NobiRequestTimeout=function(milliseconds){
  if(typeof AbortSignal.timeout==='function')return AbortSignal.timeout(milliseconds);
  const controller=new AbortController();
  setTimeout(()=>controller.abort(new DOMException('Request timed out','TimeoutError')),milliseconds);
  return controller.signal;
 };
})();
