import fs from 'node:fs';import {localSql} from './local-db.mjs';
localSql(fs.readFileSync('infrastructure/local-supabase/sql/verify-competitive.sql','utf8').replace(/^\uFEFF/,''));console.log('PASS: isolated settlement/admin grants, RLS, unique active season, private publication denial');
