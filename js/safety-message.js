(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const form = el("compose");
  const fields = form.querySelector("fieldset");
  const fragment = new URLSearchParams(location.hash.slice(1));
  const shareToken = fragment.get("token") || "";
  let manageToken = fragment.get("manage") || "";
  let requestId = crypto.randomUUID();
  let booking;
  let busy = false;
  const endpoint = window.FROLYMO_CONFIG?.safetyApiUrl;
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const configured = typeof endpoint === "string" && (
    /^https:\/\/asia-northeast3-[a-z0-9-]+\.cloudfunctions\.net\/safetyApi$/.test(endpoint) ||
    (local && /^http:\/\/(localhost|127\.0\.0\.1):\d+\/[a-z0-9-]+\/asia-northeast3\/safetyApi$/.test(endpoint))
  );
  const status = message => { el("status").textContent = message; };
  // Fragments stay out of HTTP requests and referrers. Keep them across reloads.
  el("code").value = fragment.get("code") || "";
  if (shareToken) { el("code").readOnly = true; el("code").placeholder = "공유 링크로 연결했어요"; }
  const updateCount = () => { el("count").textContent = Array.from(el("body").value).length + " / 200자"; };
  const updateDate = () => {
    el("date-label").hidden = el("schedule").value === "next";
    el("date").required = !el("date-label").hidden;
  };
  el("date").min = new Date(Date.now() + 9*3600000).toISOString().slice(0,10);
  el("schedule").onchange = updateDate;
  el("body").oninput = updateCount;
  for (const line of ["밥 꼭 챙겨 먹고 너무 무리하지 마.", "언제나 당신을 응원하고 있어요.", "오늘도 고생 많아. 저녁에 웃는 얼굴로 만나자."]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = line;
    button.onclick = () => { el("body").value = line; updateCount(); el("body").focus(); };
    el("suggestions").append(button);
  }
  async function post(route, data) {
    const response = await fetch(endpoint + "/public/" + route, {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(data),
      cache:"no-store", credentials:"omit", referrerPolicy:"no-referrer", redirect:"error"
    });
    const value = await response.json();
    if (!response.ok || value?.error) throw new Error(value?.error?.message || "예약 상태를 확인할 수 없어요.");
    return value;
  }
  function showReceipt(data) {
    booking = data;
    const editable = ["pending","queued","planned"].includes(data.status);
    form.hidden = true;
    el("receipt").hidden = false;
    el("receipt-text").textContent = data.text;
    el("receipt-info").textContent = [data.date, ({pending:"발신자 승인 대기 중",queued:"예약됨",planned:"전달 대기 중",cancelled:"취소됨",canceled:"취소됨",delivered:"전달됨"})[data.status] || "예약 상태를 확인해 주세요", data.thanked ? ({heart:"❤️ 고마워요",smile:"😊 웃어요",thumbsUp:"👍 최고예요"})[data.reaction] || "❤️ 고마워요" : ""].filter(Boolean).join(" · ");
    el("edit").hidden = el("cancel").hidden = !editable;
  }
  async function transact(action) {
    if (busy) return;
    busy = true; fields.disabled = true;
    try { await action(); }
    catch (e) { status(e instanceof TypeError ? "연결할 수 없어요. 잠시 후 다시 시도해 주세요." : e.message); }
    finally { busy = false; fields.disabled = !configured; }
  }
  form.onsubmit = e => {
    e.preventDefault();
    if (!configured || !form.reportValidity()) return;
    transact(async () => {
      const text = el("body").value.trim();
      const date = el("schedule").value === "date" ? el("date").value : null;
      if (manageToken) {
        const data = await post("manage", {action:"edit",manageToken,text,date});
        showReceipt(data); status("예약을 수정했어요."); return;
      }
      const code = el("code").value.trim().toUpperCase();
      const name = el("name").value.trim();
      const relation = el("relation").value.trim();
      const key = "frolymo-sender:" + (code || shareToken);
      let senderToken;
      try { senderToken = localStorage.getItem(key); } catch { /* Storage is optional. */ }
      const data = await post("send", {...(shareToken ? {shareToken} : {code}),name,relation,text,date,senderToken,requestId});
      if (!data.manageToken || !data.date) throw new Error("접수 결과를 확인할 수 없어요. 같은 화면에서 다시 시도해 주세요.");
      manageToken = data.manageToken;
      try { localStorage.setItem(key,data.senderToken); } catch { /* Approval may be needed again. */ }
      history.replaceState(null,"","#manage=" + encodeURIComponent(manageToken));
      showReceipt({...data,text,name,relation});
      status("예약을 접수했어요.");
    });
  };
  el("edit").onclick = () => {
    if (busy || !booking) return;
    el("identity").hidden = true; el("name").required = false;
    el("body").value = booking.text;
    el("schedule").value = "date"; el("date").value = booking.date;
    updateCount(); updateDate(); el("receipt").hidden = true; form.hidden = false;
    el("submit").textContent = "수정한 예약 저장"; el("body").focus();
  };
  el("cancel").onclick = () => {
    if (!busy && window.confirm("이 안전 메시지 예약을 취소할까요?")) transact(async () => {
      const data = await post("manage",{action:"cancel",manageToken}); showReceipt(data); status("예약을 취소했어요.");
    });
  };
  el("copy").onclick = async () => {
    const url = location.origin + location.pathname + "#manage=" + encodeURIComponent(manageToken);
    try { await navigator.clipboard.writeText(url); status("관리 링크를 복사했어요."); }
    catch { const input = el("copy-fallback"); input.hidden = false; input.value = url; input.select(); }
  };
  if (!configured) { form.hidden = true; status("안전 메시지 예약은 출시 준비 중이에요."); return; }
  fields.disabled = false; status("");
  if (manageToken) {
    form.hidden = true;
    transact(async () => showReceipt(await post("manage",{action:"view",manageToken})));
  } else { el("code").required = !shareToken; }
})();
