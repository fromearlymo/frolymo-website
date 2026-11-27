'use strict';
(() => {
  const {call, renderArticle} = window.FrolymoMagazine;
  const id = new URL(location.href).searchParams.get('id');
  const notice = document.querySelector('#notice');
  const article = document.querySelector('#article');
  const share = document.querySelector('#share');
  const retry = document.querySelector('#retry');
  async function load() {
    retry.hidden = share.hidden = article.hidden = document.querySelector('#open-app').hidden = true;
    document.querySelector('#fallback-title').hidden = false;
    notice.textContent = '기사를 불러오고 있습니다.';
    if (!id || !/^[\w-]{1,128}$/.test(id)) {
      notice.textContent = '공유받은 기사 링크를 열어 주세요.';
      return;
    }
    try {
      const data = await call('publicArticle', {id});
      if (!data.article?.title) throw new Error('공개된 기사를 찾을 수 없습니다.');
      renderArticle(article, data.article);
      document.querySelector('#fallback-title').hidden = true;
      document.title = data.article.title + ' · 현장 이야기';
      notice.textContent = '';
      const app = document.querySelector('#open-app');
      app.href = 'frolymo-magazine://article/' + encodeURIComponent(id);
      app.hidden = share.hidden = article.hidden = false;
    } catch (err) {
      notice.textContent = err.message;
      retry.hidden = false;
    }
  }
  retry.onclick = load;
  share.onclick = async () => {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('id', id);
    try {
      if (navigator.share) await navigator.share({title: document.title, url: url.href});
      else {
        await navigator.clipboard.writeText(url.href);
        notice.textContent = '기사 링크를 복사했습니다.';
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      const field = document.querySelector('#share-url');
      field.value = url.href; field.hidden = false; field.select();
      notice.textContent = '선택된 기사 주소를 복사해 주세요.';
    }
  };
  load();
})();
