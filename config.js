/**
 * ============================================================================
 *  config.js — Supabase 运行时配置加载器
 * ============================================================================
 *
 * ⚠️  安全警告: 此文件不包含任何真实密钥。
 *     真实密钥通过以下两种方式注入:
 *
 *     1. 本地开发: 创建 config.local.js (已在 .gitignore 中排除)
 *        格式见项目根目录下的 .env.example
 *
 *     2. CI/CD 部署: GitHub Actions 从 GitHub Secrets 读取
 *        SUPABASE_URL / SUPABASE_ANON_KEY 并动态生成此文件
 *
 *     严禁将 config.local.js 或任何含真实密钥的文件提交到 Git !
 *     git diff --cached 确认无误后再 commit。
 * ============================================================================
 */

(function () {
  'use strict';

  // --- 默认占位值（不含真实密钥，仅用于开发阶段的结构校验）---
  var DEFAULT_CONFIG = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: ''
  };

  // --- 加载本地覆盖配置（仅本地开发环境存在）---
  // config.local.js 应定义 window.APP_CONFIG_LOCAL 对象
  // 格式: window.APP_CONFIG_LOCAL = { SUPABASE_URL: '...', SUPABASE_ANON_KEY: '...' };
  var LOCAL_CONFIG = window.APP_CONFIG_LOCAL || {};

  // --- 合并配置（优先级: 本地覆盖 > 默认值）---
  var merged = {};
  var keys = Object.keys(DEFAULT_CONFIG);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    merged[k] = LOCAL_CONFIG.hasOwnProperty(k) ? LOCAL_CONFIG[k] : DEFAULT_CONFIG[k];
  }

  // --- 环境校验（生产部署时由 CI 注入真实值，因此可能为空）---
  // 仅在浏览器环境下输出友好的缺失提示
  if (!merged.SUPABASE_URL || !merged.SUPABASE_ANON_KEY) {
    console.warn(
      '[Supabase Config] ⚠️  配置缺失: SUPABASE_URL 或 SUPABASE_ANON_KEY 为空。\n' +
      '  本地开发请创建 config.local.js 文件（参考 .env.example）。\n' +
      '  生产环境请确认 GitHub Actions Secrets 已正确配置。'
    );
  }

  // --- 导出全局配置 ---
  window.APP_CONFIG = merged;
})();
