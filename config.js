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

(function () {
  'use strict';
  const response = await fetch('/get-config');
  const config = await response.json();
  
  var DEFAULT_CONFIG = {
    SUPABASE_URL: config.SUPABASE_URL,
    SUPABASE_ANON_KEY: config.SUPABASE_ANON_KEY,
  };

  var LOCAL_CONFIG = window.APP_CONFIG_LOCAL || {};

  var merged = {};
  var keys = Object.keys(DEFAULT_CONFIG);

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    merged[key] = Object.prototype.hasOwnProperty.call(LOCAL_CONFIG, key)
      ? LOCAL_CONFIG[key]
      : DEFAULT_CONFIG[key];
  }

  function isValidUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
  }

  if (!merged.SUPABASE_URL || !merged.SUPABASE_ANON_KEY) {
    console.warn(
      '[Supabase Config] 缺少配置：SUPABASE_URL 或 SUPABASE_ANON_KEY 为空。\n' +
        '请复制 config.local.js.example 为 config.local.js 并填写真实值。'
    );
  } else if (!isValidUrl(merged.SUPABASE_URL)) {
    console.warn(
      '[Supabase Config] SUPABASE_URL 格式可能不正确：' + merged.SUPABASE_URL
    );
  }

  window.APP_CONFIG = merged;
})();