/* REGIS EXOTICS — behaviour shared by every page.
   No dependencies. Everything here is an enhancement: pages read fine without it. */
(function () {
  'use strict';

  var dataEl = document.getElementById('site-data');
  if (!dataEl) return;
  var data = JSON.parse(dataEl.textContent);
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var coarse = window.matchMedia('(pointer: coarse)');
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var store = {
    get: function (area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set: function (area, k, v) { try { window[area].setItem(k, v); } catch (e) {} }
  };
  var vehicleBySlug = function (slug) { return data.vehicles.filter(function (v) { return v.slug === slug; })[0] || null; };
  var money = function (n) { return '$' + Number(n).toLocaleString('en-US'); };
  var escapeHtml = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };

  /* ───────────── analytics ─────────────
     Events: View Details, Request Booking, Instagram click, Estimate shared, Form submitted,
     Quote calculated, Showroom opened, Review submitted, Support submitted.
     No names, emails or message text are ever sent to analytics. */
  var A = data.analytics || { provider: 'none' };
  var gaReady = false;
  function track(name, props) {
    try {
      if (A.provider === 'plausible' && window.plausible) window.plausible(name, props ? { props: props } : undefined);
      else if (A.provider === 'ga4' && gaReady) window.gtag('event', name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), props || {});
    } catch (e) {}
    // Watch events in the console: addEventListener('regis:track', e => console.log(e.detail))
    window.dispatchEvent(new CustomEvent('regis:track', { detail: { name: name, props: props || null } }));
  }
  function loadScript(src, attrs) {
    var s = document.createElement('script');
    s.src = src; s.async = true;
    Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    document.head.appendChild(s);
    return s;
  }
  function startGa() {
    if (gaReady || !A.ga4Id) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', A.ga4Id);
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(A.ga4Id));
    gaReady = true;
  }
  function cookieNotice() {
    var bar = document.createElement('div');
    bar.className = 'cookie glass';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie choice');
    bar.innerHTML =
      '<p>This site would like to use Google Analytics cookies to count visits. Nothing is set unless you allow it.</p>' +
      '<div class="cookie__actions"><button type="button" class="btn btn--glass btn--sm" data-c="denied">Decline</button>' +
      '<button type="button" class="btn btn--primary btn--sm" data-c="granted">Allow</button></div>';
    document.body.appendChild(bar);
    document.body.classList.add('has-cookie');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]');
      if (!b) return;
      store.set('localStorage', 'regis-consent', b.dataset.c);
      if (b.dataset.c === 'granted') startGa();
      bar.remove();
      document.body.classList.remove('has-cookie');
      refreshBookbar();
    });
  }
  if (!data.preview) {
    if (A.provider === 'plausible' && A.plausibleDomain) {
      window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
      loadScript(A.plausibleScript || 'https://plausible.io/js/script.js', { 'data-domain': A.plausibleDomain, defer: '' });
    } else if (A.provider === 'ga4' && A.ga4Id) {
      var consent = store.get('localStorage', 'regis-consent');
      if (consent === 'granted') startGa();
      else if (consent !== 'denied') cookieNotice();
    }
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-track]');
    if (!el || el.getAttribute('aria-disabled') === 'true') return;
    var card = el.closest('[data-slug]');
    track(el.dataset.track, card ? { vehicle: card.dataset.slug } : undefined);
  });

  window.REGIS = { data: data, track: track, reduce: reduce, store: store, money: money, escapeHtml: escapeHtml, vehicleBySlug: vehicleBySlug };

  /* ───────────── mobile menu ───────────── */
  (function () {
    var toggle = $('[data-menu-toggle]'), menu = $('[data-menu]');
    if (!toggle || !menu) return;
    function set(open) {
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.lastElementChild.textContent = open ? 'Close' : 'Menu';
    }
    toggle.addEventListener('click', function () { set(menu.hidden); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { set(false); toggle.focus(); } });
    document.addEventListener('click', function (e) { if (!menu.hidden && !e.target.closest('[data-nav]')) set(false); });
    window.matchMedia('(min-width: 900px)').addEventListener('change', function () { set(false); });
  })();

  /* ───────────── sticky booking bar ─────────────
     Steps aside while a planner, the page's own call-to-action buttons or the footer are on screen. */
  var bookbar = $('[data-bookbar]');
  var covering = new Set();
  function refreshBookbar() {
    if (!bookbar) return;
    bookbar.dataset.hidden = covering.size > 0 || document.body.classList.contains('has-cookie') ? 'true' : 'false';
  }
  if (bookbar) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { en.isIntersecting ? covering.add(en.target) : covering.delete(en.target); });
        refreshBookbar();
      }, { rootMargin: '0px 0px -80px 0px' });
      $$('[data-booking], .footer, .hero__copy, .vehicle__info .actions, .closing__box, .ratecard').forEach(function (el) { io.observe(el); });
    } else refreshBookbar();
  }

  /* ───────────── saved vehicles (this browser only) ───────────── */
  (function () {
    var KEY = 'regis-saved';
    function read() {
      try {
        var list = JSON.parse(store.get('localStorage', KEY) || '[]');
        return Array.isArray(list) ? list.filter(function (s) { return !!vehicleBySlug(s); }) : [];
      } catch (e) { return []; }
    }
    function paint() {
      var saved = read();
      $$('[data-save]').forEach(function (b) {
        var on = saved.indexOf(b.dataset.save) > -1, v = vehicleBySlug(b.dataset.save);
        b.setAttribute('aria-pressed', String(on));
        var label = $('[data-save-label]', b);
        if (label) label.textContent = on ? 'Saved' : 'Save';
        else if (v) b.setAttribute('aria-label', (on ? 'Remove the ' : 'Save the ') + v.name + (on ? ' from saved' : ''));
      });
      $$('[data-saved-count]').forEach(function (n) { n.textContent = String(saved.length); });
      $$('[data-saved-link], [data-filter="saved"]').forEach(function (el) { el.hidden = saved.length === 0; });
      window.dispatchEvent(new CustomEvent('regis:saved', { detail: saved }));
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-save]');
      if (!b) return;
      e.preventDefault();
      var saved = read(), i = saved.indexOf(b.dataset.save);
      i > -1 ? saved.splice(i, 1) : saved.push(b.dataset.save);
      store.set('localStorage', KEY, JSON.stringify(saved));
      paint();
    });
    window.REGIS.saved = read;
    paint();
  })();

  /* ───────────── share this page ───────────── */
  $$('[data-share-page]').forEach(function (btn) {
    var msg = $('[data-share-page-msg]');
    btn.addEventListener('click', function () {
      var url = location.origin + location.pathname;
      if (location.protocol === 'file:') url = location.href.split('?')[0].split('#')[0];
      if (navigator.share && coarse.matches) {
        navigator.share({ title: btn.dataset.title + ' | ' + data.business.name, url: url }).catch(function () {});
        return;
      }
      var done = function () { if (msg) msg.textContent = 'Link copied.'; };
      var fail = function () { if (msg) msg.textContent = url; };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, fail);
      else fail();
    });
  });

  /* ───────────── premium interactions (desktop pointer, motion allowed) ───────────── */
  function motionOk() { return finePointer.matches && !reduce.matches; }

  // Glass picks up a soft reflection that follows the cursor.
  (function () {
    var lit = null, last = null, raf = 0;
    function apply() {
      raf = 0;
      if (!motionOk()) { if (lit) lit.classList.remove('is-lit'); lit = null; return; }
      var g = last.target && last.target.closest ? last.target.closest('.glass') : null;
      if (lit && lit !== g) lit.classList.remove('is-lit');
      if (g) {
        var r = g.getBoundingClientRect();
        g.style.setProperty('--mx', (last.clientX - r.left).toFixed(1) + 'px');
        g.style.setProperty('--my', (last.clientY - r.top).toFixed(1) + 'px');
        g.classList.add('is-lit');
      }
      lit = g;
    }
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
  })();

  // Primary buttons pull slightly toward the cursor.
  $$('[data-magnetic]').forEach(function (btn) {
    var MAX = 6;
    btn.addEventListener('pointermove', function (e) {
      if (!motionOk() || e.pointerType !== 'mouse' || btn.getAttribute('aria-disabled') === 'true' || btn.disabled) return;
      var r = btn.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      btn.style.setProperty('--tx', (Math.max(-1, Math.min(1, dx)) * MAX).toFixed(2) + 'px');
      btn.style.setProperty('--ty', (Math.max(-1, Math.min(1, dy)) * MAX * 0.6).toFixed(2) + 'px');
    });
    btn.addEventListener('pointerleave', function () { btn.style.setProperty('--tx', '0px'); btn.style.setProperty('--ty', '0px'); });
  });

  /* ───────────── hero film ─────────────
     Real footage, always silent. Loads after the page, never for visitors who ask for
     reduced motion or data saving, pauses when scrolled away, and has a pause button. */
  (function () {
    var hero = $('[data-hero]'), video = $('[data-hero-video]'), pause = $('[data-hero-pause]');
    if (!hero || !video) return;
    var saver = navigator.connection && navigator.connection.saveData;
    if (reduce.matches || saver) return; // photo stays
    var userPaused = false, visible = true, started = false;
    function label() {
      var paused = video.paused;
      pause.setAttribute('aria-pressed', String(paused));
      pause.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
      pause.innerHTML = paused
        ? '<svg class="i" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.500v13l11-6.500-11-6.500Z" fill="currentColor"/></svg>'
        : '<svg class="i" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
    }
    function play() { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
    function start() {
      if (started) return;
      started = true;
      video.addEventListener('playing', function () { video.classList.add('is-on'); pause.hidden = false; label(); }, { once: true });
      video.addEventListener('pause', label);
      video.addEventListener('play', label);
      video.src = video.dataset.src;
      play();
    }
    pause.addEventListener('click', function () {
      if (video.paused) { userPaused = false; play(); } else { userPaused = true; video.pause(); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (!started) return;
        if (!visible) video.pause(); else if (!userPaused) play();
      }, { threshold: 0.15 }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () { if (started && document.hidden) video.pause(); else if (started && visible && !userPaused) play(); });
    if (document.readyState === 'complete') setTimeout(start, 200);
    else window.addEventListener('load', function () { setTimeout(start, 200); });
  })();

  /* ───────────── intro with the real logo: once per visit, skippable, only when a logo file is supplied ───────────── */
  (function () {
    var root = document.documentElement;
    function done() { root.classList.remove('intro-pending'); }
    if (!data.intro || reduce.matches || store.get('sessionStorage', 'regis-intro')) return done();
    store.set('sessionStorage', 'regis-intro', '1');
    var el = document.createElement('div');
    el.className = 'intro';
    el.innerHTML = '<img alt="" width="220" height="220"><button type="button" class="btn btn--glass btn--sm intro__skip">Skip intro</button>';
    var img = el.firstChild;
    img.src = data.intro.logo;
    img.alt = data.intro.alt || '';
    function close() {
      if (!el.parentNode) return;
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 320);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    img.onerror = function () { el.remove(); };
    el.addEventListener('click', close);
    el.addEventListener('animationend', function (e) { if (e.animationName === 'intro-out') el.remove(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    done();
  })();

  /* ───────────── scroll story (desktop): the plate changes as each caption reaches the middle ───────────── */
  (function () {
    var story = $('[data-story]');
    if (!story || !('IntersectionObserver' in window)) return;
    var steps = $$('[data-story-step]', story), shots = $$('[data-story-shot]', story);
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var i = en.target.dataset.storyStep;
        steps.forEach(function (s) { s.classList.toggle('is-on', s === en.target); });
        shots.forEach(function (s) { s.classList.toggle('is-on', s.dataset.storyShot === i); });
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (s) { io2.observe(s); });
  })();

  /* ───────────── showroom: photos, walkaround, film ───────────── */
  $$('[data-stage]').forEach(function (stage) {
    var modes = $$('[data-view]', stage), panes = $$('[data-pane]', stage);
    var filmVideo = $('[data-film-video]', stage);
    var walkEl = $('[data-walk]', stage), walk = null;

    modes.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.dataset.view;
        modes.forEach(function (m) { m.setAttribute('aria-pressed', String(m === btn)); });
        panes.forEach(function (p) { p.hidden = p.dataset.pane !== mode; });
        if (filmVideo && mode !== 'film') filmVideo.pause();
        if (mode === 'walk' && walkEl && !walk) walk = initWalk(walkEl, $('[data-walk-range]', stage));
        if (mode !== 'photos') track('Showroom opened', { view: mode });
      });
    });

    // film picker
    var desc = $('[data-film-desc]', stage);
    $$('[data-film]', stage).forEach(function (pick) {
      pick.addEventListener('click', function () {
        $$('[data-film]', stage).forEach(function (p) { p === pick ? p.setAttribute('aria-current', 'true') : p.removeAttribute('aria-current'); });
        filmVideo.pause();
        filmVideo.poster = pick.dataset.poster;
        filmVideo.querySelector('source').src = pick.dataset.src;
        filmVideo.load();
        if (desc) desc.textContent = pick.dataset.desc;
        var p = filmVideo.play(); if (p && p.catch) p.catch(function () {});
      });
    });

    // photo groups + carousel
    var tabs = $$('[data-gallery-tab]', stage), groups = $$('[data-gallery-group]', stage);
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.setAttribute('aria-pressed', String(t === tab)); });
        groups.forEach(function (g) { g.hidden = g.dataset.galleryGroup !== tab.dataset.galleryTab; });
      });
    });
    groups.forEach(function (group) {
      var list = $('[data-track-list]', group);
      var slides = $$('[data-slide]', group), thumbs = $$('[data-thumb]', group);
      var prev = $('[data-prev]', group), next = $('[data-next]', group), count = $('[data-count]', group);
      var index = 0, raf = 0;
      function go(i) {
        i = Math.max(0, Math.min(slides.length - 1, i));
        list.scrollTo({ left: i * list.clientWidth, behavior: reduce.matches ? 'auto' : 'smooth' });
      }
      function sync() {
        raf = 0;
        if (!list.clientWidth) return;
        index = Math.max(0, Math.min(slides.length - 1, Math.round(list.scrollLeft / list.clientWidth)));
        if (count) count.textContent = String(index + 1);
        if (prev) prev.disabled = index === 0;
        if (next) next.disabled = index === slides.length - 1;
        thumbs.forEach(function (t, i) { i === index ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current'); });
      }
      list.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });
      list.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
      });
      if (prev) prev.addEventListener('click', function () { go(index - 1); });
      if (next) next.addEventListener('click', function () { go(index + 1); });
      thumbs.forEach(function (t, i) { t.addEventListener('click', function () { go(i); }); });
      sync();
    });
  });

  /** Drag-to-walk-around: scrubs through frames taken from real footage. */
  function initWalk(el, range) {
    var canvas = $('canvas', el), ctx = canvas.getContext('2d');
    var n = +el.dataset.frames, base = el.dataset.base;
    var frames = new Array(n), loaded = 0, current = 0;
    var loadEl = $('[data-walk-load]', el);
    var pad = function (i) { return (i < 10 ? '0' : '') + i; };

    function draw() {
      // nearest loaded frame at or before the wanted one, so dragging never shows a blank
      for (var i = current; i >= 0; i--) if (frames[i]) { ctx.drawImage(frames[i], 0, 0, canvas.width, canvas.height); return; }
      for (var j = current + 1; j < n; j++) if (frames[j]) { ctx.drawImage(frames[j], 0, 0, canvas.width, canvas.height); return; }
    }
    function set(i, fromRange) {
      current = Math.max(0, Math.min(n - 1, Math.round(i)));
      if (!fromRange) range.value = String(current);
      range.setAttribute('aria-valuetext', 'View ' + (current + 1) + ' of ' + n);
      draw();
    }
    function load(i) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        frames[i] = img; loaded++;
        if (loaded < n) { loadEl.hidden = false; loadEl.textContent = 'Loading ' + loaded + ' of ' + n; } else loadEl.hidden = true;
        if (i === current || !frames[current]) draw();
      };
      img.onerror = function () { loaded++; if (loaded >= n) loadEl.hidden = true; };
      img.src = base + pad(i) + '.webp';
    }
    load(0);
    for (var k = 1; k < n; k++) load(k);

    var dragging = false, startX = 0, startFrame = 0;
    el.addEventListener('pointerdown', function (e) {
      dragging = true; startX = e.clientX; startFrame = current;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 4) el.classList.add('is-used');
      set(startFrame + (dx / el.clientWidth) * (n - 1) * 1.15);
    });
    var end = function () { dragging = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    range.addEventListener('input', function () { el.classList.add('is-used'); set(+range.value, true); });
    set(0);
    return { set: set };
  }

  /* ───────────── Instagram official embeds (only when post links are in the config) ───────────── */
  (function () {
    var wrap = $('[data-ig-embeds]');
    if (!wrap || data.preview) return;
    var load = function () { loadScript('https://www.instagram.com/embed.js'); };
    if ('IntersectionObserver' in window) {
      var io3 = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io3.disconnect(); load(); } }, { rootMargin: '600px' });
      io3.observe(wrap);
    } else load();
  })();

  /* ───────────── fleet: filters, saved list, compare ───────────── */
  (function () {
    var filters = $('[data-filters]');
    var grid = $('[data-fleet]');
    if (!grid) return;
    var cards = $$('[data-vehicle-card]', grid);
    var status = $('[data-filter-status]'), empty = $('[data-fleet-empty]');
    var active = 'all';

    function apply() {
      var saved = window.REGIS.saved ? window.REGIS.saved() : [];
      if (active === 'saved' && !saved.length) active = 'all';
      var shown = 0;
      cards.forEach(function (c) {
        var on = active === 'all' || (active === 'saved' ? saved.indexOf(c.dataset.slug) > -1 : c.dataset.category === active);
        c.hidden = !on;
        if (on) shown++;
      });
      if (filters) $$('[data-filter]', filters).forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.filter === active)); });
      if (empty) empty.hidden = shown > 0;
      return shown;
    }
    if (filters) filters.addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b) return;
      active = b.dataset.filter;
      var shown = apply();
      if (status) status.textContent = 'Showing ' + shown + (shown === 1 ? ' vehicle' : ' vehicles');
    });
    window.addEventListener('regis:saved', apply);
    if (location.hash === '#saved') { active = 'saved'; }
    apply();

    var panel = $('[data-compare-panel]');
    if (!panel) return;
    var table = $('[data-compare-table]', panel), hint = $('[data-compare-hint]');
    var boxes = $$('[data-compare]');
    var MAX = 3;
    var wait = '<span class="muted">Awaiting confirmation</span>';
    function render() {
      var picked = boxes.filter(function (b) { return b.checked; }).map(function (b) { return vehicleBySlug(b.value); }).filter(Boolean);
      boxes.forEach(function (b) { b.disabled = !b.checked && picked.length >= MAX; });
      if (picked.length < 2) { panel.hidden = true; if (hint) hint.hidden = false; return; }
      var labels = [];
      picked.forEach(function (v) { (v.specs || []).forEach(function (s) { if (labels.indexOf(s.label) < 0) labels.push(s.label); }); });
      var row = function (label, fn) {
        return '<tr><th scope="row">' + escapeHtml(label) + '</th>' + picked.map(function (v) { return '<td>' + fn(v) + '</td>'; }).join('') + '</tr>';
      };
      table.innerHTML =
        '<table><thead><tr><td></td>' +
        picked.map(function (v) { return '<th scope="col"><a href="' + v.url + '">' + escapeHtml(v.name) + '</a></th>'; }).join('') +
        '</tr></thead><tbody>' +
        row('Daily rate', function (v) { return v.dailyRate == null ? wait : escapeHtml(v.rateLabel || money(v.dailyRate)); }) +
        row('Deposit', function (v) { return v.deposit == null ? wait : money(v.deposit); }) +
        row('Category', function (v) { return escapeHtml(v.category); }) +
        labels.map(function (l) {
          return row(l, function (v) {
            var s = (v.specs || []).filter(function (x) { return x.label === l; })[0];
            return s ? escapeHtml(s.value) : '<span class="muted">Not listed</span>';
          });
        }).join('') +
        '</tbody></table>';
      var wasHidden = panel.hidden;
      panel.hidden = false;
      if (hint) hint.hidden = true;
      if (wasHidden) panel.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
    }
    boxes.forEach(function (b) { b.addEventListener('change', render); });
    var clear = $('[data-compare-clear]', panel);
    if (clear) clear.addEventListener('click', function () { boxes.forEach(function (b) { b.checked = false; }); render(); if (boxes[0]) boxes[0].focus(); });
  })();
})();
