(() => {
 'use strict';
 const isApp=()=>window.NobiPlatform?.isNative()||window.NOBI_BUILD_TARGET==='mobile';
 const android='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 6.1 4.9 3.5M17.6 6.1l1.5-2.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 10a7 7 0 0 1 14 0H5Zm0 1.5h14V18a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18Z" fill="currentColor"/><g fill="currentColor"><rect x="1.5" y="10.5" width="2.3" height="7.5" rx="1.15"/><rect x="20.2" y="10.5" width="2.3" height="7.5" rx="1.15"/><rect x="7" y="18" width="2.5" height="5" rx="1.2"/><rect x="14.5" y="18" width="2.5" height="5" rx="1.2"/></g><g fill="#10213a"><circle cx="8.6" cy="7.9" r=".8"/><circle cx="15.4" cy="7.9" r=".8"/></g></svg>';
 const apple='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 1.4c.1 1.3-.4 2.6-1.2 3.5-.8 1-2.1 1.6-3.3 1.5-.1-1.2.5-2.5 1.3-3.4.8-.9 2.1-1.6 3.2-1.6ZM20.5 17.1c-.5 1.3-.8 1.9-1.5 3-1 1.5-2.4 3.3-4 3.3-1.5 0-1.9-1-3.9-1s-2.4 1-3.9 1c-1.7 0-3-1.7-4-3.2-2.8-4.2-3.1-9.2-1.4-11.7C3 6.7 4.8 5.7 6.5 5.7c1.8 0 2.9 1 4.4 1 1.4 0 2.3-1 4.4-1 1.5 0 3.1.8 4.3 2.1-3.8 2.1-3.3 7.5.9 9.3Z"/></svg>';
 function render(){
  if(isApp())return '';
  const release=window.NobiAppRelease;
  return `<section class="nobi-app-downloads" aria-label="Nobi 游戏 App 下载"><span class="app-download-label">手机上玩</span><div class="app-download-buttons"><a class="app-download android-download" href="app-downloads/${release.android.file}" download="${release.android.file}" aria-label="下载安卓 App 1.0.2 测试版">${android}<span><b>安卓下载</b><small>${release.android.version} 测试版</small></span></a><button type="button" class="app-download ios-download" data-ios-download aria-label="查看 iOS 内部测试安装说明">${apple}<span><b>iOS 安装</b><small>内部测试</small></span></button></div></section>`;
 }
 let iosDialog;
 function openIos(){
  if(isApp())return;
  if(!iosDialog){iosDialog=document.createElement('dialog');iosDialog.id='nobi-ios-download';iosDialog.className='app-install-dialog';iosDialog.setAttribute('aria-labelledby','app-install-title');iosDialog.innerHTML='<div class="app-install-head"><h2 id="app-install-title">iOS 内部测试</h2><button type="button" data-close-ios aria-label="关闭安装说明">×</button></div><p>Nobi 游戏目前通过 TestFlight 向团队测试人员提供安装。</p><ol><li>在 iPhone 或 iPad 上安装 TestFlight。</li><li>使用团队测试账号，打开 Nobi 游戏的 TestFlight 邀请邮件。</li><li>接受邀请，在 TestFlight 中选择“Nobi 游戏”并安装。</li></ol><p>暂未开放公开邀请链接。未收到邀请时，请联系团队管理员加入测试组。</p><a class="app-testflight-link" target="_blank" rel="noopener noreferrer">安装 TestFlight</a>';iosDialog.querySelector('a').href=window.NobiAppRelease.ios.testFlight;iosDialog.querySelector('[data-close-ios]').onclick=()=>iosDialog.close();document.body.append(iosDialog);}
  if(!iosDialog.open)iosDialog.showModal();
 }
 window.NobiAppDownloads=Object.freeze({render,openIos});
 document.addEventListener('click',event=>{if(event.target.closest('[data-ios-download]'))openIos();});
 const mount=()=>{if(isApp())return;for(const slot of document.querySelectorAll('[data-app-downloads]'))slot.innerHTML=render();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
