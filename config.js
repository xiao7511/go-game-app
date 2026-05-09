/**
 * ============================================================================
 *  config.js — Supabase 运行时配置加载器
 * ============================================================================
 *
 * ⚠️ 安全警告: 此文件不包含任何真实密钥。
 * 真实密钥通过以下两种方式注入:
 *
 * 1. 本地开发: 创建 config.local.js（已在 .gitignore 中排除）
 * 2. 生产部署: 由构建流程或环境变量注入
 *
 * 严禁将包含真实密钥的文件提交到 Git。
 * ============================================================================
 */

(async function () {
  'use strict';

  // 1. 默认配置（初始化为空）
  var DEFAULT_CONFIG = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
  };

  // 2. 尝试从后端/Worker 获取配置 (添加 try-catch 增强健壮性)
  try {
    // 如果你使用 Cloudflare Worker，请将此处替换为完整的 Worker URL
    const response = await fetch('/get-config'); 
    if (response.ok) {
      const remoteConfig = await response.json();
      DEFAULT_CONFIG.SUPABASE_URL = remoteConfig.SUPABASE_URL;
      DEFAULT_CONFIG.SUPABASE_ANON_KEY = remoteConfig.SUPABASE_ANON_KEY;
    }
  } catch (e) {
    console.log('[Config] 未能从远程接口获取配置，尝试使用本地配置');
  }

  // 3. 读取本地 config.local.js 中的配置
  var LOCAL_CONFIG = window.APP_CONFIG_LOCAL || {};

  // 4. 合并配置 (本地优先)
  var merged = {};
  var keys = Object.keys(DEFAULT_CONFIG);

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    merged[key] = Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)
      ? DEFAULT_CONFIG[key]
      : DEFAULT_CONFIG[key];
  }

  // 5. 校验逻辑
  function isValidUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
  }

  if (!merged.SUPABASE_URL || !merged.SUPABASE_ANON_KEY) {
    console.warn(
      '[Supabase Config] 缺少配置：远程接口和本地 config.local.js 均无有效值。'
    );
  } else if (!isValidUrl(merged.SUPABASE_URL)) {
    console.warn(
      '[Supabase Config] SUPABASE_URL 格式不正确：' + merged.SUPABASE_URL
    );
  }

  // 6. 挂载到全局
  window.APP_CONFIG = merged;
  
  // 发送配置就绪事件，通知 login.js 等脚本
  window.dispatchEvent(new CustomEvent('configReady', { detail: merged }));
})();