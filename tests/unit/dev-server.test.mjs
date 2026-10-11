import { test,expect } from '../../tooling/node_modules/vitest/dist/index.js';
import { canonicalDevHtml } from '../../scripts/verify-dev-server.mjs';
test('dev identity accepts only known Vite client and bundled SDK transformations',()=>{
 const source='<head>\r\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\r\n</head>';
 const vite='<head>\n  <script type="module" src="/@vite/client"></script>\n\r\n<script src="vendor/supabase.js"></script>\r\n</head>';
 expect(canonicalDevHtml(vite)).toBe(canonicalDevHtml(source));
});
test('dev identity still rejects changed HTML logic or a different injected script',()=>{
 const source='<head><script src="vendor/supabase.js"></script></head>';
 expect(canonicalDevHtml(source.replace('vendor/supabase.js','evil.js'))).not.toBe(canonicalDevHtml(source));
 expect(canonicalDevHtml(source+'<script>window.GD=null</script>')).not.toBe(canonicalDevHtml(source));
});
