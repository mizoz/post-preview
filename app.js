(function () {
  'use strict';
  var PP = window.PP;
  var $ = function (id) { return document.getElementById(id); };

  var KEY = 'pp-state', DKEY = 'pp-drafts';
  var EXAMPLE = 'Your post has about two lines to earn the click.\n\n' +
    'Everything after that sits behind "see more", and most people never tap it.\n\n' +
    'A few things that help:\n' +
    '→ Put the point in the first sentence\n' +
    '→ Cut the warm-up ("I\'ve been thinking a lot about...")\n' +
    '→ Use line breaks, but not after every three words\n\n' +
    'Check yours before you post: lab.zalastack.com/post-preview 👀\n\n' +
    '#writingtips #linkedin';

  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var state = Object.assign({ text: '', name: '', handle: '', headline: '', photo: '', device: 'mobile', premium: false }, load(KEY, {}));
  var expanded = {};

  var ta = $('composer');

  // share link wins over the saved text
  var fromHash = readHash();
  if (fromHash !== null) state.text = fromHash;
  else if (!state.text && !load(KEY, null)) state.text = EXAMPLE;

  ta.value = state.text;
  $('pName').value = state.name;
  $('pHandle').value = state.handle;
  $('pHeadline').value = state.headline;
  $('xPremium').checked = !!state.premium;
  (state.device === 'desktop' ? $('dDesktop') : $('dMobile')).checked = true;

  function pl(n, word) { return n.toLocaleString('en-CA') + ' ' + (n === 1 ? word : word + 's'); }
  function esc(s) { return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function initials(name) {
    var p = (name || 'Your Name').trim().split(/\s+/);
    return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || '');
  }
  function avatar() {
    if (state.photo) return '<div class="avatar"><img src="' + state.photo + '" alt=""></div>';
    return '<div class="avatar" aria-hidden="true">' + esc(initials(state.name).toUpperCase()) + '</div>';
  }
  function nm() { return esc(state.name.trim() || 'Your Name'); }
  function hd() { return esc((state.handle.trim() || 'yourhandle').replace(/^@/, '')); }

  // index (utf16) where the text first goes over the limit, -1 if it doesn't
  function overIndex(p, text, limit) {
    var g = PP.graphemes(text);
    if (p.id !== 'x') {
      var used = 0, i = 0;
      for (var k = 0; k < g.length; k++) {
        used += PP.cost(p, g[k]);
        if (used > limit) return i;
        i += g[k].length;
      }
      return -1;
    }
    if (PP.xLength(text) <= limit) return -1;
    var lo = 0, hi = g.length;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (PP.xLength(g.slice(0, mid).join('')) <= limit) lo = mid; else hi = mid - 1;
    }
    return g.slice(0, lo).join('').length;
  }

  function highlight(text, ents, overAt, markAt) {
    var pts = [0, text.length];
    ents.forEach(function (e) { pts.push(e.start, e.end); });
    if (overAt >= 0) pts.push(overAt);
    if (markAt >= 0) pts.push(markAt);
    pts = pts.filter(function (x, i, a) { return x >= 0 && x <= text.length && a.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
    var out = '';
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (a === markAt) out += '<span class="foldmark" aria-hidden="true"><span>cut on ' + state.device + '</span></span>';
      var chunk = esc(text.slice(a, b));
      var isEnt = ents.some(function (e) { return a >= e.start && b <= e.end; });
      var cls = [];
      if (isEnt) cls.push('ent');
      if (overAt >= 0 && a >= overAt) cls.push('over');
      out += cls.length ? '<span class="' + cls.join(' ') + '">' + chunk + '</span>' : chunk;
    }
    return out;
  }

  function foldFor(p) {
    if (p.id === 'x') return state.premium ? p.premiumFold[state.device] : null;
    return p.fold ? p.fold[state.device] : null;
  }

  function bodyHtml(p, text, st, overAt) {
    var ents = st.hashtags.concat(st.mentions, st.urls);
    var fold = foldFor(p);
    var cut = PP.foldIndex(text, fold);
    if (cut < 0) return highlight(text, ents, overAt, -1);
    if (expanded[p.id]) {
      return highlight(text, ents, overAt, cut) +
        '\n<button type="button" class="morebtn" data-less="' + p.id + '">Show less</button>';
    }
    var vis = text.slice(0, cut).replace(/\s+$/, '');
    var sep = p.id === 'x' ? '\n' : (p.more.charAt(0) === '…' ? '' : ' ');
    return highlight(vis, ents.filter(function (e) { return e.end <= vis.length; }), overAt >= 0 && overAt < vis.length ? overAt : -1, -1) +
      sep + '<button type="button" class="morebtn" data-more="' + p.id + '" aria-label="Expand ' + p.name + ' preview">' + esc(p.more) + '</button>';
  }

  function mock(p, text, st, overAt) {
    var b = '<div class="body">' + bodyHtml(p, text, st, overAt) + '</div>';
    switch (p.id) {
      case 'linkedin':
        return '<div class="mock">' +
          '<div class="who">' + avatar() + '<div class="who-text"><div class="who-name">' + nm() + '</div><div class="who-sub">' + esc(state.headline.trim() || 'Your headline') + '</div><div class="who-sub">now</div></div></div>' +
          b + '<div class="actions" aria-hidden="true"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div></div>';
      case 'x':
        return '<div class="mock">' +
          '<div class="who">' + avatar() + '<div class="who-text"><div class="who-name">' + nm() + '</div><div class="who-sub">@' + hd() + ' · now</div></div></div>' +
          b + '<div class="actions" aria-hidden="true"><span>Reply</span><span>Repost</span><span>Like</span><span>Share</span></div></div>';
      case 'instagram':
        return '<div class="mock ig">' +
          '<div class="who">' + avatar() + '<div class="who-text"><div class="who-name">' + hd() + '</div></div></div>' +
          '<div class="media" aria-hidden="true">your photo or video</div>' +
          '<div class="body"><span class="ig-name">' + hd() + '</span> ' + bodyHtml(p, text, st, overAt) + '</div>' +
          '</div>';
      case 'threads':
        return '<div class="mock">' +
          '<div class="who">' + avatar() + '<div class="who-text"><div class="who-name">' + hd() + ' <span class="who-sub">now</span></div></div></div>' +
          b + '<div class="actions" aria-hidden="true"><span>Like</span><span>Reply</span><span>Repost</span><span>Share</span></div></div>';
      case 'facebook':
        return '<div class="mock">' +
          '<div class="who">' + avatar() + '<div class="who-text"><div class="who-name">' + nm() + '</div><div class="who-sub">Just now</div></div></div>' +
          b + '<div class="actions" aria-hidden="true"><span>Like</span><span>Comment</span><span>Share</span></div></div>';
      case 'bluesky':
        return '<div class="mock">' +
          '<div class="who">' + avatar() + '<div class="who-text"><div class="who-name">' + nm() + '</div><div class="who-sub">@' + hd() + '.bsky.social · now</div></div></div>' +
          b + '<div class="actions" aria-hidden="true"><span>Reply</span><span>Repost</span><span>Like</span></div></div>';
    }
    return b;
  }

  function messages(p, text, st, c) {
    var m = [];
    var f = function (n) { return n.toLocaleString('en-CA'); };
    if (c.over) m.push(['e', f(-c.left) + ' over the ' + f(c.limit) + ' limit. The red part won\'t fit.']);
    if (c.overBytes) m.push(['e', 'Over Bluesky\'s 3,000 byte cap (' + f(c.bytes) + ' bytes). Usually only happens with lots of emoji.']);
    var tags = st.hashtags.length;
    if (p.id === 'instagram' && tags > p.hashtagMax) m.push(['w', tags + ' hashtags. Instagram now caps posts at 5 (older accounts may still allow 30).']);
    if (p.id === 'threads' && tags > 1) m.push(['i', 'Threads only links one topic tag per post. The rest show as plain text.']);
    if (p.id === 'threads' && st.emoji) m.push(['i', 'Threads\' docs count each emoji as its UTF-8 bytes (👋 = 4), so emoji fill this one up faster.']);
    if (p.id === 'threads' && c.over) m.push(['i', 'Long text can go in a Threads text attachment (up to 10,000 characters) instead.']);
    if (p.id === 'linkedin' && tags > 5) m.push(['i', tags + ' hashtags. 3 to 5 is the usual advice on LinkedIn.']);
    if (p.id === 'x' && st.urls.length) m.push(['i', st.urls.length + (st.urls.length === 1 ? ' link counts' : ' links count') + ' as 23 each.']);
    if (p.id === 'x' && PP.hasFancy(text)) m.push(['i', 'Styled letters count as 2 each on X.']);
    if (p.id === 'x' && !state.premium && c.over) m.push(['i', 'Premium accounts can post up to 25,000. Tick the box above to preview that.']);
    if (p.id === 'instagram' && st.urls.length) m.push(['i', 'Links in Instagram captions aren\'t clickable.']);
    if (p.id === 'bluesky' && st.urls.length) m.push(['i', 'The Bluesky app shortens long links when you post, so they may count for less than shown.']);
    return m;
  }

  function render() {
    var text = ta.value;
    var st = PP.stats(text);

    var bits = [
      ['character', st.graphemes], ['word', st.words], ['line', st.lines], ['emoji', st.emoji],
      ['hashtag', st.hashtags.length], ['mention', st.mentions.length], ['link', st.urls.length]
    ];
    if (st.utf16 !== st.graphemes) bits.push(['UTF-16 unit', st.utf16]);
    $('stats').innerHTML = bits.map(function (b) {
      var w = b[0] === 'emoji' || b[1] === 1 ? b[0] : b[0] + 's';
      return '<span><b>' + b[1].toLocaleString('en-CA') + '</b> ' + w + '</span>';
    }).join('');
    $('fancyWarn').hidden = !PP.hasFancy(text);

    var wrap = $('previews');
    wrap.classList.toggle('desktop', state.device === 'desktop');
    var html = '', hooks = '';
    PP.PLATFORMS.forEach(function (p) {
      var c = PP.count(p, text, { premium: state.premium });
      var overAt = c.over ? overIndex(p, text, c.limit) : -1;
      var pct = Math.min(100, c.limit ? (c.length / c.limit) * 100 : 0);
      var cls = c.over ? 'over' : (pct >= 90 ? 'near' : '');
      var msgs = messages(p, text, st, c);
      html += '<article class="pv card" aria-labelledby="pv-' + p.id + '">' +
        '<div class="pv-head"><h3 class="pv-name" id="pv-' + p.id + '">' + p.name + '</h3><span class="pv-tag">preview</span></div>' +
        mock(p, text, st, overAt) +
        '<div class="pv-count"><span' + (c.over ? ' class="bad"' : '') + '>' + c.length.toLocaleString('en-CA') + ' / ' + c.limit.toLocaleString('en-CA') + ' ' + p.unit + '</span>' +
        '<span class="left">' + (c.over ? '' : c.left.toLocaleString('en-CA') + ' left') + '</span></div>' +
        '<div class="meter ' + cls + '" role="meter" aria-label="' + p.name + ' length" aria-valuemin="0" aria-valuemax="' + c.limit + '" aria-valuenow="' + c.length + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<div class="pv-meta"><span>' + pl(st.hashtags.length, 'hashtag') + '</span><span>' + pl(st.mentions.length, 'mention') + '</span><span>' + st.emoji + ' emoji</span>' + (p.byteLimit ? '<span>' + c.bytes.toLocaleString('en-CA') + ' bytes</span>' : '') + '</div>' +
        (msgs.length ? '<ul class="pv-msgs">' + msgs.map(function (x) { return '<li class="' + x[0] + '">' + esc(x[1]) + '</li>'; }).join('') + '</ul>' : '') +
        '<div><button type="button" class="btn small" data-copy="' + p.id + '">Copy for ' + p.name + '</button></div>' +
        '</article>';

      hooks += '<div class="hk"><h3>' + p.name + '</h3>' + hookPair(p, text) + '</div>';
    });
    wrap.innerHTML = html;
    $('hooks').innerHTML = hooks;
  }

  function visibleText(p, text, device) {
    var fold = p.id === 'x' ? (state.premium ? p.premiumFold[device] : null) : (p.fold ? p.fold[device] : null);
    var cut = PP.foldIndex(text, fold);
    return { text: cut < 0 ? text : text.slice(0, cut).replace(/\s+$/, ''), cut: cut >= 0 };
  }
  function hookPair(p, text) {
    if (!text.trim()) return '<p class="hint">Nothing to check yet.</p>';
    if (!p.fold && !(p.id === 'x' && state.premium)) {
      var c = PP.count(p, text, { premium: state.premium });
      return '<p class="hint">' + (c.over
        ? 'No fold here, but you\'re ' + (-c.left).toLocaleString('en-CA') + ' over the limit, so it won\'t post as is.'
        : 'No fold. ' + p.name + ' shows the whole post in the feed.') + '</p>';
    }
    return '<div class="pair">' + ['mobile', 'desktop'].map(function (d) {
      var v = visibleText(p, text, d);
      var n = PP.graphemes(v.text).length;
      var label = v.cut ? d + ' · first ' + n + ' characters show' : d + ' · whole post shows';
      var body = v.cut ? esc(v.text) + '<span aria-hidden="true">' + (p.more.charAt(0) === '…' ? '' : ' ') + esc(p.more) + '</span>' : esc(v.text);
      return '<div><div class="lab">' + label + '</div><div class="txt">' + body + '</div></div>';
    }).join('') + '</div>';
  }

  var raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; render(); persist(); });
  }
  function persist() {
    state.text = ta.value;
    save(KEY, state);
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var x = document.createElement('textarea');
    x.value = text; x.setAttribute('readonly', ''); x.style.position = 'fixed'; x.style.opacity = '0';
    document.body.appendChild(x); x.select();
    try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Copy failed, select and copy by hand'); }
    document.body.removeChild(x);
  }

  // styling
  document.querySelectorAll('[data-style]').forEach(function (btn) {
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep the selection
    btn.addEventListener('click', function () {
      var s = ta.selectionStart, e = ta.selectionEnd;
      if (s === e) { $('fmtHint').textContent = 'Select some text first.'; ta.focus(); return; }
      var out = PP.stylize(ta.value.slice(s, e), btn.dataset.style);
      ta.focus();
      ta.setSelectionRange(s, e);
      var ok = false;
      try { ok = document.execCommand('insertText', false, out); } catch (err) { ok = false; }
      if (!ok || ta.value.slice(s, s + out.length) !== out) {
        ta.setRangeText(out, s, e, 'select');
      } else {
        ta.setSelectionRange(s, s + out.length);
      }
      schedule();
    });
  });

  ta.addEventListener('input', schedule);
  $('pName').addEventListener('input', function () { state.name = this.value; schedule(); });
  $('pHandle').addEventListener('input', function () { state.handle = this.value; schedule(); });
  $('pHeadline').addEventListener('input', function () { state.headline = this.value; schedule(); });
  $('xPremium').addEventListener('change', function () { state.premium = this.checked; schedule(); });
  document.querySelectorAll('input[name=device]').forEach(function (r) {
    r.addEventListener('change', function () { state.device = this.value; expanded = {}; schedule(); });
  });

  $('pPhoto').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var img = new Image();
    var url = URL.createObjectURL(f);
    img.onload = function () {
      var s = 96, cv = document.createElement('canvas');
      cv.width = cv.height = s;
      var m = Math.min(img.width, img.height);
      cv.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      state.photo = cv.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(url);
      $('btnNoPhoto').hidden = false;
      schedule();
    };
    img.onerror = function () { toast('Couldn\'t read that image'); URL.revokeObjectURL(url); };
    img.src = url;
  });
  $('btnNoPhoto').hidden = !state.photo;
  $('btnNoPhoto').addEventListener('click', function () { state.photo = ''; $('pPhoto').value = ''; this.hidden = true; schedule(); });

  $('previews').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.copy) copy(ta.value);
    else if (b.dataset.more) { expanded[b.dataset.more] = true; render(); focusBtn('[data-less="' + b.dataset.more + '"]'); }
    else if (b.dataset.less) { expanded[b.dataset.less] = false; render(); focusBtn('[data-more="' + b.dataset.less + '"]'); }
  });
  function focusBtn(sel) { var x = document.querySelector(sel); if (x) x.focus(); }

  $('btnExample').addEventListener('click', function () { ta.value = EXAMPLE; expanded = {}; schedule(); ta.focus(); });
  $('btnClear').addEventListener('click', function () { ta.value = ''; expanded = {}; schedule(); ta.focus(); });

  // drafts
  function drafts() { return load(DKEY, []); }
  function renderDrafts() {
    var d = drafts();
    $('draftEmpty').hidden = d.length > 0;
    $('draftList').innerHTML = d.map(function (x) {
      var first = (x.text.split('\n').find(function (l) { return l.trim(); }) || '(empty)').slice(0, 90);
      var when = new Date(x.t);
      return '<li><span class="dtext">' + esc(first) + '</span><time datetime="' + when.toISOString() + '">' + when.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + '</time>' +
        '<button type="button" class="btn small" data-load="' + x.id + '" aria-label="Open draft: ' + esc(first.slice(0, 40)) + '">Open</button>' +
        '<button type="button" class="btn ghost small" data-del="' + x.id + '" aria-label="Delete draft: ' + esc(first.slice(0, 40)) + '">Delete</button></li>';
    }).join('');
  }
  $('btnSave').addEventListener('click', function () {
    var text = ta.value;
    if (!text.trim()) { toast('Nothing to save'); return; }
    var d = drafts().filter(function (x) { return x.text !== text; });
    d.unshift({ id: Date.now().toString(36), text: text, t: Date.now() });
    if (save(DKEY, d.slice(0, 50))) toast('Draft saved'); else toast('Couldn\'t save (storage blocked?)');
    renderDrafts();
  });
  $('draftList').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.load) {
      var x = drafts().find(function (y) { return y.id === b.dataset.load; });
      if (x) { ta.value = x.text; expanded = {}; schedule(); ta.focus(); toast('Draft opened'); }
    } else if (b.dataset.del) {
      save(DKEY, drafts().filter(function (y) { return y.id !== b.dataset.del; }));
      renderDrafts();
      toast('Draft deleted');
    }
  });

  // share link, text only (no name/photo)
  function b64e(s) {
    var bytes = new TextEncoder().encode(s), bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64d(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function readHash() {
    var m = location.hash.match(/[#&]t=([A-Za-z0-9_-]*)/);
    if (!m) return null;
    try { return b64d(m[1]); } catch (e) { return null; }
  }
  $('btnShare').addEventListener('click', function () {
    var url = location.href.split('#')[0] + '#t=' + b64e(ta.value);
    copy(url);
  });

  window.addEventListener('hashchange', function () {
    var t = readHash();
    if (t !== null) { ta.value = t; expanded = {}; schedule(); }
  });

  render();
  renderDrafts();
})();
