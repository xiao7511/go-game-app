/**
 * ============================================================================
 * config.js — Supabase 运行时配置加载器 (优化版)
 * ============================================================================
 */

(async function () {
  'use strict';

  // 1. 基础配置容器
  var finalConfig = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
  };

  // 2. 尝试从后端/Worker 获取配置 (例如 Cloudflare Pages Functions)
  try {
    const response = await fetch('/get-config'); 
    if (response.ok) {
      const remoteConfig = await response.json();
      if (remoteConfig.SUPABASE_URL) finalConfig.SUPABASE_URL = remoteConfig.SUPABASE_URL;
      if (remoteConfig.SUPABASE_ANON_KEY) finalConfig.SUPABASE_ANON_KEY = remoteConfig.SUPABASE_ANON_KEY;
      console.log('[Config] 已从远程接口加载配置');
    }
  } catch (e) {
    console.log('[Config] 未能从远程接口获取配置，将尝试本地/注入配置');
  }

  // 3. 读取本地 config.local.js 中的配置 (由构建流程注入)
  // 注意：变量名需与 config.local.js 中保持一致
  var LOCAL_CONFIG = window.APP_CONFIG_LOCAL || window.LOCAL_CONFIG || {};

  // 4. 合并配置 (本地/注入配置 优先级最高)
  if (LOCAL_CONFIG.SUPABASE_URL) finalConfig.SUPABASE_URL = LOCAL_CONFIG.SUPABASE_URL;
  if (LOCAL_CONFIG.SUPABASE_ANON_KEY) finalConfig.SUPABASE_ANON_KEY = LOCAL_CONFIG.SUPABASE_ANON_KEY;

  // 5. 【核心修复】URL 自动清洗逻辑
  // 强制删除可能存在的 /rest/v1 后缀，并去除前后空格
  if (finalConfig.SUPABASE_URL) {
    finalConfig.SUPABASE_URL = finalConfig.SUPABASE_URL
      .trim()
      .replace(/\/rest\/v1\/?$/, '')
      .replace(/\/$/, ''); // 同时移除末尾多余的斜杠
  }

  // 6. 校验逻辑
  function isValidUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
  }

  if (!finalConfig.SUPABASE_URL || !finalConfig.SUPABASE_ANON_KEY) {
    console.error(
      '[Supabase Config] 严重错误：未找到有效配置，请检查环境变量或 config.local.js'
    );
  } else if (!isValidUrl(finalConfig.SUPABASE_URL)) {
    console.error(
      '[Supabase Config] URL 格式非法，请检查：' + finalConfig.SUPABASE_URL
    );
  }

  // 7. 挂载到全局
  window.APP_CONFIG = finalConfig;
  console.log('[Config] 全局配置已就绪:', window.APP_CONFIG);
  
  // 8. 发送就绪事件，通知其他业务脚本 (如 login.js, game.js)
  window.dispatchEvent(new CustomEvent('configReady', { detail: finalConfig }));
})();