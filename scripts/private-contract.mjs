import fs from 'node:fs';
import {localSql} from './local-db.mjs';
localSql(fs.readFileSync(new URL('../infrastructure/local-supabase/sql/verify-private.sql',import.meta.url),'utf8').replace(/^\uFEFF/,''));
console.log('PASS: private schema grants/RLS, no private Realtime publication, client receipt/result write denial');
