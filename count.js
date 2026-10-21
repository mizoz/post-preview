// Counting rules for each network. Pure functions, no DOM, so they're easy to test in node.
(function (root) {
  'use strict';

  var seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

  function graphemes(s) {
    if (!s) return [];
    if (seg) return Array.from(seg.segment(s), function (x) { return x.segment; });
    return Array.from(s);
  }

  var PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
  function isEmoji(g) {
    if (!PICTO.test(g)) return false;
    var cp = g.codePointAt(0);
    // bare (c) / (r) / tm / arrows render as text unless followed by VS16
    if (cp < 0x2100 && g.indexOf('️') === -1 && g.indexOf('⃣') === -1) return false;
    return true;
  }

  // Common TLDs only, so "e.g." or "file.txt" don't count as links. twitter-text uses the full IANA list.
  var TLDS = 'com|net|org|io|co|ca|ai|app|dev|me|info|biz|us|uk|de|fr|es|it|nl|au|in|jp|ly|gg|tv|xyz|edu|gov|news|blog|shop|store|site|online|tech|link|social|page|so|to|fm|sh|pro|art|design|events';
  var URL_RE = new RegExp(
    '(?:https?:\\/\\/[^\\s<>"]+)|(?:\\b(?:www\\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\\.(?:' + TLDS + ')\\b(?:\\/[^\\s<>"]*)?)',
    'gi'
  );
  var TRAIL = /[.,:;!?)\]'"]+$/;

  function findUrls(text) {
    var out = [], m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text))) {
      var u = m[0], start = m.index;
      if (start > 0 && /[@\w.]/.test(text[start - 1]) && !/^https?:/i.test(u)) continue; // emails, @handles
      var t = u.match(TRAIL);
      if (t) u = u.slice(0, u.length - t[0].length);
      if (!u) continue;
      out.push({ start: start, end: start + u.length, url: u });
    }
    return out;
  }

  var TAG_RE = /(^|[^\p{L}\p{N}_&\/])#([\p{L}\p{M}\p{N}_]*[\p{L}\p{M}][\p{L}\p{M}\p{N}_]*)/gu;
  var MENTION_RE = /(^|[^\p{L}\p{N}_!#$%&*@\/.])@([A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?)/gu;

  function findTags(text) {
    var out = [], m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text))) {
      var s = m.index + m[1].length;
      out.push({ start: s, end: s + 1 + m[2].length, tag: m[2] });
    }
    return out;
  }
  function findMentions(text) {
    var out = [], m;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(text))) {
      var s = m.index + m[1].length;
      out.push({ start: s, end: s + 1 + m[2].length, name: m[2] });
    }
    return out;
  }

  // twitter-text v3 config (the one X uses for weighted length)
  var X_CFG = {
    max: 280, scale: 100, defaultWeight: 200, urlLength: 23,
    ranges: [[0, 4351, 100], [8192, 8205, 100], [8208, 8223, 100], [8242, 8247, 100]]
  };
  function xWeight(cp) {
    for (var i = 0; i < X_CFG.ranges.length; i++) {
      var r = X_CFG.ranges[i];
      if (cp >= r[0] && cp <= r[1]) return r[2];
    }
    return X_CFG.defaultWeight;
  }

  function xLength(raw) {
    var text = raw.normalize('NFC');
    var urls = findUrls(text);
    var w = 0, pos = 0;
    function plain(chunk) {
      graphemes(chunk).forEach(function (g) {
        if (isEmoji(g)) { w += X_CFG.defaultWeight; return; }
        for (var ch of g) w += xWeight(ch.codePointAt(0));
      });
    }
    urls.forEach(function (u) {
      plain(text.slice(pos, u.start));
      w += X_CFG.urlLength * X_CFG.scale;
      pos = u.end;
    });
    plain(text.slice(pos));
    return Math.ceil(w / X_CFG.scale);
  }

  function utf8Bytes(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    return unescape(encodeURIComponent(s)).length;
  }

  // Folds are observed behaviour, not published numbers. chars = rough cutoff,
  // lines = max visible lines, cpl = rough characters per line at that width.
  var PLATFORMS = [
    {
      id: 'linkedin', name: 'LinkedIn', limit: 3000, unit: 'characters',
      more: '…more',
      fold: { mobile: { chars: 140, lines: 3, cpl: 44 }, desktop: { chars: 210, lines: 3, cpl: 72 } },
      tagNote: 'No hard cap. 3 to 5 is the usual advice.'
    },
    {
      id: 'x', name: 'X', limit: 280, premiumLimit: 25000, unit: 'weighted characters',
      more: 'Show more',
      fold: null, premiumFold: { mobile: { chars: 280, lines: 99, cpl: 40 }, desktop: { chars: 280, lines: 99, cpl: 64 } },
      tagNote: 'Each tag eats into 280. One or two is plenty.'
    },
    {
      id: 'instagram', name: 'Instagram', limit: 2200, unit: 'characters',
      more: '… more', hashtagMax: 5,
      fold: { mobile: { chars: 125, lines: 2, cpl: 44 }, desktop: { chars: 125, lines: 2, cpl: 56 } },
      tagNote: 'Instagram started capping hashtags at 5 per post in late 2025 (some older accounts still allow 30).'
    },
    {
      id: 'threads', name: 'Threads', limit: 500, unit: 'characters',
      more: 'More', fold: null,
      tagNote: 'Threads links one topic tag per post; extra # words show as plain text.'
    },
    {
      id: 'facebook', name: 'Facebook', limit: 63206, unit: 'characters',
      more: '… See more',
      fold: { mobile: { chars: 125, lines: 5, cpl: 44 }, desktop: { chars: 477, lines: 6, cpl: 78 } },
      tagNote: 'Hashtags work but rarely help reach here.'
    },
    {
      id: 'bluesky', name: 'Bluesky', limit: 300, unit: 'graphemes', byteLimit: 3000,
      more: '', fold: null,
      tagNote: 'Tags are fine, they count toward 300 like anything else.'
    }
  ];

  // Threads' API docs say emoji count as their UTF-8 bytes. Everyone else: 1 per grapheme.
  function cost(platform, g) {
    if (platform.id === 'threads' && isEmoji(g)) return utf8Bytes(g);
    return 1;
  }

  function count(platform, text, opts) {
    opts = opts || {};
    var g = graphemes(text);
    var len = 0;
    if (platform.id === 'x') len = xLength(text);
    else g.forEach(function (x) { len += cost(platform, x); });
    var limit = (platform.id === 'x' && opts.premium) ? platform.premiumLimit : platform.limit;
    var res = {
      length: len, limit: limit, over: len > limit, left: limit - len,
      utf16: text.length, graphemes: g.length
    };
    if (platform.byteLimit) { res.bytes = utf8Bytes(text); res.overBytes = res.bytes > platform.byteLimit; }
    return res;
  }

  function stats(text) {
    var g = graphemes(text);
    var emoji = 0;
    g.forEach(function (x) { if (isEmoji(x)) emoji++; });
    return {
      graphemes: g.length,
      utf16: text.length,
      words: (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length,
      lines: text ? text.split('\n').length : 0,
      emoji: emoji,
      hashtags: findTags(text),
      mentions: findMentions(text),
      urls: findUrls(text)
    };
  }

  // Where the feed cuts the text. Returns a UTF-16 index into text, or -1 if it all shows.
  function foldIndex(text, fold) {
    if (!fold || !text) return -1;
    var g = graphemes(text);
    var chars = 0, lines = 1, col = 0, idx = 0;
    for (var i = 0; i < g.length; i++) {
      var ch = g[i];
      if (ch === '\n' || ch === '\r\n') {
        lines++; col = 0;
      } else {
        col++;
        if (col > fold.cpl) { lines++; col = 1; }
      }
      chars++;
      if (lines > fold.lines || chars > fold.chars) {
        return backToSpace(text, idx);
      }
      idx += ch.length;
    }
    return -1;
  }

  // feeds don't cut mid-word, back up to the last space if there's one close by
  function backToSpace(text, idx) {
    if (/\s/.test(text.charAt(idx))) return idx;
    var head = text.slice(0, idx);
    var nl = head.lastIndexOf('\n');
    var sp = head.search(/\s\S*$/);
    var cut = Math.max(nl, sp);
    if (cut > 0 && idx - cut < 25) return cut;
    return idx;
  }

  // Unicode "fonts". Math sans-serif blocks, the ones people use on LinkedIn.
  var STYLES = {
    bold: { A: 0x1D5D4, a: 0x1D5EE, d: 0x1D7EC },
    italic: { A: 0x1D608, a: 0x1D622, d: null },
    bolditalic: { A: 0x1D63C, a: 0x1D656, d: 0x1D7EC }
  };
  function stylize(s, style) {
    var st = STYLES[style];
    var plainText = unstyle(s);
    if (!st) return plainText;
    var out = '';
    for (var ch of plainText) {
      var c = ch.charCodeAt(0);
      if (c >= 65 && c <= 90) out += String.fromCodePoint(st.A + c - 65);
      else if (c >= 97 && c <= 122) out += String.fromCodePoint(st.a + c - 97);
      else if (c >= 48 && c <= 57 && st.d) out += String.fromCodePoint(st.d + c - 48);
      else out += ch;
    }
    return out;
  }
  function unstyle(s) {
    var out = '';
    for (var ch of s) {
      var cp = ch.codePointAt(0), done = false;
      if (cp >= 0x1D400 && cp <= 0x1D7FF) {
        for (var k in STYLES) {
          var st = STYLES[k];
          if (cp >= st.A && cp < st.A + 26) { out += String.fromCharCode(65 + cp - st.A); done = true; break; }
          if (cp >= st.a && cp < st.a + 26) { out += String.fromCharCode(97 + cp - st.a); done = true; break; }
          if (st.d && cp >= st.d && cp < st.d + 10) { out += String.fromCharCode(48 + cp - st.d); done = true; break; }
        }
      }
      if (!done) out += ch;
    }
    return out;
  }
  function hasFancy(s) { return /[\u{1D400}-\u{1D7FF}]/u.test(s); }

  var api = {
    graphemes: graphemes, isEmoji: isEmoji, xLength: xLength, findUrls: findUrls,
    findTags: findTags, findMentions: findMentions, count: count, stats: stats,
    foldIndex: foldIndex, cost: cost, stylize: stylize, unstyle: unstyle, hasFancy: hasFancy,
    utf8Bytes: utf8Bytes, PLATFORMS: PLATFORMS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PP = api;
})(this);
