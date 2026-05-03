/**
 * ============================================================================
 *  supabaseClient.js — Supabase 客户端（单例 / 懒初始化）
 * ============================================================================
 *
 *  ⚠️  安全: 此文件不包含任何硬编码密钥。
 *      所有凭据均从 window.APP_CONFIG 读取（由 config.js 注入）。
 *
 *  使用方式 (ES Module):
 *    import { getSupabase } from './supabaseClient.js';
 *    const supabase = getSupabase();
 *
 *  使用方式 (传统 script 标签):
 *    本项目通过 CDN 加载 supabase-js (window.supabase)。
 *    此文件提供单例封装，避免重复初始化。
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js'

// --- 单例实例 ---
let _instance = null;

/**
 * 获取 Supabase 客户端实例（懒加载 + 单例）
 *
 * @throws {Error} 当 APP_CONFIG 缺失或无效时抛出明确错误
 * @returns {object} Supabase 客户端实例
 */
export function getSupabase() {
  if (_instance) {
    return _instance;
  }

  // --- 从统一配置源读取 ---
  const config = window.APP_CONFIG || {};

  const url = (config.SUPABASE_URL || '').trim();
  const key = (config.SUPABASE_ANON_KEY || '').trim();

  // --- 环境校验 ---
  if (!url) {
    throw new Error(
      '[Supabase] SUPABASE_URL 未配置。\n' +
      '请检查 config.local.js 或环境变量是否正确设置。\n' +
      '详见项目根目录下的 .env.example。'
    );
  }

  if (!key) {
    throw new Error(
      '[Supabase] SUPABASE_ANON_KEY 未配置。\n' +
      '请检查 config.local.js 或环境变量是否正确设置。\n' +
      '详见项目根目录下的 .env.example。'
    );
  }

  // --- 创建实例 ---
  _instance = createClient(url, key, {
    db: {
      schema: 'game' // 将默认 Schema 设置为 game
    }
  });

  if (import.meta.env.DEV) {
    console.log('[Supabase] 客户端初始化成功');
  }

  return _instance;
}

/**
 * 重置单例（用于测试或重新认证场景）
 */
export function resetSupabase() {
  _instance = null;
}

// 同时挂载到 window 对象，保持兼容传统 script 引入方式
if (typeof window !== 'undefined') {
  window.getSupabase = getSupabase;
  window.resetSupabase = resetSupabase;
}
