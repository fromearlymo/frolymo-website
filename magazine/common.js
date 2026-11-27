'use strict';
window.FrolymoMagazine = (() => {
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function webUrl(value) {
    if (!value) return '';
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    } catch { return ''; }
  }
  async function call(action, body = {}, token = '') {
    const endpoint = window.FROLYMO_CONFIG?.magazineApiUrl;
    if (!/^https:\/\/asia-northeast3-[a-z0-9-]+\.cloudfunctions\.net\/magazineApi$/.test(endpoint || '')) {
      throw new Error('매거진 서버 연결을 준비하고 있습니다.');
    }
    const headers = {'Content-Type': 'application/json'};
    if (token) headers.Authorization = 'Magazine ' + token;
    let response;
    try {
      response = await fetch(endpoint, {method: 'POST', headers, credentials: 'omit',
        cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', body: JSON.stringify({...body, action})});
    } catch { throw new Error('네트워크 연결을 확인하고 다시 시도해 주세요.'); }
    let data;
    try { data = await response.json(); } catch { throw new Error('서버 응답을 읽을 수 없습니다.'); }
    if (!response.ok || data.error) {
      const fallback = {401:'운영자 세션이 만료되었습니다. 앱에서 편집기를 다시 열어 주세요.',
        403:'이 작업을 수행할 권한이 없습니다.', 404:'공개된 콘텐츠를 찾을 수 없습니다.',
        409:'다른 곳에서 글을 수정했습니다. 최신 버전을 다시 열어 주세요.'};
      const err = new Error(data.error?.message || fallback[response.status] || '요청을 처리하지 못했습니다.');
      err.status = response.status; err.code = data.error?.code; throw err;
    }
    return data;
  }
  function date(value) {
    const d = new Date(value);
    return value && Number.isFinite(d.getTime())
      ? new Intl.DateTimeFormat('ko-KR', {dateStyle:'medium', timeZone:'Asia/Seoul'}).format(d) : '';
  }
  function link(label, rawUrl) {
    const url = webUrl(rawUrl);
    const node = el(url ? 'a' : 'span', label || url);
    if (url) { node.href = url; node.rel = 'noopener noreferrer'; node.target = '_blank'; }
    return node;
  }
  function picture(url, caption = '') {
    const box = el('figure');
    if (!webUrl(url)) return box;
    const img = el('img'); img.src = webUrl(url); img.alt = caption; img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer'; box.append(img);
    if (caption) box.append(el('figcaption', caption));
    return box;
  }
  function renderArticle(root, data) {
    root.replaceChildren();
    const typeLabels = {news:'뉴스 소개', column:'칼럼', brand:'브랜드 이야기', product:'제품 소식'};
    const categoryNames = {news:'건설 뉴스',column:'프롤리모 칼럼',future:'현장의 미래',safety:'현장 안전',life:'현장 라이프',people:'사람과 이야기',brand:'프롤리모 이야기'};
    const labels = new Set([data.categoryLabel || categoryNames[data.category] || data.category,typeLabels[data.type]]);
    root.append(el('p', [...labels].filter(Boolean).join(' · '), 'kicker'),
      el('h1', data.title || '제목 없는 글'));
    if (data.subtitle) root.append(el('p', data.subtitle, 'deck'));
    const count = (data.blocks || []).map(b => b.text || '').join('').length;
    root.append(el('p', [data.author || data.source, date(data.publishedAt),
      (data.readingMinutes || Math.max(1, Math.ceil(count / 500))) + '분 읽기'].filter(Boolean).join(' · '), 'byline'));
    if (data.type === 'news' && webUrl(data.sourceUrl)) {
      const source = el('p',null,'original');
      source.append(link((data.source || '언론사')+'에서 뉴스 원문 읽기',data.sourceUrl));
      root.append(source);
    }
    if (data.image) root.append(picture(data.image));
    let list;
    for (const b of data.blocks || []) {
      if (!b || !b.type) continue;
      if (b.type === 'bullet' || b.type === 'number') {
        const tag = b.type === 'bullet' ? 'ul' : 'ol';
        if (list?.localName !== tag) { list = el(tag); root.append(list); }
        const item = el('li', b.text);
        if (['left','center','right'].includes(b.align)) item.style.textAlign = b.align;
        list.append(item); continue;
      }
      list = null;
      let node;
      if (b.type === 'image') node = picture(b.url, b.caption);
      else if (b.type === 'link') node = link(b.text || b.url, b.url);
      else if (b.type === 'table') {
        node = el('div', null, 'table-wrap');
        const table = el('table'); node.append(table);
        (b.rows || []).forEach((cells, i) => {
          const row = table.insertRow();
          for (const text of cells) {
            const cell = el(i ? 'td' : 'th', text);
            if (!i) cell.scope = 'col'; row.append(cell);
          }
        });
      } else if (b.type === 'divider') node = el('hr');
      else {
        const tag = {paragraph:'p', heading:'h2', bold:'strong', quote:'blockquote'}[b.type];
        if (!tag) continue;
        node = el(tag, b.text);
      }
      if (['left','center','right'].includes(b.align)) node.style.textAlign = b.align;
      root.append(node);
    }
    const sources = [...(data.sources || [])];
    if (data.sourceUrl) sources.unshift({label:[data.source || '원문', data.sourceDate].filter(Boolean).join(' · '), url:data.sourceUrl});
    if (sources.length) {
      const refs = el('section', null, 'refs'); refs.append(el('h2','참고 자료와 출처'));
      const ul = el('ul'); refs.append(ul);
      for (const s of sources) { const li = el('li'); li.append(link(s.label || s.url,s.url)); ul.append(li); }
      root.append(refs);
    }
    if (data.correction) root.append(el('p', '정정 안내 · ' + data.correction, 'refs'));
    if (data.tags?.length) root.append(el('p',data.tags.map(t => '#' + t).join(' '), 'tags'));
  }
  return {el, webUrl, call, date, renderArticle};
})();
