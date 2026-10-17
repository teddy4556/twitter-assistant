// v0.3.46 透明底 + 绿色图标验证 —— 真 DOM 完整跑
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const V = process.argv[2] || 'twitter-assistant-v0.3.46.user.js';
const code = readFileSync('/opt/data/skills/userscript/twitter/versions/' + V, 'utf8');
const body = code.slice(code.indexOf('// ==/UserScript==') + 19);   // 19 不是 17

const X_ARTICLE = `
<main role="main"><div data-testid="primaryColumn"><section role="region"><article>
  <div data-testid="tweetText">这是一条带图片的推文</div>
  <div role="group">
    <div><div><button aria-label="转帖"><svg viewBox="0 0 24 24" class="r-13awgt0"></svg></button></div>
    <div><div><button aria-label="评论"><svg viewBox="0 0 24 24" class="r-13awgt0"></svg></button></div>
    <div><div><button aria-label="喜欢"><svg viewBox="0 0 24 24" class="r-13awgt0"></svg></button></div>
    <div><div><button aria-label="分享"><svg viewBox="0 0 24 24" class="r-13awgt0"></svg></button></div>
  </div>
  <a href="/photo/1" role="link"><img src="https://pbs.twimg.com/media/TEST.jpg?format=jpg&amp;name=large"></a>
</article></section></div></main>`;

const dom = new JSDOM(`<!DOCTYPE html><html><body>${X_ARTICLE}</body></html>`,
  { url: 'https://x.com/home', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.Element.prototype.setPointerCapture = function () {};
w.Element.prototype.releasePointerCapture = function () {};
w.Element.prototype.hasPointerCapture = function () { return false; };
const store = {};
Object.assign(w, {
  GM_getValue: (k, dv) => (k in store ? store[k] : dv),
  GM_setValue: (k, v) => { store[k] = v; },
  GM_registerMenuCommand: () => {}, GM_download: () => {},
});
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.TextEncoder = TextEncoder;
w.eval(body);
await new Promise((r) => setTimeout(r, 1800));

let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) pass++; else { fail++; console.log(`  ❌ ${n}${x ? '  →  ' + x : ''}`); } };
const GREEN = 'rgb(0, 158, 102)';
console.log(`\n=== ${V} 真 DOM 渲染结果 ===`);

ok(d.getElementById('tms-fab') !== null, '⚙️ 齿轮已创建');
ok(d.getElementById('tm-timeline-inner-lock') !== null, '加宽 CSS 已写入');
const btns = d.querySelectorAll('.tms-down');
ok(btns.length > 0, `下载按钮已注入(${btns.length} 个)`);

if (!btns.length) { console.log('\n  无法继续验证'); process.exit(1); }
const wrap = btns[0];
const btn = wrap.querySelector('button');
ok(btn !== null, '后代选择器能取到 button');
const cs = w.getComputedStyle(btn);

console.log('\n-- ① 透明底(用户核心诉求)--');
ok(cs.backgroundColor === 'rgba(0, 0, 0, 0)', '背景透明', cs.backgroundColor);
ok(cs.boxShadow === 'none', '无描边无投影', cs.boxShadow);
ok(w.getComputedStyle(wrap).backgroundColor === 'rgba(0, 0, 0, 0)', 'wrapper 也透明');
ok(w.getComputedStyle(wrap.querySelector('div')).backgroundColor === 'rgba(0, 0, 0, 0)', '中间层也透明');

console.log('\n-- ② 绿色图标 --');
ok(cs.color === GREEN, `图标色 = ${GREEN}`, cs.color);
ok(cs.width === '34px' && cs.height === '34px', '点击热区仍 34×34', `${cs.width}×${cs.height}`);

console.log('\n-- ③ hover 淡绿圆底 --');
ok(/rgba\(0,\s*158,\s*102/.test(cs.transition || '') || cs.transition.includes('background'), 'transition 含 background', cs.transition);

console.log('\n-- ④ 四态:底全透明,色全绿 --');
for (const st of ['c', 'l', 'f']) {
  wrap.className = `tms-down tms-${st}`;
  const s = w.getComputedStyle(wrap.querySelector('button'));
  ok(s.backgroundColor === 'rgba(0, 0, 0, 0)', `${st} 底透明`, s.backgroundColor);
  const greenish = /rgba?\(0,\s*(158|177)/.test(s.color);
  ok(greenish, `${st} 图标是绿`, s.color);
}
wrap.className = 'tms-down tms-d';
ok(w.getComputedStyle(btn).color === GREEN, '默认态图标绿', w.getComputedStyle(btn).color);

console.log('\n-- ⑤ SVG stroke 走 currentColor(配色由 CSS 接管)--');
const cssTxt = fullCss(d);
ok(cssTxt.includes('stroke: currentColor'), 'CSS 里有 stroke: currentColor 兜底');
// ⚠️ 扫硬编码颜色必须**排除注释行** —— v0.3.42 的历史说明文字里写着
//    「原先写死 stroke="#1DA1F2",改成 currentColor」,不排除会被当成真 bug(踩过两次)。
const codeOnly = fullSrc().split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');
ok(!/stroke="#(?!currentColor)/.test(codeOnly), '代码行里 SVG 无硬编码颜色');

console.log(`\n  通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);

function fullCss(doc) {
  const s = doc.getElementById('tms-ui-style');
  return s ? s.textContent : '';
}
function fullSrc() {
  return readFileSync('/opt/data/skills/userscript/twitter/versions/' + (process.argv[2] || 'twitter-assistant-v0.3.46.user.js'), 'utf8');
}
