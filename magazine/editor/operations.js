'use strict';
(() => {
  const {el,date} = window.FrolymoMagazine;
  const {$,api,canLeave,load,button,input,setCategories,statusNames,hasSession} = window.MagazineDesk;
  const titles = {drafts:'콘텐츠 목록', comments:'댓글 관리', reports:'신고 관리', restrictions:'이용 제한 관리'};
  const operations = {dismiss:'신고 종결',hide:'댓글 숨기기',delete:'댓글 삭제',warn:'작성자 경고',restrict:'기간 제한',release:'제한 해제',restore:'댓글 다시 표시'};
  const typeNames = {news:'뉴스',column:'칼럼',brand:'브랜드',product:'제품'};
  let active, next, entries = [], categories = [], loading = false, generation = 0, target;
  function pane(id) {
    for (const item of ['write','list','stats','settings']) $(item+'-pane').hidden = item !== id;
    for (const tab of document.querySelectorAll('[data-tab]')) tab.setAttribute('aria-current',String(tab.dataset.tab === active));
  }
  function permitted() {
    return active !== 'write' || canLeave();
  }
  function setMode(mode) {
    const current = ++generation; active = mode; $('notice').textContent = ''; loading = false;
    pane(mode === 'write' ? 'write' : ['stats','settings'].includes(mode) ? mode : 'list'); return current;
  }
  function rows() {
    $('rows').replaceChildren(); const filter = active === 'drafts' ? $('filter').value : '';
    const shown = entries.filter(row => {
      if (filter === 'featured') return row.featured === true;
      if (filter === 'candidates') return row.type === 'news' && row.status === 'review';
      return !filter || row.status === filter || row.type === filter;
    });
    if (!shown.length) $('rows').append(el('p',next ? '현재 불러온 항목 중 해당 내용이 없습니다.' : '표시할 항목이 없습니다.'));
    for (const row of shown) {
      const item = el('section',null,'record'), details = el('div');
      if (active === 'drafts') {
        details.append(el('h3',row.title),el('p',[typeNames[row.type],statusNames[row.status],date(row.updatedAt)].filter(Boolean).join(' · ')));
        item.append(details,button('편집',() => open(row.id)));
      } else {
        const isRestriction = active === 'restrictions';
        const heading = isRestriction ? (row.nickname || '제한된 사용자') : active === 'comments' ? (row.nickname || '작성자') : (row.reason || '신고');
        details.append(el('h3',heading));
        if (isRestriction) details.append(el('p','제한 해제일 · '+date(row.restrictedUntil)));
        else {
          if (row.text || row.detail) details.append(el('p',row.text || row.detail));
          const labels = {open:'접수',resolved:'처리 완료',visible:'표시 중',hidden:'숨김',deleted:'삭제'};
          details.append(el('small',[labels[row.status] || row.status, date(row.createdAt || row.at)].filter(Boolean).join(' · ')));
        }
        item.append(details);
        if (!['deleted','resolved'].includes(row.status)) item.append(button('조치 선택',() => moderate(row)));
      }
      $('rows').append(item);
    }
    $('more').hidden = !next;
  }
  async function page(append = false) {
    if (loading) return;
    loading = true; $('more').disabled = true; const current = generation;
    try {
      const r = await api('adminList',{mode:active,...(append && next ? {cursor:next} : {})});
      if (current !== generation) return;
      if (!Array.isArray(r.items)) throw new Error('목록을 읽을 수 없습니다.');
      categories = r.categories || categories; setCategories(categories);
      entries = append ? entries.concat(r.items) : r.items; next = r.nextCursor; rows();
    } catch (err) { if (current === generation) $('notice').textContent = err.message; }
    finally { if (current === generation) { loading = false; $('more').disabled = false; } }
  }
  async function open(id) {
    const current = generation;
    try {
      const r = await api('adminRead',{id}); if (current !== generation || !permitted()) return;
      setMode('write'); load(r.draft,r.history); $('write-pane').scrollIntoView();
    } catch (err) {if (current === generation) $('notice').textContent = err.message;}
  }
  const numbers = {todayCandidates:'오늘 수집한 후보',review:'검토 중',publishedNews:'게시한 뉴스',publishedColumns:'게시한 칼럼',scheduled:'예약 게시',
    views:'조회',likes:'좋아요',comments:'댓글',scraps:'스크랩',reports:'신고 접수',openReports:'미처리 신고'};
  function stats(data) {
    const root = $('stats'), grid = el('dl',null,'metrics'); root.replaceChildren(grid);
    for (const [key,label] of Object.entries(numbers)) {
      const box = el('div'); box.append(el('dt',label),el('dd',typeof data[key] === 'number' ? data[key].toLocaleString('ko-KR') : '집계 없음')); grid.append(box);
    }
    for (const [key,title] of [['popular','많이 읽은 콘텐츠'],['categories','카테고리별 조회']]) {
      root.append(el('h3',title)); const list = el('ul');
      for (const r of [...(data[key] || [])].sort((a,b)=>b.views-a.views)) {
        const total = Number.isFinite(r.views) ? r.views.toLocaleString('ko-KR')+'회' : '집계 없음';
        list.append(el('li',(r.title || r.label)+' · '+total));
      }
      if (!list.children.length) list.append(el('li','집계된 항목이 없습니다.')); root.append(list);
    }
  }
  function category(value = {}) {
    const row = el('div',null,'item source');
    const key = input('식별자 (영문·숫자)',value.id), name = input('표시할 이름',value.label);
    key.control.required = name.control.required = true; key.control.pattern = '[a-zA-Z0-9_\\-]{1,128}'; name.control.maxLength=25;
    if (value.id) key.control.readOnly = true;
    row.append(key.field,name.field,button('제거',() => row.remove())); row.read = () => ({id:key.control.value.trim(),label:name.control.value.trim()}); $('category-list').append(row);
  }
  function settings(data) {
    $('rss').checked = data.enabled === true; $('frequency').value = String(data.frequency || 1); $('comments-enabled').checked = data.commentsEnabled === true;
    $('category-list').replaceChildren(); categories.forEach(category);
  }
  async function change(mode) {
    if (!permitted()) return;
    const current = setMode(mode);
    if (mode === 'write') {load(); return;}
    if (titles[mode]) {
      $('list-title').textContent = titles[mode]; $('filter-box').hidden = mode !== 'drafts'; $('rows').replaceChildren(); $('more').hidden = true;
      next = null; entries = []; await page(); return;
    }
    const panel = $(mode+'-pane'); panel.hidden = true;
    try {
      const r = await api('adminStats'); if (current !== generation) return;
      if (!r.stats) throw new Error('운영 정보를 읽을 수 없습니다.');
      if (mode === 'stats') stats(r.stats); else settings(r.stats);
      panel.hidden = false;
    } catch (err) {if (current === generation) $('notice').textContent = err.message;}
  }
  async function saveSettings(event,action,body) {
    event.preventDefault(); const b = event.currentTarget.querySelector('button:not([type="button"])');
    b.disabled = true; const current = generation;
    try {
      const r = await api(action,body);
      if (current !== generation) return;
      if (action === 'adminCategories') { categories = r.items || body.categories; setCategories(categories); }
      $('notice').textContent = '변경 사항을 서버에 저장했습니다.';
    } catch(err) { if (current === generation) $('notice').textContent = err.message; }
    finally { b.disabled = false; }
  }
  function moderate(row) {
    target = {row,mode:active};
    const actions = active === 'restrictions' ? ['release'] : [
      ...(active === 'reports' ? ['dismiss'] : []),
      ...(row.commentId ? [row.status === 'hidden' ? 'restore' : 'hide','delete'] : []),
      ...(row.author ? ['warn','restrict'] : [])];
    $('operation').replaceChildren(...actions.map(a => new Option(operations[a],a)));
    $('moderation-form').reset(); $('moderation-status').textContent = ''; $('days-box').hidden = true; $('moderation').showModal();
  }
  $('moderation-form').onsubmit = async e => {
    e.preventDefault(); const b = e.submitter; b.disabled = true;
    const {row,mode} = target, operation = $('operation').value;
    if (operation === 'delete' && !confirm('이 댓글 내용을 삭제할까요?')) { b.disabled=false; return; }
    try {
      await api('adminModerate',{...(mode === 'reports' ? {reportId:row.reportId} : mode === 'restrictions' ? {author:row.id} : {id:row.id,commentId:row.commentId}),
        reason:$('reason').value.trim(),operation,...(operation==='restrict'?{days:Number($('days').value)}:{})});
      $('moderation').close(); await change(mode); $('notice').textContent = '조치를 적용했습니다.';
    } catch(err) { $('moderation-status').textContent = err.message; } finally { b.disabled=false; }
  };
  $('operation').onchange = () => {$('days-box').hidden = $('operation').value !== 'restrict';};
  $('cancel-moderation').onclick = () => $('moderation').close();
  $('ops-settings').onsubmit = e => saveSettings(e,'adminSources',{enabled:$('rss').checked,frequency:Number($('frequency').value),commentsEnabled:$('comments-enabled').checked});
  $('category-form').onsubmit = e => saveSettings(e,'adminCategories',{categories:Array.from($('category-list').children,r=>r.read())});
  $('add-category').onclick = () => category(); $('filter').onchange = rows; $('more').onclick = () => page(true);
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>change(b.dataset.tab));
  async function start() {
    if (!hasSession()) { $('desktop-login').hidden = false; $('notice').textContent = '운영자 계정으로 앱에 로그인한 뒤 매거진 편집실을 열어 주세요.'; return; }
    try {
      const r = await api('adminList',{mode:'drafts'});
      if (!Array.isArray(r.items) || !Array.isArray(r.categories)) throw new Error('편집실의 운영자 정보를 확인할 수 없습니다.');
      $('app').hidden = false; setMode('drafts'); categories = r.categories; setCategories(categories); entries = r.items; next = r.nextCursor; rows();
    } catch (err) { $('notice').textContent = err.message; }
  }
  $('desktop-login').onsubmit = async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try {
      await window.MagazineDesk.connect($('desktop-code').value.trim());
      $('desktop-code').value = ''; $('desktop-login').hidden = true;
      if ($('app').hidden) await start();
      else $('notice').textContent = '다시 연결했습니다. 작성하던 내용을 저장할 수 있습니다.';
    } catch (err) { $('notice').textContent = err.message; } finally { button.disabled = false; }
  };
  start();
})();
