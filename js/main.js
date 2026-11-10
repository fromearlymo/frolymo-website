(() => {
  'use strict';
  const config = window.FROLYMO_CONFIG || {};
  const menuButton = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('#primary-navigation');
  const closeMenu = () => {
    if (!menuButton || !menu) return;
    menuButton.setAttribute('aria-expanded', 'false');
    menu.dataset.open = 'false';
  };
  menuButton?.addEventListener('click', () => {
    const opening = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(opening));
    menu.dataset.open = String(opening);
  });
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menuButton.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!menu?.contains(event.target) && !menuButton?.contains(event.target)) closeMenu();
  });
  const safeUrl = (value, domains) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password &&
        (!domains || domains.includes(url.hostname)) ? url.href : null;
    } catch { return null; }
  };
  const release = config.release || {};
  const links = {
    android: release.status === 'released' ? safeUrl(release.androidUrl, ['play.google.com']) : null,
    ios: release.status === 'released' ? safeUrl(release.iosUrl, ['apps.apple.com']) : null
  };
  for (const [platform, url] of Object.entries(links)) {
    if (!url) continue;
    const slot = document.querySelector(`[data-download="${platform}"]`);
    if (!slot) continue;
    const link = document.createElement('a');
    link.className = 'store-link is-available';
    link.href = url;
    link.textContent = platform === 'android' ? 'Google Play에서 다운로드 ↗' : 'App Store에서 다운로드 ↗';
    slot.replaceChildren(link);
  }
  if (links.android || links.ios) {
    document.querySelectorAll('[data-release-label]').forEach(node => { node.textContent = '앱 출시 안내'; });
    document.querySelectorAll('[data-release-description]').forEach(node => {
      node.textContent = '공식 스토어에서 FROLYMO를 만나보세요. 다운로드 가능한 플랫폼은 아래에서 확인하실 수 있어요.';
    });
    document.querySelectorAll('[data-prelaunch-only]').forEach(node => { node.hidden = true; });
  }
  const contact = config.contact || {};
  const email = typeof contact.email === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact.email) ? contact.email : null;
  const contactUrl = safeUrl(contact.url);
  const target = document.querySelector('[data-contact-target]');
  if (target && (email || contactUrl)) {
    const link = document.createElement('a');
    link.className = 'text-link';
    link.href = email ? `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}` : contactUrl;
    link.textContent = email || '공식 문의하기 ↗';
    target.replaceChildren(link);
    const notice = document.querySelector('[data-contact-notice]');
    if (notice) notice.textContent = '서비스와 브랜드에 관한 문의를 보내 주세요.';
  }
})();
