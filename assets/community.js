/* REGIS EXOTICS — reviews and email support.
   Rules this file keeps:
   • Only reviews returned by the server (approved ones) are ever shown. Nothing is seeded.
   • The average is the server's own calculation over every approved review.
   • A form says "received" only after the server confirms it. */
(function () {
  'use strict';
  var R = window.REGIS;
  if (!R) return;
  var data = R.data, track = R.track;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var loadedAt = Date.now();

  function post(url, payload) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload), signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.json().catch(function () { return null; }).then(function (j) { return { res: res, j: j }; }); })
      .then(function (o) {
        clearTimeout(timer);
        if (!o.res.ok || !o.j || o.j.ok !== true) { var err = new Error('rejected'); err.status = o.res.status; err.code = o.j && o.j.error; throw err; }
        return o.j;
      }, function (e) { clearTimeout(timer); throw e; });
  }
  function why(err, what) {
    return (err && err.status === 429 ? 'Too many requests were sent in a short time.'
      : err && err.code === 'invalid' ? 'Some details were not accepted. Check the fields and try again.'
      : 'Your ' + what + ' could not be delivered.') + ' Nothing was sent.';
  }

  /* ───────────── approved reviews ───────────── */
  var lists = $$('[data-review-list]');
  var endpoint = data.reviews.endpoint;
  function stars(n) {
    var el = document.createElement('p');
    el.className = 'review__stars';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', n + ' out of 5 stars');
    el.textContent = '★★★★★'.slice(0, n);
    var off = document.createElement('span');
    off.textContent = '★★★★★'.slice(n);
    el.appendChild(off);
    return el;
  }
  function card(r) {
    var fig = document.createElement('figure');
    fig.className = 'review';
    fig.appendChild(stars(Math.max(1, Math.min(5, Math.round(r.rating)))));
    var q = document.createElement('blockquote');
    q.textContent = r.body; // text only: review content is never treated as HTML
    fig.appendChild(q);
    var cap = document.createElement('figcaption');
    var name = document.createElement('strong');
    name.textContent = r.display_name;
    cap.appendChild(name);
    var v = r.vehicle_slug && R.vehicleBySlug(r.vehicle_slug);
    if (v) { var vs = document.createElement('span'); vs.textContent = v.name; cap.appendChild(vs); }
    if (r.verified_rental === true) { var b = document.createElement('span'); b.className = 'chip'; b.textContent = 'Verified renter'; cap.appendChild(b); }
    if (r.published_at) {
      var d = new Date(r.published_at);
      if (!isNaN(d)) { var t = document.createElement('time'); t.dateTime = d.toISOString().slice(0, 10); t.textContent = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); cap.appendChild(t); }
    }
    var rep = document.createElement('a');
    rep.className = 'review__report';
    rep.href = data.urls.support + '?topic=' + encodeURIComponent('Something else') + '&reference=' + encodeURIComponent('review-' + r.id);
    rep.textContent = 'Report';
    rep.setAttribute('aria-label', 'Report this review by ' + r.display_name);
    cap.appendChild(rep);
    fig.appendChild(cap);
    return fig;
  }
  function paint(j) {
    var reviews = Array.isArray(j.reviews) ? j.reviews.filter(function (r) { return r && r.body && r.display_name && r.rating; }) : [];
    lists.forEach(function (list) {
      var limit = +list.dataset.limit || reviews.length;
      list.textContent = '';
      reviews.slice(0, limit).forEach(function (r) { list.appendChild(card(r)); });
    });
    var empty = $('[data-review-empty]'), summary = $('[data-review-summary]'), highlights = $('[data-review-highlights]');
    if (empty) empty.hidden = reviews.length > 0;
    if (highlights) highlights.hidden = reviews.length === 0;
    if (summary) {
      var count = typeof j.count === 'number' ? j.count : reviews.length;
      summary.hidden = !(count > 0 && typeof j.average === 'number');
      if (!summary.hidden) {
        summary.textContent = '';
        var big = document.createElement('strong'); big.textContent = j.average.toFixed(1);
        var rest = document.createElement('span'); rest.className = 'muted'; rest.textContent = 'out of 5, from ' + count + (count === 1 ? ' review' : ' reviews');
        summary.appendChild(big); summary.appendChild(rest);
      }
    }
  }
  function loadReviews() {
    if (!endpoint || !lists.length || !window.fetch) return;
    fetch(endpoint, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) { if (j && j.ok === true) paint(j); })
      .catch(function () {}); // on failure the page keeps what it had; it never invents reviews
  }
  loadReviews();
  if (endpoint && $('[data-review-form]')) setInterval(function () { if (!document.hidden) loadReviews(); }, 60000); // newly approved reviews appear without a reload

  /* ───────────── write a review ───────────── */
  (function () {
    var form = $('[data-review-form]');
    if (!form || !endpoint) return;
    var statusEl = $('[data-review-status]', form), done = $('[data-review-done]', form), set = $('.formset', form), btn = $('[data-review-submit]', form);
    var busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      statusEl.textContent = '';
      var f = form.elements;
      var rating = $$('[name="rating"]', form).filter(function (r) { return r.checked; })[0];
      busy = true; btn.disabled = true; var label = btn.textContent; btn.textContent = 'Sending…';
      post(endpoint, {
        display_name: f.display_name.value.trim(), rating: rating ? +rating.value : 0, body: f.body.value.trim(),
        vehicle_slug: f.vehicle_slug.value, own: f.own.checked, _gotcha: f._gotcha.value, elapsedMs: Date.now() - loadedAt
      }).then(function () {
        set.hidden = true; done.hidden = false; done.focus();
        track('Review submitted');
      }).catch(function (err) {
        statusEl.textContent = why(err, 'review') + ' Please try again in a moment.';
      }).then(function () { busy = false; btn.disabled = false; btn.textContent = label; });
    });
  })();

  /* ───────────── email support ───────────── */
  (function () {
    var form = $('[data-support-form]');
    if (!form) return;
    var qs = new URLSearchParams(location.search);
    var f = form.elements;
    if (qs.get('topic')) Array.prototype.forEach.call(f.topic.options, function (o) { if (o.value === qs.get('topic')) f.topic.value = o.value; });
    if (qs.get('reference')) f.reference.value = qs.get('reference').slice(0, 40);
    var ep = data.support.endpoint;
    if (!ep) return;
    var statusEl = $('[data-support-status]', form), done = $('[data-support-done]', form), set = $('.formset', form), btn = $('[data-support-submit]', form);
    var busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      statusEl.textContent = '';
      busy = true; btn.disabled = true; var label = btn.textContent; btn.textContent = 'Sending…';
      post(ep, {
        name: f.name.value.trim(), email: f.email.value.trim(), topic: f.topic.value, reference: f.reference.value.trim(),
        message: f.message.value.trim(), consent: f.consent.checked, _gotcha: f._gotcha.value, elapsedMs: Date.now() - loadedAt
      }).then(function (j) {
        $('[data-support-ref]', form).textContent = j.reference || '';
        if (j.acknowledged === true) $('[data-support-ack]', form).hidden = false;
        set.hidden = true; done.hidden = false; done.focus();
        track('Support submitted');
      }).catch(function (err) {
        statusEl.textContent = why(err, 'support request') + ' You can try again, or message @' + data.business.instagram + ' on Instagram.';
      }).then(function () { busy = false; btn.disabled = false; btn.textContent = label; });
    });
  })();
})();
