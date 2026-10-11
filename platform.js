(() => {
  'use strict';
  const native = () => window.NOBI_BUILD_TARGET === 'mobile' || !!window.Capacitor?.isNativePlatform?.();
  const mobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.NobiPlatform = Object.freeze({ isNative: native, isMobile: mobile, canUsePCGames: () => !native() && !mobile() });
})();
