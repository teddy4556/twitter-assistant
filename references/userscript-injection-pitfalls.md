# 油猴脚本注入踩坑(跨 twitter-assistant / ig-saver / 任何 media-dl 类 userscript 复用)

> 这些坑姐姐本会话反复踩(5 次"参照 X 风格"读反、3 次 UI 错位方向错),凝练成 always-on 规则。新写 userscript 之前**先过一遍**。

## 1. 注入按钮:永远用 `cloneNode(true)`,不自己造 wrap

**坑**:自己 new 一个 div wrap → appendChild 按钮 → 看着 UI 不平 / 挂底 / 上下错位。

**WHY**:X 自带按钮的 wrapper 有 `display: flex` / `height` / `align-items: center` 等样式。new 出来的 div **不继承**这些,只继承 className,导致跟其他按钮 CSS 高度/对齐不一致。

**修法**(对齐参考 87KB line 354-368):
```js
// 1) 克隆 X 自带按钮结构(继承所有 CSS + 子节点)
const btnDown = lastBtn.cloneNode(true);

// 2) 删 disabled
btnDown.querySelector('button')?.removeAttribute('disabled');

// 3) 改内部 svg(只改 innerHTML,不重设 width/height/viewBox)
//    因为 X 自带 svg 尺寸本来就统一

// 4) 直接 insertBefore,跟 X 自带按钮同 DOM 层级
lastBtn.parentNode.insertBefore(btnDown, lastBtn.nextSibling);
```

**selector 关键**:`.pop().parentNode` 拿 wrapper,不是 pop 拿最内层 button。X 工具栏结构是 `div[role=group] > div > div > div(button)`,pop 拿的是 button,缺外层 wrap。**88% UI 错位根因**。

## 2. cloneNode 后 svg 尺寸如果错位,强制 18.75px

**坑**:cloneNode 继承 X 自带 svg 的 `width="..."` 属性。X 不同按钮的 svg 尺寸可能不同(20px / 1.5em / 18px),改 innerHTML 不动外层属性 → 姐姐的 path 用 X 的 box 渲染 → 实际像素不一致 → 看着**偏上/偏小/偏下**。

**修法**:
```js
innerSvg.setAttribute('viewBox', '0 0 24 24');
innerSvg.setAttribute('width', '18.75');
innerSvg.setAttribute('height', '18.75');
innerSvg.style.width = '18.75px';
innerSvg.style.height = '18.75px';
```

**但这是次优**:最好先确认是不是 selector 错(参考 §1)。如果 selector 对了 svg 还是错,才强加尺寸。

## 3. CSS 状态 class 双路径,不要一刀切 `display: none`

**坑**:`.tms-down g { display: none }` 隐藏所有 g,**download 状态也隐藏**导致按钮空 svg。

**修法**:
```css
/* 用 :not() 只隐藏非状态 g */
.tms-down g:not(.tms-d):not(.tms-c):not(.tms-l):not(.tms-f) { display: none; }
/* 用子选择器显示特定状态 */
.tms-down.tms-d > svg > g.tms-d { display: unset; }
```

## 4. setBtn 不重写 download 状态 innerHTML(避免 svg 重排抖动)

**坑**:每次 `setBtn(btn, 'download', ...)` 都 `svg.innerHTML = ...`,**重新解析 SVG 触发重排**,按钮位置抖动。

**修法**:
```js
if (svg && state !== 'download') {
  // 只在切到 c/l/f 时改,download 由 cloneNode 时已写入
  svg.innerHTML = SVG[state] || SVG.download;
}
```

## 5. 微调按钮垂直对齐:用 `transform: translateY(-3px)`,别改 padding/margin

**坑**:padding/margin 改 1px 影响整个 X 工具栏的布局对齐。

