import {test,expect,vi} from '../../tooling/node_modules/vitest/dist/index.js';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync('ui/request-timeout.js','utf8');
test('WebView 101 fallback aborts network requests at the deadline',()=>{
 const window={};let callback,delay;
 vm.runInNewContext(source,{window,AbortSignal:{},AbortController,DOMException,setTimeout:(fn,ms)=>{callback=fn;delay=ms;}});
 const signal=window.NobiRequestTimeout(5000);expect(signal.aborted).toBe(false);expect(delay).toBe(5000);
 callback();expect(signal.aborted).toBe(true);expect(signal.reason.name).toBe('TimeoutError');
});
test('Modern browsers retain their native timeout signal',()=>{
 const window={},signal={},timeout=vi.fn(()=>signal);
 vm.runInNewContext(source,{window,AbortSignal:{timeout}});
 expect(window.NobiRequestTimeout(15000)).toBe(signal);expect(timeout).toHaveBeenCalledWith(15000);
});
