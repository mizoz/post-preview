// node test/count.test.js
// X numbers were checked against twitter-text 3.x parseTweet().weightedLength
const assert = require('assert');
const PP = require('../count.js');

const x = [
  ['hello world', 11],
  ['café', 4],
  ['Check https://example.com/some/very/long/path?x=1 now', 33],
  ['visit example.com today', 35],
  ['👍🏽 family 👨‍👩‍👧‍👦 flag 🇨🇦 keycap 1️⃣', 30],
  ['日本語のテキスト', 16],
  ['𝗕𝗼𝗹𝗱 text', 13],
  ['em—dash “quotes” …', 19],
  ['© ® ™ ©️', 9],
  ['email me at a@b.com', 19],
  ['#tag @user http://x.co/a.', 35],
  ['→ arrows ← and ★ ✨', 22],
];
for (const [t, n] of x) assert.strictEqual(PP.xLength(t), n, t);

const s = PP.stats('Hi @ahmed and @bob_1 #Launch #2026 see firstshow.ca 👋🏽 🇨🇦\nline2');
assert.strictEqual(s.emoji, 2);
assert.deepStrictEqual(s.hashtags.map(h => h.tag), ['Launch']);
assert.deepStrictEqual(s.mentions.map(m => m.name), ['ahmed', 'bob_1']);
assert.deepStrictEqual(s.urls.map(u => u.url), ['firstshow.ca']);
assert.strictEqual(s.lines, 2);

assert.strictEqual(PP.unstyle(PP.stylize('Hello 2026', 'bold')), 'Hello 2026');
assert.strictEqual(PP.stylize('Hi', 'italic'), '𝘏𝘪');

const li = PP.PLATFORMS.find(p => p.id === 'linkedin');
assert.strictEqual(PP.foldIndex('short post', li.fold.desktop), -1);
const cut = PP.foldIndex('a\nb\nc\nd\ne', li.fold.desktop);
assert.strictEqual(cut, 5); // three lines, then the fold

const bs = PP.PLATFORMS.find(p => p.id === 'bluesky');
assert.strictEqual(PP.count(bs, '👨‍👩‍👧‍👦'.repeat(300)).length, 300);

const th = PP.PLATFORMS.find(p => p.id === 'threads');
assert.strictEqual(PP.count(th, 'hi 👋').length, 7);

console.log('all good');