**修法**:`transform: translateY(-Npx)` 单独调,不影响其他元素。**N 值用 console 量出**:
```js
const tmsR = document.querySelector('.tms-down').getBoundingClientRect();
const replyR = document.querySelector('[data-testid="reply"]').getBoundingClientRect();
const delta = tmsR.top - replyR.top;  // 正 = tms 在下,负 = tms 在上
console.log('Need translateY', -delta, 'px');
```

## 6. 加占位符 / 模板 / 选项:必须先 grep 参考

**坑**:凭直觉起名字(`{local-time}` 实际参考叫 `{date-time-local}`),凭直觉加占位符(`%YEAR%` 实际参考没有),凭直觉加自定义语法(`{date-time:DD-MMM-YY}` 实际参考有但被砍了又加回来)。

**修法**:**任何"加新占位符"先 grep 参考**:
```bash
grep -E "\{[a-z-]+\}" /path/to/TwitterX-Media-Downloader.user.js | sort -u
```
搜不到 → **不加**,先报用户。搜到 → 看参考的 title 注释(line 854-860)确定语义,再写。

## 7. "参照 X 风格"拆解 SOP(最常踩的坑)

用户说"参照 X"时,先拆 UI / 占位符 / 模板默认值 / 状态字段,**逐句确认**哪个维度对齐哪个参考。**5 步**:

1. **抄用户原话**到对话里(不总结)
2. **逐句拆解**:每句问"这句话指 UI / 占位符 / 模板默认值 / 状态字段 / 其他哪个维度"
3. **每个维度分别确认参考源**(不要笼统"参照 IG")
4. **没说 → 不动**(保持上版或参考默认,不要凭直觉加)
5. **变更前显式报告**:"占位符对齐 A,UI 对齐 B,默认值用 C" → 等用户拍板

**本会话 5 次踩坑**:
- v0.1.0 凭直觉加 4 个错占位符
- v0.1.1 漏 `{date-time-local}`(自起名)
- v0.1.2 占位符仿 IG %KEY%(用户原话是 UI 不是占位符)
- v0.1.6 错选 selector(应是 `pop().parentNode` 拿 wrapper)
- v0.2.0 读反"借鉴获取原图"+"阅读位置自动跳转"

## 8. UI 错位的真因排查顺序(姐姐 v0.1.4~v0.1.7 三次方向错)

UI 错位时按此顺序查,**不要瞎改 CSS**:

1. **selector 选对没?** 88% 错位是 selector 错(参考 §1)
2. **cloneNode 后 svg 尺寸** —— X 自带 svg 的 width/height 不匹配(参考 §2)
3. **CSS flex 居中** —— wrapper 跟 inner 都要 align-items: center
4. **微调用 transform: translateY(-Npx)** —— 用 console 量出真值,不要瞎猜

## 9. 跨 skill 复用

本 references 同时适用于:
- **twitter-assistant**(本 skill,媒体下载 + 阅读位置)
- **ig-saver**(IG 媒体下载,78KB)
- **任何 media-dl 类 userscript**(YouTube / TikTok / Bilibili 等的下载按钮注入)

模式:都是 cloneNode X-style wrapper + 改 inner svg + 油猴菜单 + GM_setValue 存配置 + 8 个 `{key}` 占位符。

## 10. 检测自己是否踩了同样的坑(自检清单)

写新版前问自己:
- [ ] 我这次要加的占位符,在参考脚本里 grep 过吗?
- [ ] 我用的 selector 选的是 wrapper 还是 button?(`pop()` 还是 `pop().parentNode`?)
- [ ] cloneNode 之后 svg 尺寸检查过吗?
- [ ] CSS 状态 class 是用 `:not()` 而不是一刀切 `display: none`?
- [ ] setBtn download 状态没重写 innerHTML?
- [ ] 微调用 transform 而非 padding/margin?
- [ ] 用户原话"参照 X"时,逐句确认了 UI / 占位符 / 模板默认值 / 状态字段?

7 个都打勾才能写。
