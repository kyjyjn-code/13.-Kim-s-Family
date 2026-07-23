/* ==========================================================================
   우리 가족 연대기 — app.js  (Supabase 버전)
   로그인 → 로드/렌더 → 추가/수정/삭제 → 사진 업로드(리사이즈·비공개 서명URL)
   ========================================================================== */
(function () {
  "use strict";
  const CFG = window.CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const BUCKET = "photos";

  let sb = null;
  const state = { all: [], view: [], thumbUrls: {}, formItems: [],
                  recurring: [], schedules: [], calYear: 0, calMonth: 0, viewMode: "timeline", calQ: "" };
  const schedCat = (c) => (CFG.scheduleCategories || {})[c] || (CFG.scheduleCategories || {})["기타"] || { emoji: "📌", color: "#999" };
  const schedCatOf = (c) => ((CFG.scheduleCategories || {})[c] ? c : "기타");

  /* ---------- 유틸 ---------- */
  const catMeta = (c) => (CFG.categories || {})[c] || (CFG.categories || {})["기타"] || { emoji: "⭐" };
  const catOf = (c) => ((CFG.categories || {})[c] ? c : "기타");
  const yearOf = (e) => (/^(\d{4})/.exec(e.date || "") || [])[1] || "?";
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function fmtOne(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
    return m ? `${+m[1]}년 ${+m[2]}월 ${+m[3]}일` : (d || "");
  }
  function fmtDate(e) {
    if (e.date_display) return e.date_display;
    if (e.end_date && e.end_date !== e.date) return `${fmtOne(e.date)} ~ ${fmtOne(e.end_date)}`;
    return fmtOne(e.date);
  }
  const starStr = (n) => (n > 0 ? "★".repeat(Math.min(3, n)) : "");
  const thumbKey = (full) => full.replace(/\/([^/]+)$/, "/thumb/$1");
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
  }

  /* ---------- 헤더 ---------- */
  function ymdElapsed(from, to) {
    let y = to.getFullYear() - from.getFullYear();
    let m = to.getMonth() - from.getMonth();
    let d = to.getDate() - from.getDate();
    if (d < 0) { m -= 1; d += new Date(to.getFullYear(), to.getMonth(), 0).getDate(); }
    if (m < 0) { y -= 1; m += 12; }
    return { y, m, d };
  }
  function renderHeader() {
    if (CFG.siteTitle) { document.title = CFG.siteTitle; $("#site-title").textContent = CFG.siteTitle; }
    if (CFG.siteSubtitle) $("#site-subtitle").textContent = CFG.siteSubtitle;
    $("#event-count").textContent = state.all.filter((e) => e.published !== false).length;

    const box = $("#counters3"); box.innerHTML = "";
    const list = (CFG.counters && CFG.counters.length) ? CFG.counters
      : (CFG.anniversaryDate ? [{ label: "💛 함께한 지", date: CFG.anniversaryDate }] : []);
    const now = new Date();
    list.forEach((c) => {
      const base = new Date(c.date + "T00:00:00");
      if (isNaN(base)) return;
      const days = Math.floor((now - base) / 86400000) + 1;
      const e = ymdElapsed(base, now);
      const parts = [e.y ? `${e.y}년` : "", e.m ? `${e.m}개월` : "", `${e.d}일`].filter(Boolean).join(" ");
      const div = document.createElement("div");
      div.className = "counter3";
      div.innerHTML = `
        <div class="counter3__label">${esc(c.label)}</div>
        <div class="counter3__days"><b>${days.toLocaleString("ko-KR")}</b>일째</div>
        <div class="counter3__ymd">${parts} 지남</div>`;
      box.appendChild(div);
    });
  }

  /* ---------- 서명 URL (비공개 버킷) ---------- */
  async function signThumbs(events) {
    const keys = [];
    events.forEach((e) => (e.photos || []).slice(0, 1).forEach((p) => keys.push(thumbKey(p))));
    if (!keys.length) return;
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(keys, 3600);
    (data || []).forEach((d) => { if (d && d.signedUrl) state.thumbUrls[d.path] = d.signedUrl; });
  }
  async function signOne(key) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(key, 3600);
    return data ? data.signedUrl : "";
  }

  /* ---------- 타임라인 렌더 ---------- */
  const EMPTY_NONE = '아직 기록이 없어요. 오른쪽 아래 <b>＋</b> 버튼으로 첫 기록을 남겨보세요.';
  const EMPTY_FILTERED = '조건에 맞는 기록이 없어요. <button type="button" id="empty-reset" class="btn btn--ghost">필터 초기화</button>';
  function renderTimeline(list) {
    const tl = $("#timeline"); tl.innerHTML = "";
    // 기록이 아예 없는 것과 필터 때문에 0건인 것을 구분한다.
    const emptyEl = $("#empty");
    emptyEl.hidden = list.length > 0;
    if (!list.length) {
      if (state.all.length) {
        emptyEl.innerHTML = EMPTY_FILTERED;
        $("#empty-reset").onclick = resetFilters;
      } else {
        emptyEl.innerHTML = EMPTY_NONE;
      }
    }
    let cur = null;
    list.forEach((e) => {
      const y = yearOf(e);
      if (y !== cur) {
        cur = y;
        const sep = document.createElement("li");
        sep.className = "year-sep";
        sep.innerHTML = `<span class="year-sep__label">${esc(y)}</span><span class="year-sep__line"></span>`;
        tl.appendChild(sep);
      }
      tl.appendChild(card(e));
    });
  }
  function card(e) {
    const li = document.createElement("li");
    li.className = "tl-item" + (e.importance >= 1 ? " is-major" : "") + (e.published === false ? " is-hidden" : "");
    const cat = catOf(e.category), meta = catMeta(cat);
    const members = (e.members || []).map((m) => `<span class="tag">${esc(m)}</span>`).join("");
    const stars = starStr(e.importance);
    const hidden = e.published === false ? `<span class="card__hidden" title="숨김">🙈</span> ` : "";
    const tk = (e.photos && e.photos[0]) ? thumbKey(e.photos[0]) : "";
    const thumb = tk && state.thumbUrls[tk]
      ? `<img class="card__thumb" loading="lazy" src="${state.thumbUrls[tk]}" alt="">` : "";
    const desc = (e.description || "").split("\n")[0];
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "card";
    btn.innerHTML = `
      <div class="card__body">
        <div class="card__top">
          <span class="card__date">${esc(fmtDate(e))}</span>
          <span class="card__topright">
            <span class="card__cat">${meta.emoji} ${esc(cat)}</span>
            ${stars ? `<span class="card__stars">${stars}</span>` : ""}
          </span>
        </div>
        <h3 class="card__title">${hidden}${esc(e.title)}</h3>
        ${members ? `<div class="card__members">${members}</div>` : ""}
        ${desc ? `<p class="card__desc">${esc(desc)}</p>` : ""}
      </div>${thumb}`;
    btn.addEventListener("click", () => openDetail(e));
    li.appendChild(btn);
    return li;
  }

  /* ---------- 필터 ---------- */
  const FILTER_DEFAULTS = () => ({ category: "", member: "", years: new Set(), showHidden: false, q: "" });
  const filters = FILTER_DEFAULTS();
  function buildFilters() {
    const cats = [], seen = new Set(), members = new Set(), years = new Set();
    state.all.forEach((e) => {
      const c = catOf(e.category);
      if (!seen.has(c)) { seen.add(c); cats.push(c); }
      (e.members || []).forEach((m) => members.add(m));
      years.add(yearOf(e));
    });
    const order = Object.keys(CFG.categories || {});
    cats.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    const box = $("#filter-categories"); box.innerHTML = "";
    const mk = (val, label) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip" + (filters.category === val ? " is-active" : "");
      b.dataset.cat = val; b.textContent = label;
      b.addEventListener("click", () => {
        filters.category = filters.category === val ? "" : val;
        $$(".chip", box).forEach((c) => c.classList.toggle("is-active", c.dataset.cat === filters.category));
        applyFilters();
      });
      box.appendChild(b);
    };
    mk("", "전체");
    cats.forEach((c) => mk(c, `${catMeta(c).emoji} ${c}`));

    const msel = $("#filter-member"); msel.length = 1;
    Array.from(members).sort().forEach((m) => msel.add(new Option(m, m)));
    msel.onchange = () => { filters.member = msel.value; applyFilters(); };

    // 연도: 여러 개 겹쳐 볼 수 있는 토글 칩
    const ybox = $("#filter-years"); ybox.innerHTML = "";
    const refreshY = () => $$(".chip", ybox).forEach((c) => {
      const on = c.dataset.year === "" ? filters.years.size === 0 : filters.years.has(c.dataset.year);
      c.classList.toggle("is-active", on);
    });
    const mkY = (val, label) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.dataset.year = val; b.textContent = label;
      b.addEventListener("click", () => {
        if (val === "") filters.years.clear();
        else if (filters.years.has(val)) filters.years.delete(val);
        else filters.years.add(val);
        refreshY(); applyFilters();
      });
      ybox.appendChild(b);
    };
    mkY("", "전체");
    Array.from(years).sort().reverse().forEach((y) => mkY(y, `${y}년`));
    refreshY();

    $("#show-hidden").onchange = (ev) => { filters.showHidden = ev.target.checked; applyFilters(); };
  }
  function resetFilters() {
    Object.assign(filters, FILTER_DEFAULTS());
    $("#filter-search").value = ""; $("#show-hidden").checked = false;
    buildFilters(); applyFilters();
  }
  function applyFilters() {
    state.view = state.all.filter((e) => {
      if (!filters.showHidden && e.published === false) return false;
      if (filters.category && catOf(e.category) !== filters.category) return false;
      if (filters.member && !(e.members || []).includes(filters.member)) return false;
      if (filters.years.size && !filters.years.has(yearOf(e))) return false;
      if (filters.q) {
        const hay = [e.title, e.description, e.feeling, e.date_display,
          (e.members || []).join(" "), e.category].join(" ").toLowerCase();
        if (!hay.includes(filters.q)) return false;
      }
      return true;
    });
    renderTimeline(state.view);
  }

  /* ---------- 오버레이 공용 포커스 관리 ----------
     오버레이가 6개(상세·폼·일정·기념일·크롭·라이트박스)인데 각자 열고 닫기만 해서
     Tab이 배경으로 새어나가고, 닫아도 원래 누른 자리로 돌아오지 않았다.
     여는 쪽에서 focusTrap.on(패널), 닫는 쪽에서 focusTrap.off()만 부르면 된다. */
  const focusTrap = (function () {
    const stack = [];            // [{panel, opener}] — 크롭이 폼 위에 겹치므로 스택으로 둔다
    function focusable(panel) {
      return [...panel.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
    }
    function onKey(e) {
      if (e.key !== "Tab" || !stack.length) return;
      const items = focusable(stack[stack.length - 1].panel);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return {
      on(panel, focusFirst) {
        if (!panel) return;
        stack.push({ panel, opener: document.activeElement });
        const items = focusable(panel);
        (focusFirst || items[0] || panel).focus?.();
      },
      off() {
        const top = stack.pop();
        if (top && top.opener && document.contains(top.opener)) top.opener.focus();
      },
    };
  })();

  /* ---------- 상세 모달 ---------- */
  let modalOpen = false;
  async function openDetail(e) {
    const cat = catOf(e.category), meta = catMeta(cat);
    const members = (e.members || []).map((m) => `<span class="tag">${esc(m)}</span>`).join("");
    const stars = starStr(e.importance);
    $("#modal-body").innerHTML = `
      <div class="md-top">
        <span class="md-date">${esc(fmtDate(e))}</span>
        ${stars ? `<span class="md-stars">${stars}</span>` : ""}
      </div>
      <div class="md-cat">${meta.emoji} ${esc(cat)}</div>
      <h2 id="modal-title" class="md-title">${esc(e.title)}</h2>
      ${members ? `<div class="md-members">${members}</div>` : ""}
      ${e.description ? `<p class="md-desc">${esc(e.description)}</p>` : ""}
      ${e.feeling ? `<blockquote class="md-feeling">“${esc(e.feeling)}”</blockquote>` : ""}
      <div id="md-photos" class="md-photos"></div>
      <div class="eform__actions" style="margin-top:18px">
        <button type="button" class="btn btn--ghost" id="md-edit">✏️ 수정</button>
      </div>`;
    $("#modal").hidden = false; modalOpen = true; document.body.style.overflow = "hidden";
    history.pushState({ modal: true }, ""); focusTrap.on($("#modal"), $(".modal__close"));
    // 폼이 자기 이력을 push하므로 여기서는 history.back()을 부르지 않는다
    $("#md-edit").onclick = () => { closeDetail(true); openForm(e); };
    // 사진 서명 URL 로드
    const wrap = $("#md-photos");
    for (const key of (e.photos || [])) {
      const url = await signOne(key);
      if (url) {
        const img = document.createElement("img");
        img.loading = "lazy"; img.src = url; img.alt = e.title;
        img.addEventListener("click", () => openLightbox(url, e.title));
        wrap.appendChild(img);
      }
    }
  }
  function closeDetail(fromPop) {
    if (!modalOpen) return;
    $("#modal").hidden = true; modalOpen = false; document.body.style.overflow = ""; focusTrap.off();
    if (!fromPop && history.state && history.state.modal) history.back();
  }
  function openLightbox(src, alt) { $("#lightbox-img").src = src; $("#lightbox-img").alt = alt || "";
    $("#lightbox").hidden = false; focusTrap.on($("#lightbox")); }
  function closeLightbox() { if ($("#lightbox").hidden) return;
    $("#lightbox").hidden = true; $("#lightbox-img").src = ""; focusTrap.off(); }

  /* ---------- 추가/수정 폼 ---------- */
  function buildFormStatics() {
    const sel = $("#f-category"); sel.innerHTML = "";
    Object.keys(CFG.categories || {}).forEach((c) => sel.add(new Option(`${catMeta(c).emoji} ${c}`, c)));
    const ssel = $("#sc-category"); ssel.innerHTML = "";
    Object.keys(CFG.scheduleCategories || {}).forEach((c) => ssel.add(new Option(`${schedCat(c).emoji} ${c}`, c)));
  }
  function renderMemberChecks(selected) {
    const box = $("#f-members"); box.innerHTML = "";
    const list = Array.from(new Set([...(CFG.members || []), ...(selected || [])]));
    list.forEach((m) => {
      const id = "mem-" + m;
      const label = document.createElement("label");
      label.className = "eform__check";
      label.innerHTML = `<input type="checkbox" value="${esc(m)}" ${selected && selected.includes(m) ? "checked" : ""}> ${esc(m)}`;
      box.appendChild(label);
    });
  }
  function renderPhotoPreview() {
    const box = $("#f-photo-preview"); box.innerHTML = "";
    state.formItems.forEach((it, i) => {
      const pv = document.createElement("div");
      pv.className = "pv" + (i === 0 ? " is-cover" : "");
      pv.innerHTML = `
        ${i === 0 ? '<span class="pv__badge">대표</span>' : ""}
        <img src="${it.url || ""}" alt="">
        <div class="pv__btns">
          <button type="button" class="${i === 0 ? "pv__cover" : ""}">${i === 0 ? "대표✓" : "대표로"}</button>
          <button type="button" class="pv__crop">✂️영역</button>
          <button type="button">제거</button>
        </div>`;
      const btns = pv.querySelectorAll("button");
      btns[0].onclick = () => { const [m] = state.formItems.splice(i, 1); state.formItems.unshift(m); renderPhotoPreview(); };
      btns[1].onclick = () => openCrop(i);
      btns[2].onclick = () => { state.formItems.splice(i, 1); renderPhotoPreview(); };
      box.appendChild(pv);
    });
  }
  function onPhotosSelected() {
    Array.from($("#f-photos").files || []).forEach((f) =>
      state.formItems.push({ type: "new", file: f, url: URL.createObjectURL(f) }));
    $("#f-photos").value = "";
    renderPhotoPreview();
  }
  async function openForm(e) {
    const isEdit = !!(e && e.id);
    $("#form-title").textContent = isEdit ? "기록 수정" : "새 기록";
    $("#f-id").value = isEdit ? e.id : "";
    $("#f-date").value = isEdit ? (e.date || "") : "";
    $("#f-enddate").value = isEdit ? (e.end_date || "") : "";
    $("#f-datedisplay").value = isEdit ? (e.date_display || "") : "";
    $("#f-title").value = isEdit ? (e.title || "") : "";
    $("#f-category").value = isEdit ? catOf(e.category) : "기타";
    $("#f-description").value = isEdit ? (e.description || "") : "";
    $("#f-feeling").value = isEdit ? (e.feeling || "") : "";
    $("#f-importance").value = String(isEdit ? (e.importance || 0) : 0);
    $("#f-published").checked = isEdit ? e.published !== false : true;
    renderMemberChecks(isEdit ? (e.members || []) : []);
    $("#f-photos").value = "";
    $("#form-error").hidden = true;
    $("#f-delete").hidden = !isEdit;
    $("#f-delete").onclick = () => deleteEvent(e);
    $("#form-modal").hidden = false; document.body.style.overflow = "hidden";
    history.pushState({ form: true }, "");
    focusTrap.on($("#form-modal")); // 뒤로가기로 폼만 닫히게 한다
    // 사진 → formItems (대표 지정/제거 가능). 기존 사진은 썸네일 서명URL 로드
    state.formItems = isEdit ? (e.photos || []).map((key) => ({ type: "existing", key, url: "" })) : [];
    renderPhotoPreview();
    formSnapshot = formState();
    for (const it of state.formItems) { it.url = await signOne(thumbKey(it.key)); }
    renderPhotoPreview();
  }
  // 폼을 연 시점의 값을 스냅샷으로 잡아 두고, 닫을 때 달라졌는지로 판단한다.
  // (값이 채워졌는지로 보면 수정 모드에서는 손대지 않아도 항상 "작성 중"이 된다)
  let formSnapshot = "";
  function formState() {
    return JSON.stringify([
      $("#f-title").value, $("#f-description").value, $("#f-feeling").value,
      $("#f-date").value, $("#f-enddate").value, $("#f-datedisplay").value,
      $("#f-category").value, $("#f-importance").value, $("#f-published").checked,
      $$("#f-members input:checked").length, state.formItems.length,
    ]);
  }
  function hideForm(fromPop) {
    $("#form-modal").hidden = true; document.body.style.overflow = ""; focusTrap.off();
    if (!fromPop && history.state && history.state.form) history.back();
  }
  // 사용자가 닫을 때 — 작성 중인 내용이 있으면 확인을 받는다.
  function closeForm(fromPop) {
    if ($("#form-modal").hidden) return;
    if (formState() !== formSnapshot && !confirm("작성 중인 내용이 있어요. 저장하지 않고 닫을까요?")) {
      if (fromPop) history.pushState({ form: true }, ""); // 뒤로가기를 취소했으니 이력을 되돌린다
      return;
    }
    hideForm(fromPop);
  }

  /* ---------- 사진 리사이즈 ---------- */
  function resize(file, maxEdge, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cv.toBlob((b) => { URL.revokeObjectURL(img.src); resolve(b); }, "image/jpeg", quality);
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }
  const canvasToBlob = (cv, q) => new Promise((r) => cv.toBlob((b) => r(b), "image/jpeg", q));
  function cropCanvas(file, crop, edge) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas"); cv.width = edge; cv.height = edge;
        cv.getContext("2d").drawImage(img, crop.sx, crop.sy, crop.size, crop.size, 0, 0, edge, edge);
        URL.revokeObjectURL(img.src); res(cv);
      };
      img.onerror = () => res(null); img.src = URL.createObjectURL(file);
    });
  }
  async function uploadOne(eventId, item) {
    const file = item.file;
    const uid = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.round(Math.random() * 1e9));
    const P = CFG.photo || {};
    const full = await resize(file, P.maxEdge || 1600, P.quality || 0.82);
    let th;
    if (item.crop) {
      const cv = await cropCanvas(file, item.crop, P.thumbEdge || 400);
      th = cv ? await canvasToBlob(cv, P.thumbQuality || 0.72) : null;
    } else {
      th = await resize(file, P.thumbEdge || 400, P.thumbQuality || 0.72);
    }
    if (!full || !th) return null;
    const fullKey = `${eventId}/${uid}.jpg`;
    await sb.storage.from(BUCKET).upload(fullKey, full, { contentType: "image/jpeg", upsert: true });
    await sb.storage.from(BUCKET).upload(`${eventId}/thumb/${uid}.jpg`, th, { contentType: "image/jpeg", upsert: true });
    return fullKey;
  }

  async function saveEvent(ev) {
    ev.preventDefault();
    const err = $("#form-error"); err.hidden = true;
    const save = $("#f-save"); save.disabled = true; save.textContent = "저장 중…";
    try {
      const id = $("#f-id").value;
      const members = $$("#f-members input:checked").map((c) => c.value);
      const payload = {
        date: $("#f-date").value || null,
        end_date: $("#f-enddate").value || null,
        date_display: $("#f-datedisplay").value.trim(),
        title: $("#f-title").value.trim(),
        category: $("#f-category").value,
        members,
        importance: parseInt($("#f-importance").value, 10) || 0,
        description: $("#f-description").value.trim(),
        feeling: $("#f-feeling").value.trim(),
        published: $("#f-published").checked,
      };
      if (!payload.title || !payload.date) throw new Error("날짜와 제목은 필수예요.");

      let eventId = id;
      if (id) {
        const { error } = await sb.from("events").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("events").insert(payload).select("id").single();
        if (error) throw error;
        eventId = data.id;
      }
      // 사진: formItems 순서대로 저장 (index 0 = 대표 썸네일)
      const photos = []; let uploading = false;
      for (const it of state.formItems) {
        if (it.type === "existing") { photos.push(it.key); continue; }
        if (!uploading) { uploading = true; save.textContent = "사진 올리는 중…"; }
        const key = await uploadOne(eventId, it);
        if (key) photos.push(key);
      }
      const { error: e2 } = await sb.from("events").update({ photos }).eq("id", eventId);
      if (e2) throw e2;

      hideForm(false); toast(id ? "수정했어요" : "기록을 추가했어요 🌸");
      await reload();
    } catch (e) {
      console.error(e);
      err.textContent = "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요. 계속 안 되면 새로고침 후 다시 로그인해 보세요.";
      err.hidden = false;
    } finally {
      save.disabled = false; save.textContent = "저장";
    }
  }
  async function deleteEvent(e) {
    if (!confirm(`"${e.title}" 기록을 삭제할까요? 되돌릴 수 없어요.`)) return;
    const { error } = await sb.from("events").delete().eq("id", e.id);
    if (error) { console.error(error); toast("삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요."); return; }
    // 사진 파일도 정리(있으면)
    const keys = (e.photos || []).flatMap((k) => [k, thumbKey(k)]);
    if (keys.length) await sb.storage.from(BUCKET).remove(keys);
    hideForm(false); toast("삭제했어요"); await reload();
  }

  /* ---------- 캘린더 + 반복 기념일 ---------- */
  function recurringSolarDay(r, y, m) {
    // 그 해/달에 해당 기념일이 며칠에 오는지 (없으면 0)
    if (r.calendar === "lunar") {
      const L = window.Lunar;
      if (!L) return r.month === m ? r.day : 0; // 라이브러리 없으면 양력 취급
      try {
        const s = L.fromYmd(y, r.month, r.day).getSolar();
        return (s.getYear() === y && s.getMonth() === m) ? s.getDay() : 0;
      } catch (_) { return 0; }
    }
    return r.month === m ? r.day : 0;
  }
  function schedSubLabel(s) {
    const rep = { none: "", weekly: "매주", monthly: "매월", yearly: "매년" }[s.repeat || "none"];
    return [rep, s.is_lunar ? "음력" : ""].filter(Boolean).join("·");
  }
  function renderCalResults(q) {
    const rows = [];
    state.schedules.forEach((s) => {
      if ([s.title, s.note, s.category].join(" ").toLowerCase().includes(q))
        rows.push({ date: (s.repeat && s.repeat !== "none" ? schedSubLabel(s) + " " : "") + (s.start_date || ""), sort: s.start_date || "", kind: "일정", cls: "ct-sched", emoji: schedCat(schedCatOf(s.category)).emoji, title: s.title, cb: () => openSchedule(s) });
    });
    state.recurring.forEach((r) => {
      if ([r.title, r.note].join(" ").toLowerCase().includes(q))
        rows.push({ date: `매년 ${r.month}월 ${r.day}일${r.calendar === "lunar" ? "(음력)" : ""}`, sort: `9999-${String(r.month).padStart(2, "0")}-${String(r.day).padStart(2, "0")}`, kind: "기념일", cls: "ct-anniv", emoji: "🎂", title: r.title, cb: openRecurring });
    });
    state.all.forEach((e) => {
      if (!filters.showHidden && e.published === false) return;
      const hay = [e.title, e.description, e.feeling, (e.members || []).join(" "), e.category].join(" ").toLowerCase();
      if (hay.includes(q)) rows.push({ date: fmtDate(e), sort: e.date || "", kind: "기록", cls: "ct-memo", emoji: catMeta(catOf(e.category)).emoji, title: e.title, cb: () => openDetail(e) });
    });
    rows.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
    const box = $("#cal-results");
    if (!rows.length) { box.innerHTML = `<div class="cal-summary__empty">"${esc(q)}" 검색 결과가 없어요.</div>`; return; }
    box.innerHTML = `<div class="cal-summary__title">🔍 검색결과 ${rows.length}건</div><div class="cal-table__wrap"><table class="cal-table"><tbody></tbody></table></div>`;
    const tb = box.querySelector("tbody");
    rows.forEach((r) => {
      const tr = document.createElement("tr"); tr.style.cursor = "pointer";
      tr.innerHTML = `<td class="cr-date">${esc(r.date)}</td><td><span class="ct-kind ${r.cls}">${r.kind}</span></td><td>${r.emoji} ${esc(r.title)}</td>`;
      tr.onclick = r.cb; tb.appendChild(tr);
    });
  }
  function renderCalendar() {
    if (state.calQ) { $("#cal-normal").hidden = true; $("#cal-results").hidden = false; renderCalResults(state.calQ); return; }
    $("#cal-normal").hidden = false; $("#cal-results").hidden = true;
    const y = state.calYear, m = state.calMonth;
    if ($("#cal-year").options.length) { $("#cal-year").value = y; $("#cal-month").value = m; }
    const startDow = new Date(y, m - 1, 1).getDay();
    const days = new Date(y, m, 0).getDate();
    const today = new Date();
    const isThisMonth = today.getFullYear() === y && today.getMonth() + 1 === m;

    const evByDay = {}, recByDay = {}, schedByDay = {};
    state.all.forEach((e) => {
      if (!filters.showHidden && e.published === false) return;
      const md = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.date || "");
      if (md && +md[1] === y && +md[2] === m) (evByDay[+md[3]] = evByDay[+md[3]] || []).push(e);
    });
    state.recurring.forEach((r) => {
      const d = recurringSolarDay(r, y, m);
      if (d) (recByDay[d] = recByDay[d] || []).push(r);
    });
    state.schedules.forEach((s) => {
      for (let d = 1; d <= days; d++) if (schedOccursOn(s, y, m, d)) (schedByDay[d] = schedByDay[d] || []).push(s);
    });

    // 이번 달 일정 요약표 (달력 위)
    const rows = [];
    for (let d = 1; d <= days; d++) {
      (schedByDay[d] || []).forEach((s) => rows.push({ d, kind: "일정", emoji: schedCat(schedCatOf(s.category)).emoji, title: s.title }));
      (recByDay[d] || []).forEach((r) => rows.push({ d, kind: "기념일", emoji: "🎂", title: r.title }));
      (evByDay[d] || []).forEach((e) => rows.push({ d, kind: "기록", emoji: catMeta(catOf(e.category)).emoji, title: e.title }));
    }
    const tMid = new Date(); tMid.setHours(0, 0, 0, 0);
    const dday = (d) => {
      const diff = Math.round((new Date(y, m - 1, d).setHours(0, 0, 0, 0) - tMid) / 86400000);
      if (diff > 0) return `<span class="ct-dday dd-future">D-${diff}</span>`;
      if (diff < 0) return `<span class="ct-dday dd-past">D+${-diff}</span>`;
      return `<span class="ct-dday dd-today">D-DAY</span>`;
    };
    $("#cal-summary").innerHTML = rows.length
      ? `<div class="cal-summary__title">📋 ${y}년 ${m}월 · 총 ${rows.length}건</div>
         <div class="cal-table__wrap"><table class="cal-table"><tbody>${rows.map((r) =>
           `<tr><td class="ct-day">${r.d}일</td><td><span class="ct-kind ${({ "일정": "ct-sched", "기념일": "ct-anniv", "기록": "ct-memo" })[r.kind]}">${r.kind}</span></td><td class="ct-title">${r.emoji} ${esc(r.title)}</td><td class="ct-ddaycell">${dday(r.d)}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="cal-summary__empty">${y}년 ${m}월엔 일정이 없어요.</div>`;

    const grid = $("#cal-grid"); grid.innerHTML = "";
    ["일", "월", "화", "수", "목", "금", "토"].forEach((d) => {
      const h = document.createElement("div"); h.className = "cal__dow"; h.textContent = d; grid.appendChild(h);
    });
    for (let i = 0; i < startDow; i++) {
      const c = document.createElement("div"); c.className = "cal__cell cal__cell--empty"; grid.appendChild(c);
    }
    for (let d = 1; d <= days; d++) {
      const cell = document.createElement("div");
      cell.className = "cal__cell" + (isThisMonth && today.getDate() === d ? " cal__cell--today" : "");
      let html = `<span class="cal__num">${d}</span>`;
      (schedByDay[d] || []).forEach((s) => {
        const meta = schedCat(schedCatOf(s.category));
        html += `<button type="button" class="cal__item cal__item--sched" data-sid="${s.id}" style="border-left:3px solid ${meta.color}" title="${esc(s.title)}">${meta.emoji} ${esc(s.title)}</button>`;
      });
      (recByDay[d] || []).forEach((r) => { html += `<span class="cal__item cal__item--rec" title="${esc(r.title)}">🎂 ${esc(r.title)}</span>`; });
      (evByDay[d] || []).forEach((e) => { html += `<button type="button" class="cal__item" data-eid="${e.id}" title="${esc(e.title)}">${catMeta(catOf(e.category)).emoji} ${esc(e.title)}</button>`; });
      cell.innerHTML = html;
      cell.addEventListener("click", (ev) => { if (!ev.target.closest(".cal__item")) openSchedule({ start_date: ymd(y, m, d) }); });
      grid.appendChild(cell);
    }
    grid.querySelectorAll(".cal__item[data-eid]").forEach((b) => {
      b.onclick = (ev) => { ev.stopPropagation(); const e = state.all.find((x) => x.id === b.dataset.eid); if (e) openDetail(e); };
    });
    grid.querySelectorAll(".cal__item[data-sid]").forEach((b) => {
      b.onclick = (ev) => { ev.stopPropagation(); const s = state.schedules.find((x) => x.id === b.dataset.sid); if (s) openSchedule(s); };
    });
  }
  function setView(v) {
    state.viewMode = v;
    $("#tab-timeline").classList.toggle("is-active", v === "timeline");
    $("#tab-calendar").classList.toggle("is-active", v === "calendar");
    $("#timeline").hidden = v !== "timeline";
    $("#calendar").hidden = v !== "calendar";
    $("#filters").hidden = v !== "timeline";
    if (v === "calendar") { $("#empty").hidden = true; renderCalendar(); }
    else applyFilters();
  }

  async function loadRecurring() {
    const { data } = await sb.from("recurring_events").select("*").order("month").order("day");
    state.recurring = data || [];
  }
  function renderRecList() {
    const ul = $("#rec-list"); ul.innerHTML = "";
    if (!state.recurring.length) { ul.innerHTML = `<li class="rec-empty">아직 등록된 기념일이 없어요.</li>`; return; }
    state.recurring.forEach((r) => {
      const li = document.createElement("li"); li.className = "rec-item";
      const cal = r.calendar === "lunar" ? "음력" : "양력";
      li.innerHTML = `<span>🎂 <b>${esc(r.title)}</b> · ${cal} ${r.month}월 ${r.day}일${r.note ? ` · ${esc(r.note)}` : ""}</span><button type="button" aria-label="삭제">✕</button>`;
      li.querySelector("button").onclick = async () => {
        if (!confirm(`"${r.title}" 기념일을 삭제할까요?`)) return;
        await sb.from("recurring_events").delete().eq("id", r.id);
        await loadRecurring(); renderRecList();
        if (state.viewMode === "calendar") renderCalendar();
      };
      ul.appendChild(li);
    });
  }
  async function addRecurring(ev) {
    ev.preventDefault();
    const err = $("#rec-error"); err.hidden = true;
    const payload = {
      title: $("#rc-title").value.trim(), calendar: $("#rc-cal").value,
      month: parseInt($("#rc-month").value, 10), day: parseInt($("#rc-day").value, 10),
      note: $("#rc-note").value.trim(),
    };
    if (!payload.title || !payload.month || !payload.day) { err.textContent = "이름·월·일을 입력해 주세요."; err.hidden = false; return; }
    const { error } = await sb.from("recurring_events").insert(payload);
    if (error) { console.error(error);
      err.textContent = "추가하지 못했어요. 잠시 뒤 다시 눌러 주세요."; err.hidden = false; return; }
    $("#rec-form").reset();
    await loadRecurring(); renderRecList(); toast("기념일을 추가했어요 🎂");
    if (state.viewMode === "calendar") renderCalendar();
  }
  function openRecurring() { renderRecList(); $("#rec-modal").hidden = false; document.body.style.overflow = "hidden";
    focusTrap.on($("#rec-modal")); }
  function closeRecurring() { if ($("#rec-modal").hidden) return;
    $("#rec-modal").hidden = true; document.body.style.overflow = ""; focusTrap.off(); }

  /* ---------- 캘린더 일정(schedules) ---------- */
  async function loadSchedules() {
    const { data, error } = await sb.from("schedules").select("*").order("start_date");
    if (error) { console.warn("schedules 로드 실패(테이블 있나요?):", error.message); state.schedules = []; return; }
    state.schedules = data || [];
  }
  const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // 일정이 특정 날짜에 오는지 (반복/음력 계산)
  function schedOccursOn(s, y, m, d) {
    const rep = s.repeat || "none";
    if (rep === "none") {
      const cur = ymd(y, m, d), end = s.end_date || s.start_date;
      return cur >= s.start_date && cur <= end;
    }
    if (!s.start_date) return false;
    const p = s.start_date.split("-").map(Number), am = p[1], ad = p[2];
    const cur = new Date(y, m - 1, d), anchor = new Date(p[0], am - 1, ad);
    if (cur < anchor) return false;
    if (rep === "weekly") return cur.getDay() === anchor.getDay();
    if (rep === "monthly") { const dim = new Date(y, m, 0).getDate(); return d === ad || (ad > dim && d === dim); }
    if (rep === "yearly") {
      if (s.is_lunar && window.Lunar) {
        const so = lunarToSolar(y, am, ad);
        return !!so && so.getYear() === y && so.getMonth() === m && so.getDay() === d;
      }
      return m === am && d === ad;
    }
    return false;
  }
  // 음력(월,일) → 해당 연도 양력. 그 해에 그 음력일이 없으면 하루 앞(예: 29→28)으로 대체.
  function lunarToSolar(y, lm, ld) {
    const L = window.Lunar; if (!L) return null;
    for (let d = ld; d >= ld - 1 && d >= 1; d--) {
      try {
        const so = L.fromYmd(y, lm, d).getSolar();
        const back = so.getLunar();
        if (Math.abs(back.getMonth()) === lm && back.getDay() === d) return so;
      } catch (_) {}
    }
    return null;
  }
  function updateSchedFormUI() {
    const rep = $("#sc-repeat").value, yearly = rep === "yearly";
    $("#sc-lunar-wrap").style.display = yearly ? "" : "none";
    const hint = $("#sc-lunar-hint");
    const dv = $("#sc-date").value;
    if (yearly && $("#sc-lunar").checked && dv) {
      const pp = dv.split("-").map(Number);
      let t = `🌙 음력 ${pp[1]}월 ${pp[2]}일 기준으로 매년 반복돼요.`;
      if (window.Lunar) { try { const s = window.Lunar.fromYmd(new Date().getFullYear(), pp[1], pp[2]).getSolar(); t += ` (올해 양력 ${s.getMonth()}월 ${s.getDay()}일)`; } catch (_) {} }
      hint.textContent = t; hidden(hint, false);
    } else if (rep !== "none") {
      const lab = { weekly: "매주", monthly: "매월", yearly: "매년" }[rep];
      hint.textContent = `${lab} 반복됩니다. (반복 일정은 시작일 기준 하루만 표시)`; hidden(hint, false);
    } else hidden(hint, true);
  }
  const hidden = (el, v) => { el.hidden = v; };
  function openSchedule(s) {
    const isEdit = !!(s && s.id);
    const preRepeat = s && s.repeat && s.repeat !== "none";
    $("#sched-title").textContent = isEdit ? "일정 수정" : (preRepeat ? "🎂 기념일 · 일정 추가" : "📅 일정 추가");
    $("#sc-id").value = isEdit ? s.id : "";
    $("#sc-title").value = isEdit ? (s.title || "") : "";
    $("#sc-category").value = isEdit ? schedCatOf(s.category) : (preRepeat ? "생일" : "기타");
    $("#sc-date").value = (s && s.start_date) ? s.start_date : "";
    $("#sc-enddate").value = isEdit ? (s.end_date || "") : "";
    $("#sc-repeat").value = (s && s.repeat) ? s.repeat : "none";
    $("#sc-lunar").checked = !!(s && s.is_lunar);
    $("#sc-note").value = isEdit ? (s.note || "") : "";
    $("#sched-error").hidden = true;
    $("#sc-delete").hidden = !isEdit;
    $("#sc-delete").onclick = () => deleteSchedule(s);
    updateSchedFormUI();
    $("#sched-modal").hidden = false; document.body.style.overflow = "hidden"; focusTrap.on($("#sched-modal"));
  }
  function closeSchedule() { if ($("#sched-modal").hidden) return;
    $("#sched-modal").hidden = true; document.body.style.overflow = ""; focusTrap.off(); }
  async function saveSchedule(ev) {
    ev.preventDefault();
    const err = $("#sched-error"); err.hidden = true;
    const id = $("#sc-id").value;
    const rep = $("#sc-repeat").value;
    const payload = {
      title: $("#sc-title").value.trim(), category: $("#sc-category").value,
      start_date: $("#sc-date").value || null, end_date: $("#sc-enddate").value || null,
      note: $("#sc-note").value.trim(),
      repeat: rep, is_lunar: rep === "yearly" && $("#sc-lunar").checked,
    };
    if (!payload.title || !payload.start_date) { err.textContent = "제목과 시작일은 필수예요."; err.hidden = false; return; }
    const q = id ? sb.from("schedules").update(payload).eq("id", id) : sb.from("schedules").insert(payload);
    const { error } = await q;
    if (error) { console.error(error);
      err.textContent = "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요."; err.hidden = false; return; }
    closeSchedule(); toast(id ? "수정했어요" : (payload.repeat !== "none" ? "기념일을 추가했어요 🎂" : "일정을 추가했어요 📅"));
    await loadSchedules(); renderCalendar();
  }
  async function deleteSchedule(s) {
    if (!confirm(`"${s.title}" 을(를) 삭제할까요?`)) return;
    const { error } = await sb.from("schedules").delete().eq("id", s.id);
    if (error) { console.error(error); toast("삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요."); return; }
    closeSchedule(); toast("삭제했어요"); await loadSchedules(); renderCalendar();
  }

  /* ---------- 썸네일 크롭(영역 지정) ---------- */
  let cropIndex = -1, cropBox = { x: 0, y: 0, size: 0 }, cropDrag = null;
  async function openCrop(index) {
    const it = state.formItems[index];
    if (!it) return;
    cropIndex = index;
    const img = $("#crop-img");
    img.onload = () => initCropBox();
    img.onerror = () => { toast("사진을 불러오지 못했어요"); closeCrop(); };
    img.crossOrigin = "anonymous";  // 캔버스로 잘라내려면 CORS 필요(기존 사진)
    if (it.type === "new") {
      img.src = URL.createObjectURL(it.file);
    } else {
      const url = await signOne(it.key);
      if (!url) { toast("사진을 불러오지 못했어요"); return; }
      img.src = url;
    }
    $("#crop-modal").hidden = false; document.body.style.overflow = "hidden"; focusTrap.on($("#crop-modal"));
  }
  function closeCrop() {
    const img = $("#crop-img");
    if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
    $("#crop-modal").hidden = true; document.body.style.overflow = ""; focusTrap.off();
    cropIndex = -1; cropDrag = null;
  }
  function initCropBox() {
    const img = $("#crop-img"), w = img.clientWidth, h = img.clientHeight;
    const s = Math.round(Math.min(w, h) * 0.9);
    cropBox = { x: Math.round((w - s) / 2), y: Math.round((h - s) / 2), size: s };
    positionCropBox();
  }
  function positionCropBox() {
    const b = $("#crop-box");
    b.style.left = cropBox.x + "px"; b.style.top = cropBox.y + "px";
    b.style.width = cropBox.size + "px"; b.style.height = cropBox.size + "px";
  }
  function clampCropBox() {
    const img = $("#crop-img"), w = img.clientWidth, h = img.clientHeight;
    cropBox.size = Math.max(30, Math.min(cropBox.size, w, h));
    cropBox.x = Math.max(0, Math.min(cropBox.x, w - cropBox.size));
    cropBox.y = Math.max(0, Math.min(cropBox.y, h - cropBox.size));
  }
  function wireCrop() {
    const box = $("#crop-box"), handle = box.querySelector(".crop-handle");
    const pt = (e) => (e.touches ? e.touches[0] : e);
    const begin = (mode) => (e) => {
      e.preventDefault(); const p = pt(e);
      cropDrag = { mode, px: p.clientX, py: p.clientY, bx: cropBox.x, by: cropBox.y, bs: cropBox.size };
    };
    handle.addEventListener("pointerdown", begin("resize"));
    box.addEventListener("pointerdown", (e) => { if (e.target !== handle) begin("move")(e); });
    document.addEventListener("pointermove", (e) => {
      if (!cropDrag) return;
      const p = pt(e), dx = p.clientX - cropDrag.px, dy = p.clientY - cropDrag.py;
      if (cropDrag.mode === "move") { cropBox.x = cropDrag.bx + dx; cropBox.y = cropDrag.by + dy; }
      else cropBox.size = cropDrag.bs + Math.max(dx, dy);
      clampCropBox(); positionCropBox();
    });
    document.addEventListener("pointerup", () => { cropDrag = null; });
    $("#crop-apply").onclick = applyCrop;
    $$("[data-crop-close]").forEach((el) => (el.onclick = closeCrop));
  }
  async function applyCrop() {
    if (cropIndex < 0) return;
    const it = state.formItems[cropIndex], img = $("#crop-img");
    const scale = img.naturalWidth / img.clientWidth;
    const crop = { sx: Math.round(cropBox.x * scale), sy: Math.round(cropBox.y * scale), size: Math.round(cropBox.size * scale) };
    if (it.type === "new") {
      it.crop = crop;
      const cv = await cropCanvas(it.file, crop, 200);
      if (cv) it.url = cv.toDataURL("image/jpeg", 0.8);
      closeCrop(); renderPhotoPreview(); toast("썸네일 영역을 지정했어요 ✂️");
      return;
    }
    // 기존 사진: 표시된 이미지에서 잘라 썸네일만 새로 업로드 (원본 유지)
    try {
      const P = CFG.photo || {}, edge = P.thumbEdge || 360;
      const cv = document.createElement("canvas"); cv.width = edge; cv.height = edge;
      cv.getContext("2d").drawImage(img, crop.sx, crop.sy, crop.size, crop.size, 0, 0, edge, edge);
      const blob = await canvasToBlob(cv, P.thumbQuality || 0.72);
      const tkey = thumbKey(it.key);
      const { error } = await sb.storage.from(BUCKET).upload(tkey, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const fresh = await signOne(tkey);
      it.url = fresh; state.thumbUrls[tkey] = fresh;
      closeCrop(); renderPhotoPreview(); applyFilters(); toast("썸네일을 다시 잘랐어요 ✂️");
    } catch (e) {
      console.error(e); toast("사진 영역을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  /* ---------- 엑셀 백업 다운로드 ---------- */
  function exportExcel() {
    if (!window.XLSX) { toast("인터넷 연결을 확인한 뒤 다시 눌러 주세요."); return; }
    toast("백업 파일 만드는 중…");
    const evRows = state.all.map((e) => ({
      날짜: e.date || "", 종료일: e.end_date || "", 날짜표기: e.date_display || "",
      제목: e.title || "", 카테고리: e.category || "", 구성원: (e.members || []).join(", "),
      중요도: e.importance || 0, 설명: e.description || "", 그때의마음: e.feeling || "",
      게시: e.published === false ? "FALSE" : "TRUE", 사진수: (e.photos || []).length,
    }));
    const scRows = state.schedules.map((s) => ({
      시작일: s.start_date || "", 종료일: s.end_date || "", 제목: s.title || "",
      카테고리: s.category || "", 메모: s.note || "",
    }));
    const rcRows = state.recurring.map((r) => ({
      제목: r.title || "", 양력음력: r.calendar === "lunar" ? "음력" : "양력",
      월: r.month, 일: r.day, 메모: r.note || "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evRows.length ? evRows : [{}]), "연대기");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scRows.length ? scRows : [{}]), "일정");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rcRows.length ? rcRows : [{}]), "기념일");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `가족일기_백업_${stamp}.xlsx`);
    toast("엑셀로 저장했어요 ⬇️");
  }

  /* ---------- 데이터 로드 ---------- */
  async function reload() {
    const { data, error } = await sb.from("events").select("*").order("date", { ascending: false });
    if (error) { console.error(error);
      toast("기록을 불러오지 못했어요. 새로고침해 주세요."); return; }
    state.all = data || [];
    state.thumbUrls = {};
    await signThumbs(state.all);
    await loadRecurring();
    await loadSchedules();
    renderHeader(); buildFilters(); applyFilters();
    if (state.viewMode === "calendar") renderCalendar();
  }

  /* ---------- 이벤트 바인딩 ---------- */
  function wire() {
    $$("#modal [data-close]").forEach((el) => (el.onclick = () => closeDetail(false)));
    $$("[data-form-close]").forEach((el) => (el.onclick = () => closeForm(false)));
    $$("[data-lightbox-close]").forEach((el) => (el.onclick = closeLightbox));
    $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLightbox(); });
    window.addEventListener("popstate", () => {
      // 폼 위에 크롭이 떠 있으면 위엣것부터 닫는다 (Escape 우선순위와 동일)
      if (!$("#crop-modal").hidden) { closeCrop(); history.pushState({ form: true }, ""); return; }
      if (!$("#form-modal").hidden) { closeForm(true); return; }
      if (modalOpen) closeDetail(true);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#crop-modal").hidden) closeCrop();
      else if (!$("#lightbox").hidden) closeLightbox();
      else if (!$("#sched-modal").hidden) closeSchedule();
      else if (!$("#rec-modal").hidden) closeRecurring();
      else if (!$("#form-modal").hidden) closeForm(false);
      else if (modalOpen) closeDetail(false);
    });
    $("#fab").onclick = () => {
      const n = new Date(), t = ymd(n.getFullYear(), n.getMonth() + 1, n.getDate());
      if (state.viewMode === "calendar") openSchedule({ start_date: t });
      else openForm(null);
    };
    $("#filter-search").addEventListener("input", (e) => {
      filters.q = e.target.value.trim().toLowerCase();
      if (filters.q && state.viewMode === "calendar") setView("timeline");
      applyFilters();
    });
    $("#f-photos").addEventListener("change", onPhotosSelected);
    $("#event-form").onsubmit = saveEvent;
    $("#logout-btn").onclick = async () => { await sb.auth.signOut(); location.reload(); };
    $("#export-btn").onclick = exportExcel;
    // 뷰 전환 + 캘린더 + 기념일
    $("#tab-timeline").onclick = () => setView("timeline");
    $("#tab-calendar").onclick = () => setView("calendar");
    $("#cal-prev").onclick = () => { if (--state.calMonth < 1) { state.calMonth = 12; state.calYear--; } renderCalendar(); };
    $("#cal-next").onclick = () => { if (++state.calMonth > 12) { state.calMonth = 1; state.calYear++; } renderCalendar(); };
    $$("[data-sched-close]").forEach((el) => (el.onclick = closeSchedule));
    $("#sched-form").onsubmit = saveSchedule;
    $("#sc-repeat").onchange = updateSchedFormUI;
    $("#sc-lunar").onchange = updateSchedFormUI;
    $("#sc-date").addEventListener("change", updateSchedFormUI);
    wireCrop();
    $("#cal-year").onchange = () => { state.calYear = +$("#cal-year").value; renderCalendar(); };
    $("#cal-month").onchange = () => { state.calMonth = +$("#cal-month").value; renderCalendar(); };
    $("#cal-search").addEventListener("input", (e) => { state.calQ = e.target.value.trim().toLowerCase(); renderCalendar(); });
  }

  /* ---------- 인증 ---------- */
  function showLogin() { $("#login").hidden = false; $("#app").hidden = true; $("#fab").hidden = true; }
  function buildCalPickers() {
    const ys = $("#cal-year"); ys.innerHTML = "";
    const now = new Date().getFullYear();
    for (let yr = now - 10; yr <= now + 10; yr++) ys.add(new Option(`${yr}년`, yr));
    const ms = $("#cal-month"); ms.innerHTML = "";
    for (let mo = 1; mo <= 12; mo++) ms.add(new Option(`${mo}월`, mo));
  }
  async function enterApp() {
    $("#login").hidden = true; $("#app").hidden = false; $("#fab").hidden = false;
    const now = new Date();
    state.calYear = now.getFullYear(); state.calMonth = now.getMonth() + 1;
    buildFormStatics(); buildCalPickers(); wire();
    try {
      const { data: ud } = await sb.auth.getUser();
      const u = ud && ud.user;
      const name = (u && u.user_metadata && u.user_metadata.name) || (u && u.email ? u.email.split("@")[0] : "가족");
      $("#user-name").textContent = name;
    } catch (_) {}
    await reload();
  }
  function bindLogin() {
    $("#login-form").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("#login-error"); err.hidden = true;
      const btn = $("#login-btn"); btn.disabled = true; btn.textContent = "확인 중…";
      const { error } = await sb.auth.signInWithPassword({
        email: $("#login-email").value.trim(), password: $("#login-pw").value,
      });
      btn.disabled = false; btn.textContent = "들어가기";
      if (error) { err.textContent = "로그인 실패: 이메일/비밀번호를 확인해 주세요."; err.hidden = false; return; }
      enterApp();
    };
  }

  async function boot() {
    if (!window.supabase) { alert("인터넷 연결을 확인한 뒤 새로고침해 주세요."); return; }
    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) { alert("config.js에 Supabase URL/키가 없습니다."); return; }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    bindLogin();
    const { data } = await sb.auth.getSession();
    if (data && data.session) enterApp(); else showLogin();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
