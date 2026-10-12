/* REGIS EXOTICS — the planner: vehicle, dates, availability, estimate, requirements, inquiry.
   Rules this file keeps:
   • Days = calendar days from pickup to return, minimum 1.
   • A vehicle with no confirmed rate never shows a price; it asks the visitor to request a quote.
   • A day is only shown as booked when it came from the real availability source.
   • "Request received" is only shown after the backend confirms it. */
(function () {
  'use strict';
  var R = window.REGIS;
  var root = document.querySelector('[data-booking]');
  if (!R || !root) return;

  var data = R.data, track = R.track, money = R.money;
  var mode = root.dataset.mode; // "estimate" | "request"
  var $ = function (sel) { return root.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  var ig = data.business.instagram;
  var IG_DM = 'https://ig.me/m/' + ig;

  /* ───────────── dates (all maths in UTC so time zones can't shift a day) ───────────── */
  var DAY = 864e5;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var isoOf = function (y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); };
  var parse = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(t);
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
  };
  var toIso = function (t) { return new Date(t).toISOString().slice(0, 10); };
  var addDays = function (iso, n) { return toIso(parse(iso) + n * DAY); };
  var now = new Date();
  var TODAY = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  var MAX = addDays(TODAY, 548); // requests up to about 18 months ahead
  var fmt = function (iso, o) { return new Date(parse(iso)).toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC' }, o)); };
  var fmtShort = function (iso) { return fmt(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); };
  var fmtLong = function (iso) { return fmt(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); };

  /** Calendar days from pickup to return, minimum 1. */
  function rentalDays(pickup, ret) { return Math.max(1, Math.round((parse(ret) - parse(pickup)) / DAY)); }

  /* ───────────── elements + state ───────────── */
  var els = {
    vehicles: $$('[data-vehicle]'),
    pickup: $('[data-pickup]'), ret: $('[data-return]'),
    cal: $('[data-cal]'), calMsg: $('[data-cal-msg]'), calNote: $('[data-cal-note]'),
    estVehicle: $('[data-est-vehicle]'), estEmpty: $('[data-estimate-empty]'), estLines: $('[data-estimate-lines]'), estNoRate: $('[data-estimate-norate]'),
    estLabel: $('[data-est-label]'), estTotal: $('[data-est-total]'), estDeposit: $('[data-est-deposit]'), estSum: $('[data-est-sum]'),
    share: $('[data-share]'), download: $('[data-download]'), shareMsg: $('[data-share-msg]'),
    eligMsg: $('[data-elig-msg]'), cont: $('[data-continue]'),
    submit: $('[data-submit]'), igCopy: $('[data-ig-copy]'), status: $('[data-status]'),
    manual: $('[data-manual]'), manualText: $('[data-manual-text]'),
    formBody: $('[data-form-body]'), done: $('[data-done]'), doneEmail: $('[data-done-email]'), doneSummary: $('[data-done-summary]')
  };
  var isRadio = els.vehicles.length && els.vehicles[0].type === 'radio';
  var readVehicle = function () {
    if (!isRadio) return els.vehicles[0].value;
    var c = els.vehicles.filter(function (r) { return r.checked; })[0];
    return c ? c.value : els.vehicles[0].value;
  };
  var qs = new URLSearchParams(location.search);
  var s = {
    vehicle: readVehicle(),
    pickup: null, ret: null,
    view: TODAY.slice(0, 7), // "YYYY-MM" on screen
    focus: null,             // day that holds keyboard focus in the grid
    hover: null,
    booked: null,            // Set of ISO days, or null when there is no real source
    lastQuote: ''
  };
  var vehicle = function () { return R.vehicleBySlug(s.vehicle) || data.vehicles[0]; };
  var occasion = function () { var c = root.querySelector('[data-occasion]:checked'); return c ? c.value : ''; };

  var inWindow = function (iso) { return !!parse(iso) && iso >= TODAY && iso <= MAX; };
  var isBooked = function (iso) { return !!(s.booked && s.booked.has(iso)); };
  function rangeHasBooked(a, b) {
    if (!s.booked) return false;
    for (var d = a; d <= b; d = addDays(d, 1)) if (s.booked.has(d)) return true;
    return false;
  }

  // Prefill from a shared link: ?vehicle=…&pickup=YYYY-MM-DD&return=YYYY-MM-DD
  (function () {
    var v = qs.get('vehicle');
    if (v && R.vehicleBySlug(v) && isRadio) {
      els.vehicles.forEach(function (r) { r.checked = r.value === v; });
      s.vehicle = v;
    }
    var p = qs.get('pickup'), r = qs.get('return');
    if (inWindow(p)) {
      s.pickup = p; s.view = p.slice(0, 7);
      if (inWindow(r) && r >= p) s.ret = r;
    }
    var occ = qs.get('occasion');
    if (occ) $$('[data-occasion]').forEach(function (o) { if (o.value === occ) o.checked = true; });
    ['age', 'insurance'].forEach(function (k) {
      var val = qs.get(k);
      if (val !== 'yes' && val !== 'no') return;
      var input = root.querySelector('[data-elig="' + k + '"][value="' + val + '"]');
      if (input) input.checked = true;
    });
  })();

  /* ───────────── calendar ───────────── */
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var CHEV_L = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  function shiftMonth(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }

  function renderCal(keepFocus) {
    var y = +s.view.slice(0, 4), m = +s.view.slice(5, 7) - 1;
    var first = new Date(Date.UTC(y, m, 1));
    var count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var lead = first.getUTCDay();
    var title = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var canPrev = s.view > TODAY.slice(0, 7), canNext = s.view < MAX.slice(0, 7);

    // Which day is tabbable: the focused one if visible, else pickup, else today, else the 1st.
    var inView = function (iso) { return iso && iso.slice(0, 7) === s.view; };
    var tab = inView(s.focus) ? s.focus : inView(s.pickup) ? s.pickup : inView(TODAY) ? TODAY : isoOf(y, m, 1);
    var previewEnd = s.pickup && !s.ret && s.hover && s.hover > s.pickup && !rangeHasBooked(s.pickup, s.hover) ? s.hover : null;

    var html = '<div class="cal__head">' +
      '<button type="button" class="cal__nav" data-cal-prev aria-label="Previous month"' + (canPrev ? '' : ' disabled') + '>' + CHEV_L + '</button>' +
      '<div class="cal__title" aria-live="polite">' + title + '</div>' +
      '<button type="button" class="cal__nav" data-cal-next aria-label="Next month"' + (canNext ? '' : ' disabled') + '>' + CHEV_R + '</button></div>' +
      '<table class="cal__grid" role="grid" aria-label="' + title + '. Choose a pickup date, then a return date."><thead><tr>' +
      WEEKDAYS.map(function (w) { return '<th scope="col" abbr="' + w + '">' + w.slice(0, 2) + '</th>'; }).join('') +
      '</tr></thead><tbody><tr>';
    for (var i = 0; i < lead; i++) html += '<td></td>';
    for (var d = 1; d <= count; d++) {
      var iso = isoOf(y, m, d);
      var past = iso < TODAY || iso > MAX, booked = isBooked(iso);
      var cls = ['cal__day'], label = fmtLong(iso);
      if (iso === TODAY) cls.push('is-today');
      if (booked) { cls.push('is-booked'); label += ', booked'; }
      else if (past) label += ', not selectable';
      if (s.pickup === iso) { cls.push('is-start'); label += ', pickup date'; if (!s.ret && !previewEnd) cls.push('is-only'); }
      if (s.ret === iso) { cls.push('is-end'); label += ', return date'; }
      if (s.pickup && s.ret && iso > s.pickup && iso < s.ret) cls.push('is-range');
      if (previewEnd && iso > s.pickup && iso <= previewEnd) cls.push('is-preview');
      html += '<td role="gridcell"><button type="button" class="' + cls.join(' ') + '" data-date="' + iso + '" tabindex="' + (iso === tab ? 0 : -1) + '"' +
        ' aria-label="' + label + '" aria-pressed="' + (s.pickup === iso || s.ret === iso) + '"' + (past || booked ? ' aria-disabled="true"' : '') + '>' + d + '</button></td>';
      if ((lead + d) % 7 === 0 && d < count) html += '</tr><tr>';
    }
    html += '</tr></tbody></table>' +
      '<div class="cal__legend"><span><i class="k-sel"></i>Your dates</span>' + (s.booked ? '<span><i class="k-booked"></i>Booked</span>' : '') + '</div>';
    els.cal.innerHTML = html;
    if (keepFocus) {
      var b = els.cal.querySelector('[data-date="' + tab + '"]');
      if (b) b.focus();
    }
  }

  function say(text) { els.calMsg.textContent = text || ''; }

  function pick(iso) {
    if (!inWindow(iso)) return;
    if (isBooked(iso)) return say(fmtShort(iso) + ' is booked. Choose another day.');
    say('');
    if (!s.pickup || s.ret || iso < s.pickup) { s.pickup = iso; s.ret = null; }
    else {
      if (rangeHasBooked(s.pickup, iso)) return say('Those dates include a booked day. Choose a range without one.');
      s.ret = iso;
    }
    s.hover = null;
    s.focus = iso;
    sync(true);
  }

  els.cal.addEventListener('click', function (e) {
    var day = e.target.closest('[data-date]');
    if (day) return pick(day.dataset.date);
    var step = e.target.closest('[data-cal-prev]') ? -1 : e.target.closest('[data-cal-next]') ? 1 : 0;
    if (!step) return;
    s.view = shiftMonth(s.view, step); s.focus = null; renderCal();
    var same = els.cal.querySelector(step < 0 ? '[data-cal-prev]' : '[data-cal-next]');
    (same.disabled ? els.cal.querySelector(step < 0 ? '[data-cal-next]' : '[data-cal-prev]') : same).focus();
  });
  els.cal.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse' || !s.pickup || s.ret) return;
    var day = e.target.closest('[data-date]');
    var h = day ? day.dataset.date : null;
    if (h === s.hover) return;
    s.hover = h;
    var hadFocus = els.cal.contains(document.activeElement) && document.activeElement.hasAttribute('data-date');
    renderCal(hadFocus);
  });
  els.cal.addEventListener('keydown', function (e) {
    var day = e.target.closest && e.target.closest('[data-date]');
    if (!day) return;
    var cur = day.dataset.date, next = null;
    var dow = new Date(parse(cur)).getUTCDay();
    switch (e.key) {
      case 'ArrowLeft': next = addDays(cur, -1); break;
      case 'ArrowRight': next = addDays(cur, 1); break;
      case 'ArrowUp': next = addDays(cur, -7); break;
      case 'ArrowDown': next = addDays(cur, 7); break;
      case 'Home': next = addDays(cur, -dow); break;
      case 'End': next = addDays(cur, 6 - dow); break;
      case 'PageUp': next = shiftMonth(cur.slice(0, 7), -1) + '-01'; break;
      case 'PageDown': next = shiftMonth(cur.slice(0, 7), 1) + '-01'; break;
      default: return;
    }
    e.preventDefault();
    if (next < TODAY) next = TODAY;
    if (next > MAX) next = MAX;
    s.focus = next;
    s.view = next.slice(0, 7);
    if (s.pickup && !s.ret) s.hover = next;
    renderCal(true);
  });

  // The typed date fields and the calendar stay in step with each other.
  els.pickup.addEventListener('change', function () {
    var v = els.pickup.value;
    if (!v) { s.pickup = null; s.ret = null; return sync(); }
    if (!inWindow(v)) { say('Pickup needs to be today or later.'); return sync(); }
    if (isBooked(v)) { say(fmtShort(v) + ' is booked. Choose another day.'); return sync(); }
    say('');
    s.pickup = v;
    if (s.ret && (s.ret < v || rangeHasBooked(v, s.ret))) s.ret = null;
    s.view = v.slice(0, 7);
    sync();
  });
  els.ret.addEventListener('change', function () {
    var v = els.ret.value;
    if (!v) { s.ret = null; return sync(); }
    if (!s.pickup) { say('Choose a pickup date first.'); return sync(); }
    if (!inWindow(v) || v < s.pickup) { say('Return needs to be on or after pickup.'); return sync(); }
    if (rangeHasBooked(s.pickup, v)) { say('Those dates include a booked day. Choose a range without one.'); return sync(); }
    say('');
    s.ret = v;
    sync();
  });
  if (isRadio) els.vehicles.forEach(function (r) {
    r.addEventListener('change', function () {
      s.vehicle = readVehicle();
      s.booked = null;
      sync();
      loadAvailability();
    });
  });
  $$('[data-occasion]').forEach(function (o) { o.addEventListener('change', updateLinks); });

  /* ───────────── availability: real source only ───────────── */
  var NOTE_DEFAULT = els.calNote.textContent;
  function loadAvailability() {
    var ep = data.availability.endpoint;
    els.calNote.textContent = NOTE_DEFAULT;
    if (!ep || !window.fetch) return;
    var forVehicle = s.vehicle;
    fetch(ep + (ep.indexOf('?') > -1 ? '&' : '?') + 'vehicle=' + encodeURIComponent(forVehicle), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (j) {
        if (!j || j.ok !== true || !Array.isArray(j.booked)) throw new Error('Unexpected response');
        if (forVehicle !== s.vehicle) return;
        var set = new Set();
        j.booked.forEach(function (range) {
          var a = range && range.start, b = (range && range.end) || a;
          if (!parse(a) || !parse(b) || b < a) return;
          if (a < TODAY) a = TODAY;
          for (var d = a, i = 0; d <= b && d <= MAX && i < 800; d = addDays(d, 1), i++) set.add(d);
        });
        s.booked = set;
        var when = j.updated ? new Date(j.updated) : null;
        els.calNote.textContent = 'Booked days come from the REGIS EXOTICS calendar' +
          (when && !isNaN(when) ? ', checked ' + when.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') +
          '. Open days still need to be confirmed by REGIS EXOTICS.';
        if (s.pickup && (isBooked(s.pickup) || (s.ret && rangeHasBooked(s.pickup, s.ret)))) {
          s.pickup = null; s.ret = null;
          say('The dates you had chosen include a booked day. Choose new dates.');
        }
        sync();
      })
      .catch(function () { s.booked = null; }); // no claims without real data
  }

  /* ───────────── requirements ───────────── */
  function elig() {
    var get = function (k) { var c = root.querySelector('[data-elig="' + k + '"]:checked'); return c ? c.value : null; };
    var age = get('age'), ins = get('insurance');
    return { age: age, insurance: ins, blocked: age === 'no' || ins === 'no', ok: age === 'yes' && ins === 'yes' };
  }
  function renderElig() {
    var e = elig(), min = data.requirements.minAge, parts = [];
    if (e.age === 'no') parts.push('Renters need to be ' + min + ' or older, so a booking can\'t be taken in your name yet.');
    if (e.insurance === 'no') parts.push('Full insurance is required to rent. Once you have it in place, you\'re welcome to send an inquiry.');
    if (e.blocked) {
      els.eligMsg.dataset.state = 'no';
      els.eligMsg.innerHTML = parts.join(' ') + ' Questions? <a href="' + IG_DM + '" target="_blank" rel="noopener" data-track="Instagram click">Message @' + ig + ' on Instagram</a>.';
    } else if (e.ok) {
      els.eligMsg.dataset.state = 'ok';
      els.eligMsg.textContent = 'You meet both requirements: ' + min + ' or older, with full insurance.';
    } else {
      delete els.eligMsg.dataset.state;
      els.eligMsg.textContent = '';
    }
    [els.cont, els.igCopy].forEach(function (a) {
      if (!a) return;
      e.blocked ? a.setAttribute('aria-disabled', 'true') : a.removeAttribute('aria-disabled');
    });
    if (els.submit) els.submit.disabled = e.blocked;
    return e;
  }
  $$('[data-elig]').forEach(function (r) { r.addEventListener('change', function () { renderElig(); updateLinks(); }); });
  if (els.cont) els.cont.addEventListener('click', function (e) { if (els.cont.getAttribute('aria-disabled') === 'true') e.preventDefault(); });

  /* ───────────── estimate ───────────── */
  /** The daily rate for a rental of n days: flat, or the tier the rental reaches. */
  function rateFor(v, n) {
    if (!v.rateTiers) return v.dailyRate;
    var r = null;
    v.rateTiers.forEach(function (t) { if (n >= t.minDays) r = t.rate; });
    return r;
  }
  function estimate() {
    if (!s.pickup || !s.ret) return null;
    var v = vehicle(), n = rentalDays(s.pickup, s.ret);
    // weekly and monthly rentals are quoted directly, so no price is shown for them
    var long = v.longFrom != null && n >= v.longFrom;
    var rate = long ? null : rateFor(v, n);
    var e = { vehicle: v, days: n, daysLabel: n + (n === 1 ? ' day' : ' days'), rate: rate, deposit: v.deposit, priced: rate != null, long: long };
    if (e.priced) {
      e.total = n * rate;
      e.label = e.daysLabel + ' × ' + money(rate);
      e.sum = v.deposit != null ? e.total + v.deposit : null;
    }
    return e;
  }
  /** One line used in the copied inquiry, the email and the receipt. */
  function estimateLine(e) {
    if (e.long) return e.daysLabel + '. Weekly and monthly rentals are quoted directly, quote requested';
    if (!e.priced) return e.daysLabel + '. Daily rate awaiting confirmation, quote requested';
    return e.label + ' = ' + money(e.total) + (e.deposit != null ? ', plus ' + money(e.deposit) + ' deposit' : ', deposit awaiting confirmation') + ' (estimate, not a confirmed quote)';
  }
  function renderEstimate() {
    var e = estimate(), v = vehicle();
    els.estVehicle.textContent = v.name;
    els.estEmpty.hidden = !!e;
    els.estLines.hidden = !(e && e.priced);
    els.estNoRate.hidden = !(e && !e.priced);
    if (e && !e.priced) els.estNoRate.textContent = e.long
      ? 'Weekly and monthly rentals are quoted directly. Send your dates and message @' + ig + ' for the price.'
      : 'The daily rate for this vehicle is awaiting confirmation. Send your dates and REGIS EXOTICS will quote you.';
    if (e && e.priced) {
      els.estLabel.textContent = e.label;
      els.estTotal.textContent = money(e.total);
      els.estDeposit.textContent = e.deposit != null ? money(e.deposit) : 'Awaiting confirmation';
      els.estSum.textContent = e.sum != null ? money(e.sum) : 'Awaiting confirmation';
      var key = v.slug + s.pickup + s.ret;
      if (key !== s.lastQuote) { s.lastQuote = key; track('Quote calculated', { vehicle: v.slug, days: e.days }); }
    } else if (!e) {
      els.estEmpty.textContent = s.pickup ? 'Now choose a return date.'
        : v.dailyRate == null ? 'Choose your dates. The daily rate for this vehicle is awaiting confirmation, so REGIS EXOTICS will quote you.'
        : 'Choose a pickup and return date to see the price.';
    }
    // "Estimate — not a confirmed quote" belongs to a price; hide it and the rule when there is no rate to estimate from.
    var flag = $('.estimate__flag'), rule = $('.estimate__rule');
    var noPrice = v.dailyRate == null || !!(e && !e.priced);
    if (flag) flag.hidden = noPrice;
    if (rule) rule.hidden = noPrice;
    els.share.disabled = !e;
    els.download.disabled = !(e && e.priced);
    els.shareMsg.textContent = '';
  }

  /** The shareable link: the vehicle is in the path, the dates in the query. */
  function quoteUrl() {
    var u = new URL(vehicle().url, location.href);
    u.search = '';
    if (s.pickup) u.searchParams.set('pickup', s.pickup);
    if (s.ret) u.searchParams.set('return', s.ret);
    u.hash = 'estimate';
    return u.href;
  }
  function updateLinks() {
    // Keep the address bar shareable as choices change (no reload, no history spam).
    try {
      var u = new URL(location.href);
      ['pickup', 'return'].forEach(function (k) { u.searchParams.delete(k); });
      if (s.pickup) u.searchParams.set('pickup', s.pickup);
      if (s.ret) u.searchParams.set('return', s.ret);
      if (mode === 'request') u.searchParams.set('vehicle', s.vehicle);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
    if (els.cont) {
      var e2 = elig();
      var c = new URL(data.urls.plan, location.href);
      c.searchParams.set('vehicle', s.vehicle);
      if (s.pickup) c.searchParams.set('pickup', s.pickup);
      if (s.ret) c.searchParams.set('return', s.ret);
      if (e2.age) c.searchParams.set('age', e2.age);
      if (e2.insurance) c.searchParams.set('insurance', e2.insurance);
      els.cont.href = c.href;
    }
  }

  function sync(keepFocus) {
    els.pickup.min = TODAY; els.pickup.max = MAX;
    els.ret.min = s.pickup || TODAY; els.ret.max = MAX;
    els.pickup.value = s.pickup || '';
    els.ret.value = s.ret || '';
    renderCal(keepFocus);
    renderEstimate();
    updateLinks();
  }

  /* ───────────── share + download ───────────── */
  function toast(text) { els.shareMsg.textContent = text; }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () { if (!legacyCopy(text)) throw new Error('copy failed'); });
    return legacyCopy(text) ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  els.share.addEventListener('click', function () {
    var e = estimate();
    if (!e) return;
    var url = quoteUrl();
    var text = e.vehicle.name + ', ' + fmtShort(s.pickup) + ' to ' + fmtShort(s.ret) + (e.priced ? ': ' + money(e.total) + ' estimate (not a confirmed quote).' : '.');
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      navigator.share({ title: data.business.name + ' estimate', text: text, url: url })
        .then(function () { track('Estimate shared', { method: 'share sheet' }); })
        .catch(function () {});
      return;
    }
    copyText(url).then(function () {
      toast('Link copied. Anyone who opens it sees these dates' + (e.priced ? ' and this estimate.' : '.'));
      track('Estimate shared', { method: 'copy link' });
    }).catch(function () { toast('Copy this link: ' + url); });
  });

  els.download.addEventListener('click', function () {
    var e = estimate();
    if (!e || !e.priced) return;
    var ready = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('600 64px "Bodoni Moda"'), document.fonts.load('400 30px "Archivo"')]).catch(function () {})
      : Promise.resolve();
    ready.then(function () { drawEstimate(e); });
  });

  /** A branded estimate card, drawn in the browser and saved as an image. */
  function drawEstimate(e) {
    var W = 1080, H = 1350, P = 84;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    var serif = '"Bodoni Moda", Didot, "Times New Roman", serif', sans = '"Archivo", system-ui, sans-serif';

    x.fillStyle = '#07090d'; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W * 0.92, -60, 0, W * 0.92, -60, 880);
    g.addColorStop(0, 'rgba(53,120,255,0.42)'); g.addColorStop(1, 'rgba(53,120,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    x.fillStyle = '#f4f6fa'; x.font = '600 40px ' + serif;
    spaced(x, 'REGIS', P, 132, 7);
    var wR = spacedWidth(x, 'REGIS', 7);
    x.font = '500 20px ' + sans; x.fillStyle = '#a4b0c2';
    spaced(x, 'EXOTICS', P + wR + 14, 130, 7);

    // The label the business asked for, impossible to miss.
    var flag = 'Estimate — not a confirmed quote';
    x.font = '600 28px ' + sans;
    var fw = x.measureText(flag).width + 48;
    roundRect(x, P, 190, fw, 58, 29); x.strokeStyle = 'rgba(244,246,250,0.55)'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#f4f6fa'; x.fillText(flag, P + 24, 229);

    x.font = '500 76px ' + serif; x.fillStyle = '#f4f6fa';
    var y = wrap(x, e.vehicle.name, P, 372, W - 2 * P, 82, true);

    y += 98;
    var rows = [['Pickup', fmtShort(s.pickup)], ['Return', fmtShort(s.ret)], ['Daily rate', money(e.rate)], ['Rental days', String(e.days)]];
    rows.forEach(function (r) {
      line(x, P, y - 44, W - P);
      x.font = '400 31px ' + sans; x.fillStyle = '#a4b0c2'; x.textAlign = 'left'; x.fillText(r[0], P, y);
      x.font = '500 31px ' + sans; x.fillStyle = '#f4f6fa'; x.textAlign = 'right'; x.fillText(r[1], W - P, y);
      y += 76;
    });
    line(x, P, y - 44, W - P);
    y += 40;
    x.textAlign = 'left'; x.font = '400 31px ' + sans; x.fillStyle = '#c9d2e0'; x.fillText('Estimated rental (' + e.label + ')', P, y);
    y += 108;
    x.font = '600 112px ' + sans; x.fillStyle = '#f4f6fa';
    try { x.fontStretch = 'condensed'; x.letterSpacing = '-2px'; } catch (err) {}
    x.fillText(money(e.total), P, y);
    try { x.fontStretch = 'normal'; x.letterSpacing = '0px'; } catch (err) {}
    y += 70;
    x.font = '400 31px ' + sans; x.fillStyle = '#c9d2e0';
    x.fillText(e.deposit != null ? 'Separate deposit: ' + money(e.deposit) : 'Deposit: awaiting confirmation', P, y);

    var fy = H - 200;
    line(x, P, fy - 46, W - P);
    x.font = '400 25px ' + sans; x.fillStyle = '#a4b0c2';
    fy = wrap(x, 'Before any taxes or fees. Renters must be ' + data.requirements.minAge + ' or older with full insurance. REGIS EXOTICS confirms the final price and availability. Nothing is booked until they confirm with you.', P, fy, W - 2 * P, 37);
    x.fillStyle = '#8db4ff'; x.fillText('Instagram @' + ig, P, fy + 52);
    x.fillStyle = '#a4b0c2'; x.textAlign = 'right';
    x.fillText('Created ' + fmt(TODAY, { month: 'short', day: 'numeric', year: 'numeric' }), W - P, fy + 52);

    var name = 'regis-exotics-estimate-' + s.pickup + '.png';
    var save = function (href) {
      var a = document.createElement('a');
      a.href = href; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      toast('Estimate saved as ' + name + '.');
    };
    if (c.toBlob) c.toBlob(function (blob) {
      if (!blob) return toast('The estimate image could not be created in this browser.');
      var url = URL.createObjectURL(blob);
      save(url);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, 'image/png');
    else save(c.toDataURL('image/png'));
  }
  function line(x, x1, y, x2) { x.fillStyle = 'rgba(244,246,250,0.13)'; x.fillRect(x1, y, x2 - x1, 1.5); }
  function roundRect(x, l, t, w, h, r) {
    x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
  }
  function spacedWidth(x, text, gap) { var w = 0; for (var i = 0; i < text.length; i++) w += x.measureText(text[i]).width + gap; return w; }
  function spaced(x, text, left, y, gap) { for (var i = 0; i < text.length; i++) { x.fillText(text[i], left, y); left += x.measureText(text[i]).width + gap; } }
  // The serif's hyphen is a hairline, so hyphens are drawn as a short bar ("Escalade-V" stays readable).
  function hyWidth(x, text) {
    var parts = text.split('-'), em = x.measureText('M').width, w = 0;
    parts.forEach(function (part, i) { w += x.measureText(part).width + (i < parts.length - 1 ? em * 0.42 : 0); });
    return w;
  }
  function hyFill(x, text, left, y) {
    var parts = text.split('-'), em = x.measureText('M').width;
    parts.forEach(function (part, i) {
      x.fillText(part, left, y);
      left += x.measureText(part).width;
      if (i < parts.length - 1) { x.fillRect(left + em * 0.07, y - em * 0.36, em * 0.28, Math.max(3, em * 0.075)); left += em * 0.42; }
    });
  }
  function wrap(x, text, left, y, max, lh, sturdyHyphen) {
    var words = text.split(' '), row = '';
    var measure = sturdyHyphen ? function (t) { return hyWidth(x, t); } : function (t) { return x.measureText(t).width; };
    var fill = sturdyHyphen ? function (t) { hyFill(x, t, left, y); } : function (t) { x.fillText(t, left, y); };
    x.textAlign = 'left';
    words.forEach(function (w) {
      var test = row ? row + ' ' + w : w;
      if (measure(test) > max && row) { fill(row); row = w; y += lh; } else row = test;
    });
    fill(row);
    return y;
  }

  /* ───────────── the inquiry (plan page) ───────────── */
  function field(name) { return root.elements ? root.elements[name] : null; }
  function val(name) { var f = field(name); return f && f.value ? String(f.value).trim() : ''; }
  function summaryText() {
    var e = estimate(), el = elig(), v = vehicle(), occ = occasion();
    var lines = [
      'Booking inquiry for ' + data.business.name,
      'Vehicle: ' + v.name,
      'Pickup: ' + (s.pickup ? fmtShort(s.pickup) : 'not chosen'),
      'Return: ' + (s.ret ? fmtShort(s.ret) : 'not chosen')
    ];
    if (e) lines.push('Estimate: ' + estimateLine(e));
    if (occ) lines.push('Occasion: ' + occ);
    lines.push('Name: ' + val('name'));
    lines.push('Email: ' + val('email'));
    if (val('phone')) lines.push('Phone: ' + val('phone'));
    lines.push(data.requirements.minAge + ' or older: ' + (el.age === 'yes' ? 'Yes' : el.age === 'no' ? 'No' : 'Not answered'));
    lines.push('Full insurance: ' + (el.insurance === 'yes' ? 'Yes' : el.insurance === 'no' ? 'No' : 'Not answered'));
    if (val('message')) lines.push('Message: ' + val('message'));
    return lines.join('\n');
  }
  function status(text) { if (els.status) els.status.textContent = text || ''; }
  function ready() {
    // Dates first, then the browser's own checks on the required fields.
    if (!s.pickup || !s.ret) {
      say(s.pickup ? 'Choose a return date.' : 'Choose your pickup and return dates.');
      (s.pickup ? els.ret : els.pickup).focus();
      return false;
    }
    if (root.reportValidity && !root.reportValidity()) return false;
    return !elig().blocked;
  }

  if (mode === 'request') {
    var loadedAt = Date.now();
    var sending = false;

    // "Copy inquiry and open Instagram": the only action when no backend is connected, and the
    // fallback whenever sending fails. It never claims anything was sent; the visitor sends the DM.
    els.igCopy.addEventListener('click', function (e) {
      if (!ready()) { e.preventDefault(); return; }
      var text = summaryText();
      var copied = 'Inquiry copied. Paste it into your Instagram message to @' + ig + ' and send it. Nothing has been sent from this page.';
      var showManual = function () { els.manualText.value = text; els.manual.hidden = false; status('Copying was blocked, so your inquiry is shown below to copy by hand.'); };
      els.manual.hidden = true;
      // Copy inside the click itself so the browser still lets Instagram open in a new tab.
      if (legacyCopy(text)) status(copied);
      else if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { status(copied); }, showManual);
      else showManual();
    });

    root.addEventListener('submit', function (e) {
      e.preventDefault();
      var endpoint = data.form.endpoint;
      if (!endpoint || sending) return; // no backend → the Instagram button is the only action
      if (!ready()) return;
      var wait = 20000 - (Date.now() - (+R.store.get('sessionStorage', 'regis-sent') || 0));
      if (wait > 0) return status('Please wait ' + Math.ceil(wait / 1000) + ' seconds before sending again.');

      var est = estimate(), el = elig(), v = vehicle();
      var payload = {
        name: val('name'), email: val('email'), phone: val('phone'), message: val('message'),
        vehicle: v.name, vehicleSlug: v.slug, occasion: occasion(),
        pickup: s.pickup, return: s.ret, days: est.days, estimate: estimateLine(est),
        age21: el.age, fullInsurance: el.insurance,
        _gotcha: val('_gotcha'),
        _subject: 'Booking request: ' + v.name + ', ' + s.pickup + ' to ' + s.ret,
        elapsedMs: Date.now() - loadedAt
      };

      sending = true;
      status('');
      var label = els.submit.textContent;
      els.submit.disabled = true;
      els.submit.textContent = 'Sending…';
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (res) { return res.json().catch(function () { return null; }).then(function (j) { return { res: res, j: j }; }); })
        .then(function (o) {
          // Success only when the backend itself says so.
          if (!o.res.ok || !o.j || o.j.ok !== true) { var err = new Error('rejected'); err.status = o.res.status; err.code = o.j && o.j.error; throw err; }
          R.store.set('sessionStorage', 'regis-sent', String(Date.now()));
          els.doneSummary.textContent = summaryText();
          if (o.j.confirmationSent === true) {
            els.doneEmail.textContent = 'A copy of your request is on its way to ' + payload.email + '.';
            els.doneEmail.hidden = false;
          }
          els.formBody.hidden = true;
          els.done.hidden = false;
          els.done.focus();
          track('Form submitted', { vehicle: v.slug });
        })
        .catch(function (err) {
          var why = err && err.status === 429 ? 'Too many requests were sent in a short time.'
            : err && err.code === 'invalid' ? 'Some details were not accepted. Check your dates and email address.'
            : 'The request could not be delivered.';
          status(why + ' Nothing was sent. You can try again, or copy your inquiry and send it on Instagram.');
          els.igCopy.hidden = false;
        })
        .then(function () {
          clearTimeout(timer);
          sending = false;
          els.submit.textContent = label;
          els.submit.disabled = elig().blocked;
        });
    });
  }

  /* ───────────── start ───────────── */
  renderElig();
  sync();
  loadAvailability();
})();
