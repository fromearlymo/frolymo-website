'use strict';
window.MagazineDesk = (() => {
  const {el, renderArticle, date, call} = window.FrolymoMagazine;
  const $ = id => document.getElementById(id);
  let session = new URLSearchParams(location.hash.slice(1)).get('session') || '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const api = async (action, body) => {
    try { return await call(action, body, session); }
    catch (err) {
      if (err.status === 401) $('desktop-login').hidden = false;
      throw err;
    }
  };
  const blockNames = {paragraph:'문단', heading:'소제목', bold:'굵은 글', bullet:'글머리 기호',
    number:'번호 목록', quote:'인용문', divider:'구분선', link:'링크', image:'이미지', table:'표'};
  const statusNames = {draft:'작성 중', review:'검토 중', scheduled:'예약 게시', published:'게시 완료', private:'비공개', archived:'보관'};
  const fields = ['title','subtitle','category','author','type','source','sourceUrl','sourceDate','image','correction','rights'];
  let categories = [], id, revision, savedState, timer, dirty = false, busy = false, conflict = false, generation = 0;
  function button(label, fn) {
    const b = el('button',label); b.type = 'button'; b.onclick = fn; return b;
  }
  function input(label, value = '', kind = 'text') {
    const field = el('label',label);
    const control = el(kind === 'area' ? 'textarea' : 'input');
    if (kind !== 'area') control.type = kind;
    control.value = value || ''; field.append(control);
    return {field,control};
  }
  let uploads = 0;
  function uploadInput(label, field) {
    const { field: box, control } = input(label, '', 'file');
    control.accept = 'image/jpeg,image/png,image/webp';
    const feedback = el('small'); feedback.setAttribute('role','status'); box.append(feedback);
    control.addEventListener('change', async () => {
      const file = control.files[0]; if (!file) return;
      uploads++; control.disabled = true; feedback.textContent = '사진을 등록하고 있습니다.';
      const local = URL.createObjectURL(file);
      try {
        if (file.size > 20 * 1024 * 1024) throw Error('20MB 이하의 사진을 선택해 주세요.');
        const img = new Image(); img.src = local; await img.decode();
        const scale = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const jpeg = canvas.toDataURL('image/jpeg',0.82).split(',')[1];
        const result = await api('adminImage',{jpeg});
        if (!window.FrolymoMagazine.webUrl(result.url)) throw Error('사진 주소를 확인하지 못했습니다.');
        field.value = result.url; feedback.textContent = '사진을 등록했습니다.'; changed();
      } catch (err) { feedback.textContent = err.message || '사진을 처리하지 못했습니다.'; }
      finally { URL.revokeObjectURL(local); control.disabled = false; control.value = ''; uploads--; }
    });
    return box;
  }
  $('cover-upload').append(uploadInput('대표 이미지 파일 등록', $('image')));
  function setCategories(items) {
    categories = items; const selected = $('category').value;
    $('category').replaceChildren(...items.map(v => new Option(v.label,v.id)));
    if (items.some(v => v.id === selected)) $('category').value = selected;
  }
  function addSource(value = {}) {
    const row = el('div',null,'item source'); row.dataset.source = '';
    const title = input('자료 이름', value.label), url = input('자료 주소',value.url,'url');
    row.append(title.field,url.field,button('삭제', () => { row.remove(); changed(); }));
    row.read = () => ({label:title.control.value.trim(),url:url.control.value.trim()});
    $('sources').append(row);
  }
  function tableInput(rows) {
    const group = el('div',null,'table-edit'); const grid = el('div',null,'table-wrap');
    const table = el('table'); grid.append(table);
    let columns = Math.max(1,...rows.map(r => r.length));
    function cell(row, value) {
      const td = row.insertCell(), control = el('input');
      control.value = value || ''; control.maxLength = 500; control.setAttribute('aria-label',(row.rowIndex+1)+'행 '+(td.cellIndex+1)+'열'); td.append(control);
    }
    function addRow(row = []) {
      const tr = table.insertRow(); for (let i=0;i<columns;i++) cell(tr,row[i]);
    }
    (rows.length ? rows : [['',''],['','']]).forEach(addRow);
    const controls = el('div',null,'actions');
    controls.append(button('행 추가',() => { if (table.rows.length < 50) {addRow(); changed();} }),
      button('열 추가',() => { if (columns < 10) {columns++; for (const r of table.rows) cell(r,''); changed();} }),
      button('끝 행 지우기',() => { if (table.rows.length > 1 && confirm('마지막 행을 지울까요?')) {table.deleteRow(-1); changed();} }),
      button('끝 열 지우기',() => { if (columns > 1 && confirm('마지막 열을 지울까요?')) {columns--; for (const r of table.rows) r.deleteCell(-1); changed();} }));
    group.append(grid,controls); return {node:group,read:() => Array.from(table.rows,r => Array.from(r.cells,c => c.firstChild.value))};
  }
  function addBlock(value) {
    const {type} = value; if (!blockNames[type]) return;
    const row = el('section',null,'item block'), actions = el('div', null,'heading-actions');
    const tools = el('div',null,'actions');
    tools.append(button('위로',() => { if (row.previousElementSibling) {row.parentNode.insertBefore(row,row.previousElementSibling); changed();} }),
      button('아래로',() => { if (row.nextElementSibling) {row.nextElementSibling.after(row); changed();} }),
      button('삭제',() => {row.remove(); changed();}));
    actions.append(el('h4',blockNames[type]),tools); row.append(actions);
    const text = input('내용',value.text,'area'), url = input('주소',value.url,'url'), caption = input('이미지 설명',value.caption);
    const align = el('select'); for (const [v,k] of [['left','왼쪽'],['center','가운데'],['right','오른쪽']]) align.add(new Option(k,v));
    align.value = value.align || 'left';
    const alignLabel = el('label','정렬'); alignLabel.append(align);
    if (!['image','table','divider'].includes(type)) row.append(text.field,alignLabel);
    if (['image','link'].includes(type)) row.append(url.field);
    if (type === 'image') row.append(uploadInput('본문 이미지 파일 등록',url.control),caption.field);
    const table = type === 'table' ? tableInput(value.rows || [['',''],['','']]) : null;
    if (table) row.append(table.node);
    row.read = () => ({type,text:text.control.value,align:align.value,url:url.control.value.trim(),caption:caption.control.value,...(table ? {rows:table.read()} : {})});
    $('blocks').append(row);
  }
  function draft() {
    const data = Object.fromEntries(fields.map(k => [k,$(k).value.trim()]));
    return {...data,featured:$('featured').checked,tags:$('tags').value.split(',').map(s=>s.trim()).filter(Boolean),
      blocks:Array.from($('blocks').children,b=>b.read()),sources:Array.from($('sources').children,b=>b.read()).filter(s=>s.url||s.label)};
  }
  function load(d = {}, history = []) {
    clearTimeout(timer); generation++; dirty = conflict = false;
    id = d.id || crypto.randomUUID(); revision = d.revision || 0; savedState = d.status || 'draft';
    $('editor').reset(); $('delete-article').hidden = !revision; $('cover-upload').querySelector('small').textContent = '';
    for (const key of fields) {
      $(key).value = d[key] ?? (key === 'category' ? categories[0]?.id || '' : key === 'type' ? 'column' : '');
    }
    $('tags').value = (d.tags || []).join(', '); $('featured').checked = !!d.featured; $('status').value = savedState;
    if (d.publishAt) {
      const dt = new Date(d.publishAt);
      $('publish-at').value = new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
    }
    $('schedule-box').hidden = savedState !== 'scheduled';
    $('blocks').replaceChildren(); for (const b of d.blocks || [{type:'paragraph'}]) addBlock(b);
    $('sources').replaceChildren(); for (const s of d.sources || []) addSource(s);
    $('history').replaceChildren(...history.map(h => el('li',date(h.at)+' · '+statusNames[h.status]+' · '+h.title+' (판 '+h.revision+')')));
    if (!history.length) $('history').append(el('li','이전 수정 이력이 없습니다.'));
    $('reload').hidden = true; $('save').disabled = false; $('save-status').textContent = '';
  }
  function canLeave() {
    if (busy || uploads) { $('notice').textContent = '저장이 끝나면 이동할 수 있습니다.'; return false; }
    if (dirty && !confirm('저장되지 않은 변경 사항이 있습니다. 편집 화면을 떠날까요?')) return false;
    clearTimeout(timer); dirty = false; generation++; return true;
  }
  function changed() {
    dirty = true; generation++;
    if (conflict) return;
    $('save-status').textContent = ['draft','review'].includes(savedState) ? '저장되지 않은 변경 사항이 있습니다.' : '변경 내용을 적용하려면 게시 상태를 확인하고 저장해 주세요.';
    clearTimeout(timer);
    if (['draft','review'].includes(savedState)) timer = setTimeout(() => save(false),1800);
  }
  async function save(explicit) {
    if (uploads) { $('save-status').textContent = '사진 등록이 끝나면 저장해 주세요.'; return; }
    if (busy || conflict || (!dirty && !explicit)) return;
    const state = explicit ? $('status').value : savedState;
    const data = draft();
    if (!data.title) { $('save-status').textContent = '제목을 입력하면 초안을 저장할 수 있습니다.'; return; }
    if (!explicit && !$('editor').checkValidity()) return;
    const publishAt = new Date($('publish-at').value).getTime();
    if (state === 'scheduled' && !(publishAt > Date.now())) { $('save-status').textContent = '미래의 예약 시각을 지정해 주세요.'; return; }
    const version = generation; busy = true; clearTimeout(timer);
    $('save').disabled = true; $('save-status').textContent = '서버에 저장하고 있습니다.';
    try {
      const result = await api('adminSave',{id,revision,draft:data,status:state,...(state === 'scheduled' ? {publishAt} : {})});
      if (!result.id || !Number.isInteger(result.revision)) throw new Error('저장 결과를 확인하지 못했습니다.');
      id = result.id; revision = result.revision; savedState = state;
      $('delete-article').hidden = false;
      dirty = version !== generation || (!explicit && $('status').value !== savedState);
      $('save-status').textContent = statusNames[state]+' 상태로 저장했습니다. (판 '+revision+')';
      if (dirty && version !== generation && ['draft','review'].includes(savedState)) timer = setTimeout(() => save(false),1800);
    } catch (err) {
      conflict = err.status === 409; $('reload').hidden = !conflict; dirty = true;
      $('save-status').textContent = err.message;
    } finally { busy = false; $('save').disabled = conflict; }
  }
  $('delete-article').onclick = async () => {
    if (busy || uploads || !revision || !confirm('이 글을 삭제할까요? 공개 화면과 편집 목록에서 사라집니다.')) return;
    clearTimeout(timer); busy = true;
    try {
      await api('adminDelete',{id,revision}); load(); busy = false;
      document.querySelector('[data-tab=drafts]').click();
    } catch (err) { $('save-status').textContent = err.message; } finally { busy = false; }
  };
  $('editor').addEventListener('input', e => { if (e.target.type !== 'file') changed(); });
  $('editor').addEventListener('submit', e => {e.preventDefault(); save(true);});
  $('status').onchange = () => { $('schedule-box').hidden = $('status').value !== 'scheduled'; };
  $('add-block').onclick = () => {addBlock({type:$('block-type').value}); changed();};
  $('add-source').onclick = () => {addSource(); changed();};
  $('preview-button').onclick = () => {
    const data = draft(); data.categoryLabel = $('category').selectedOptions[0]?.text;
    renderArticle($('preview').querySelector('article'),data); $('preview').showModal();
  };
  $('close-preview').onclick = () => $('preview').close();
  $('duplicate').onclick = () => {
    if (busy) return;
    const data = draft(); if (!canLeave()) return; load({...data,title:data.title+' (복사본)'}); changed();
  };
  $('reload').onclick = async () => {
    if (!confirm('편집 중인 내용을 서버에 저장된 글로 교체할까요?')) return;
    try { const r = await api('adminRead',{id}); load(r.draft,r.history); }
    catch(err) { $('save-status').textContent = err.message; }
  };
  window.addEventListener('beforeunload', e => {if (dirty || busy) { e.preventDefault(); e.returnValue = ''; }});
  return {$,api,canLeave,load,button,input,setCategories,statusNames,hasSession:() => !!session, connect:async code => { const r = await call('redeemDesktopCode',{code}); if (!r.token) throw Error('연결을 확인하지 못했습니다.'); session = r.token; }};
})();
