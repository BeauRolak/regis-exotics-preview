/* REGIS EXOTICS: 3D model tab.
   Shows a free model in Sketchfab's own player, and only after the visitor asks for it.
   The viewpoint buttons and feature list steer the player's camera. If Sketchfab's control script
   cannot load, the plain player is shown instead and those buttons step aside. */
(function () {
  'use strict';
  var R = window.REGIS || {};
  var track = R.track || function () {};
  var reduce = R.reduce || { matches: false };
  var API = 'https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js';
  var $ = function (s, el) { return el.querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call(el.querySelectorAll(s)); };

  $$('[data-model3d]', document).forEach(function (root) {
    var cfg;
    try { cfg = JSON.parse($('[data-m3d-config]', root).textContent); } catch (e) { return; }
    var gate = $('[data-m3d-gate]', root), frame = $('[data-m3d-frame]', root), statusEl = $('[data-m3d-status]', root);
    var card = $('[data-m3d-card]', root), live = $('[data-m3d-live]', root), view = frame.parentNode;
    var viewBtns = $$('[data-m3d-go]', root), featBtns = $$('[data-m3d-feature]', root);
    var api = null, state = 'idle', queued = null, selected = null;

    // set on copies of the site that cannot embed other sites (the shareable preview link)
    var blocked = root.hasAttribute('data-m3d-blocked');
    if (blocked) { root.classList.add('is-plain'); $('[data-m3d-load]', root).hidden = true; $('.m3d__gate-p', root).textContent = 'The 3D viewer cannot run inside this preview link. It works on the live site. Use the Sketchfab link below to open the model.'; }
    var status = function (t) { statusEl.textContent = t || ''; statusEl.hidden = !t; };
    var say = function (t) { if (live) live.textContent = t; };

    function aim(cam, label) {
      if (!api) return;
      api.setFov(cam.fov);
      api.setCameraLookAt(cam.eye, cam.target, reduce.matches ? 0 : 1.1);
      if (label) say(label);
    }
    function showView(id) {
      var v = cfg.views.filter(function (x) { return x.id === id; })[0];
      if (!v) return;
      select(null);
      viewBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m3dGo === id)); });
      aim(v.cam, v.label + ' view.');
    }
    function select(id) {
      var f = cfg.features.filter(function (x) { return x.id === id; })[0];
      selected = f ? id : null;
      featBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m3dFeature === selected)); });
      if (!f) { card.hidden = true; return; }
      $('[data-m3d-card-title]', card).textContent = f.title;
      $('[data-m3d-card-text]', card).textContent = f.text || '';
      var tag = $('[data-m3d-card-tag]', card); tag.textContent = f.tag || ''; tag.dataset.kind = f.source || '';
      var fig = $('[data-m3d-card-photo]', card), img = $('img', fig);
      if (f.photo) { img.src = f.photo.src; img.alt = f.photo.alt || ''; fig.hidden = false; } else { fig.hidden = true; img.removeAttribute('src'); }
      card.hidden = false;
      viewBtns.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      aim(f.cam, f.title + '.');
      // on a phone the list sits below the player: bring the player back into view
      var r = view.getBoundingClientRect();
      if (r.top < 70 || r.top > window.innerHeight * 0.5) window.scrollBy({ top: r.top - 84, behavior: reduce.matches ? 'auto' : 'smooth' });
      track('3D feature viewed', { feature: f.id });
    }

    function recolor(done) {
      if (!cfg.recolor || !cfg.recolor.length) return done();
      api.getMaterialList(function (err, mats) {
        if (!err && mats) cfg.recolor.forEach(function (rc) {
          var m = mats.filter(function (x) { return x.name === rc.material; })[0];
          var ch = m && m.channels && (m.channels.AlbedoPBR || m.channels.DiffuseColor || m.channels.DiffusePBR);
          if (!ch) return;
          ch.color = rc.color; delete ch.texture; ch.enable = true;
          api.setMaterial(m);
        });
        done();
      });
    }

    function ready() {
      state = 'ready'; status(''); root.classList.add('is-ready');
      viewBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m3dGo === cfg.views[0].id)); });
      if (queued) { var q = queued; queued = null; q(); }
    }
    // Sketchfab's control script would not load (blocked, offline): show the plain player.
    function plain() {
      state = 'plain'; root.classList.add('is-plain'); status('');
      frame.src = 'https://sketchfab.com/models/' + cfg.uid + '/embed?autostart=1&dnt=1';
    }
    function fail() {
      state = 'failed'; frame.hidden = true; root.classList.add('is-failed');
      status('The 3D model could not be loaded. The photos show the actual vehicle.');
    }

    function load(then) {
      if (blocked) return;
      if (state === 'ready') { if (then) then(); return; }
      if (then) queued = then;
      if (state !== 'idle') return;
      state = 'loading';
      frame.setAttribute('allow', 'autoplay; fullscreen; xr-spatial-tracking'); frame.setAttribute('allowfullscreen', '');
      gate.hidden = true; frame.hidden = false; status('Loading the 3D model…');
      // if the controls never connect, leave the visitor with the plain player rather than a spinner
      setTimeout(function () { if (state === 'loading') { state = 'plain'; root.classList.add('is-plain'); status(''); } }, 25000);
      track('3D model loaded', {});
      var start = function () {
        var client;
        try { client = new window.Sketchfab(frame); } catch (e) { return plain(); }
        client.init(cfg.uid, {
          autostart: 1, dnt: 1, scrollwheel: 0, camera: 0,
          success: function (a) {
            a.start();
            a.addEventListener('viewerready', function () {
              api = a;
              recolor(function () { var c = cfg.views[0].cam; api.setFov(c.fov); api.setCameraLookAt(c.eye, c.target, 0); ready(); });
            });
          },
          error: fail
        });
      };
      if (window.Sketchfab) return start();
      var s = document.createElement('script');
      s.src = API; s.onload = start; s.onerror = plain;
      document.head.appendChild(s);
    }

    $('[data-m3d-load]', root).addEventListener('click', function () { load(); frame.focus(); });
    viewBtns.forEach(function (b) { b.addEventListener('click', function () { var id = b.dataset.m3dGo; load(function () { showView(id); }); }); });
    featBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.m3dFeature;
        if (b.getAttribute('aria-pressed') === 'true') return select(null);
        load(function () { select(id); });
      });
    });
    $('[data-m3d-card-close]', card).addEventListener('click', function () {
      var id = selected; select(null);
      var b = featBtns.filter(function (x) { return x.dataset.m3dFeature === id; })[0]; if (b) b.focus({ preventScroll: true });
    });
    root._m3d = { state: function () { return { state: state, selected: selected }; } };
  });
})();
