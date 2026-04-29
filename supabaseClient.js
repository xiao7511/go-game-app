// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// 去 Supabase 后台 -> Settings -> API 找这两个值
const supabaseUrl = 'https://kogjjfccyncdszuuwlun.supabase.co/rest/v1/'
const supabaseAnonKey = 'sb_publishable_sUhEUYYHIr7hQl6A_iE4zQ_F-P3KENr'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
