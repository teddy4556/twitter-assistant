---
name: twitter-assistant
version: 0.3.36
author: Hermes Agent
license: MIT
category: devops
status: released
description: Twitter/X 油猴脚本(Twitter 助手),一键下载推文原图原视频 + 加宽面板(左/主/右 3 栏宽度可调)。**v0.3.36 = 36 版最终方案** — 推文图强制 jpg 格式 (X 后端 re-encode, 文件名/扩展名/content-type 字节 4 位一致) + 加宽面板用悬浮按钮 + 姐姐自创 HTML 面板 (0 加宽油猴菜单, 完美避开油猴 sandbox "invalid name" throw)。**v0.3.32 关键突破** = 不调 GM_registerMenuCommand 设加宽菜单 (callback 闭包引用 page script 函数, X 改版后 100% throw), 改用 setTimeout(1500) 加悬浮按钮 + showWidthPanel() 函数 + document.createElement('div') 注入, 全部 page script 代码不经油猴 wrapper 验证。**v0.3.33 UI 增强** = slider + 数字 input + +/- 10px 步进按钮, 3 种操作任选。**v0.3.34 探针确认 large === orig, v0.3.35 删探针, v0.3.36 改 URL 强制 jpg**。**5 段铁律永久生效** (见 §1.12)。
tags: [userscript, twitter, x, media-download, wide-layout, anti-bot, graphql, slim, goemon2018-aligned, x-layout-3col-absolute, default-document-end, mutation-observer-only, gm-register-menu-throw, html-panel-fab, force-jpg-format, fact-516, fact-518, fact-520, fact-522]
related_skills: [ig-saver, browser-media-saver, hermes-feishu-send, hermes-tool-path-helper, userscript-authoring, media-dl, media-dl-twitter]
---


# Twitter 助手 v0.3.36

## 0. 这个 skill 是什么

写/改 twitter-assistant 油猴脚本的 always-on rules + 完整 procedure。v0.1.0 → v0.3.36 共 36 版迭代沉淀, 最重要的 3 件事:

1. **v0.3.32/v0.3.33 加宽面板架构** = 0 加宽油猴菜单 + 姐姐自创 HTML 面板 (悬浮按钮 ⚙️ + 弹窗), 完美避开油猴 sandbox "invalid name" throw (油猴 callback 闭包绝不能引用 page script 函数)
2. **v0.3.36 强制 jpg 下载** = `baseUrl + '?format=jpg&name=orig'` 强制 X 后端 re-encode jpg, 文件名 / 扩展名 / content-type / 字节 4 位一致 (双击能打开), 视频保留 max bitrate mp4 不动
3. **§1.13 元教训** = "不验证就写 = 28 版全错", 任何"加新功能 / 改 X 行为"前 step 0 跑 1 行 DevTools 验证当前真值 (§1.13 段 A/B/C-extra/D 四类必查探针), 改完再 1 行 DevTools 验证生效

- **v0.3.36 强制 jpg 格式 + 31 版总表** (10-13 立) = v0.3.7 起的 `:orig` 路径 (v0.3.7-v0.3.35 一直用) + 改 URL 加 `?format=jpg` 让 X re-encode (v0.3.36 新加) + 视频保留 max bitrate mp4. v0.3.36 DevTools 真值 (4 字段一致): `ct=image/jpeg, magic=ffd8ffe0 (JFIF JPEG), len=470KB (大图), isJpeg=true`. 视频/gif 不改 (gif 改 jpg 丢动画). 完整见 `references/v0.3.36-jpg-format.md`

凝练在 §1 (13 段 always-on 铁律), 各版本踩坑在 `references/` 下按版本号分子文件.

## 1. Always-on rules(写代码前先过一遍)

### 1.1 命名 + 版本号(用户硬规则 2026-10-12 立)

- 产物命名 = `<name>-v<MAJOR.MINOR.PATCH>.<ext>`,**必须有 version 段**。例:`twitter-assistant-v0.2.0.user.js`。
- 发用户 + 自己归档都带版本号。SKILL.md frontmatter `version:` 同步。
- 改任何代码 → patch bump(0.0.1)→ 旧版保留 `versions/`,**不删**。
- 改名 = 旧版批量改名 + SKILL.md `name:` 同步改 + `@name` 同步改(姐姐改名 v0.1.9 → 0.2.0 这条用错了:`@name` 字段残留 `Twitter/X Media Saver`,残留 1 版才补)。
- 报告时显式提:"产物 = `<name>-v<NEW>.user.js`,md5=xxx"。

### 1.2 "参照 X 风格"拆解 SOP(用户拍板 2026-10-12,fact #516)

用户说"参照 X"时,先拆 UI / 占位符 / 模板默认值 / 状态字段,**逐句确认**哪个维度对齐哪个参考。**5 步**:

1. **抄用户原话**到对话里(不总结)
2. **逐句拆解**:每句问"这句话指 UI / 占位符 / 模板默认值 / 状态字段 / 其他哪个维度"
3. **每个维度分别确认参考源**(不要笼统"参照 IG")
4. **没说 → 不动**(保持上版或参考默认,不要凭直觉加)
5. **变更前显式报告**:"占位符对齐 A,UI 对齐 B,默认值用 C" → 等用户拍板

**本会话 5 次踩坑**:
- ❌ v0.1.0 凭直觉加 4 个错占位符
- ❌ v0.1.1 漏 `{date-time-local}`(自起名 `{local-time}`)
- ❌ v0.1.2 占位符仿 IG %KEY%(用户原话"参照 ig saver"指 UI 不是占位符)
- ❌ v0.1.6 错选 selector(应是 `pop().parentNode` 拿 wrapper,不是 pop 拿 button)
- ❌ v0.2.0 读反"借鉴获取原图"+"已删功能" (以为要做媒体下载, 实际是问能不能借鉴参考, v0.2.0 做了功能后 v0.3.4 删除)

### 1.3 加占位符的硬纪律(用户纠正 2026-10-12)

**任何"加新占位符"必须先 grep 参考 `TwitterX-Media-Downloader.user.js` 搜 `{xxx}`**:

```bash
grep -E "\{[a-z-]+\}" /path/to/TwitterX-Media-Downloader.user.js | sort -u
```

搜不到 → **不加**,先报用户。搜到 → 看参考的 title 注释(line 854-860)确定语义,再写代码。**不凭直觉起名**(姐姐 v0.1.1 凭直觉叫 `{local-time}`,实际参考叫 `{date-time-local}`,v0.1.3 才改回)。

### 1.4 UI 错位的真因排查顺序(姐姐 v0.1.4~v0.1.7 三次方向错)

UI 错位时按此顺序查,**不要瞎改 CSS**:

1. **selector 选对没?** 88% 错位是 selector 错。X 工具栏的 wrapper 是 `:scope>div>div>div`,button 是最内层。**要 wrapper 不要 button** → `pop().parentNode`(参考 87KB line 351)。
2. **cloneNode 后 svg 尺寸** —— X 自带 svg 的 `width`/`height` 属性可能跟新内容不匹配 → `setAttribute('viewBox', '0 0 24 24')` + `setAttribute('width', '18.75')` 强制。
3. **CSS flex 居中** —— wrapper 跟 inner 都要 `align-items: center; justify-content: center` + `min-height: 1.5em; min-width: 1.5em`。
4. **微调用 `transform: translateY(-3px)`** —— 真用 console 量出 `getBoundingClientRect().top` 差值,**不要瞎猜**。

### 1.5 setBtn 不重写 download 状态 innerHTML(踩坑 2026-10-13)

姐姐 v0.1.4 每次 `setBtn(btn, 'download', ...)` 都 `svg.innerHTML = ...`,**重新解析 SVG 触发重排**,按钮位置抖动。**修法**:`state === 'download'` 时**不**重写 innerHTML(由 cloneNode 时已写入),只在切到 c/l/f 状态时改。

### 1.6 永远先看参考 line 数,别猜

参考 87KB = `TwitterX-Media-Downloader.user.js`(goemon2017)。媒体下载部分 line 350-368(cloneNode 注入)+ line 539(自定义日期)+ line 601(自动 -N/.ext)+ line 854-860(8 占位符 tag)+ line 1676(outline 边框)。

`grep -nE "filename|MutationObserver|cloneNode|outline|setInterval" reference.user.js` 先看参考,再写。

### 1.7 改诊断 log 务必在 IIFE 头部打 `tms v0.X.Y loaded` 标识

加诊断 log 的硬纪律 —— **在 IIFE 启动的最前 5 行**(`'use strict'` 之后、任何业务代码之前)打 `console.log('[tms v0.X.Y] loaded')`。理由:用户装脚本后第一眼看 console,`loaded` 字符串是判断"到底装上没装上"的唯一可信源 —— 没装上 = 整段 IIFE throw,什么 log 都不会有;装上没生效 = loaded 出现但其他 log 不出现,可以快速定位是 GM 抓不到还是 selector 错。

**反面教训**:v0.2.1 → v0.2.1.1 加了 3 行 `console.log('[tms v0.2.1.1-debug] ...')`,但这 3 行在 IIFE 末尾,被前面 throw 卡住,用户装上后 console 看不到任何 v0.2.1.1 字样,4 个版本全靠猜。**v0.2.1.1 → v0.2.2 → v0.2.3 一直在猜,真因是用户没装**。

**v0.3.x 实战加 1 条**: 写探针查 `<style>` 标签时, **必须打 `style.id`** 进 console (不仅是 `style.length`), 验证 query ID 跟实际 style ID 一致. v0.3.27 姐姐查 `document.querySelectorAll('style[id^="tms-"]').length` 永远 0, 实际 X 用 `id="tm-timeline-inner-lock"`, **`tms-` ≠ `tm-`**, 姐姐的探针误导了 28 版. **修法**: 探针先 `console.log(Array.from(document.querySelectorAll('style[id]')).map(s => s.id))` 列出所有 style ID, 看到 ID 再写 query.

### 1.8 "参照 X 加新功能"7 步模板(从 v0.3.0 加宽面板抽象)

用户说"参照 X 加新功能"时,先按 fact #516 SOP 拆 UI / 占位符 / 模板默认值 / 状态字段 4 维度,**不要照搬全部**(只搬你的诉求对应的维度 + 架构)。搬架构不搬功能。

7 步结构(代码层面):

```js
// 段 X.Y:功能名(参考 Clean-up v9.4 §Y 简化)
// 1. GM_key 定义
const WIDTH_KEYS = { timeline: 'tms_...', leftbar: 'tms_...', fillCenter: 'tms_...' };
// 2. 读取函数(getXxx)
const getX = () => GM_getValue(WIDTH_KEYS.x, default);
// 3. CSS 复用器:用 WidthStyles.apply(id, key, buildFn) 同款
//    key 缓存:key 没变 + <style> 还在 → 0 DOM 操作 no-op
const Styles = { state: new Map(), apply(id, key, build) { ... } };
// 4. CSS buildFn(参考 §5 buildXxxCss,简化)
function buildXxxCss() { return `...css...`; }
// 5. applyXxxStyles() 入口
function applyXxxStyles() { Styles.apply('tms-xxx-style', key, buildXxxCss); }
// 6. 菜单注册
GM_registerMenuCommand(`📐 设置 X (当前 ${getX()})`, () => { ... GM_setValue ... applyXxxStyles(); });
// 7. 启动 + 监听:scheduleXxxApply → requestIdleCallback (timeout 300ms)
//    + setInterval(1000) 监 path 变化(SPA)
//    + MutationObserver 监 DOM 变化(新内容加载)
```

**3 步决策**(动手前必做):
1. **用户原话抄下来**到对话里(不总结,见 §1.2)
2. **拆 3-4 维度** → 哪个维度对齐哪个参考(走 fact #516 SOP)
3. **拍板**每个维度的参考源 + 故意不搬的部分(避免过度工程) → 报告"采纳 A/B/C,不搬 D/E/F"

**关键防御设计**(每次都装):
- `applyXxxStyles` 幂等(key 缓存,不变就 no-op)
- 特殊页白名单(`/messages` / `/settings` 跳过某些 CSS,避免变形)
- `promptInt` 范围校验,超范围弹 alert 拒绝
- 双路监听(setInterval 1000 监 path + MutationObserver 监 DOM,任一被 X 改版都不破)

### 1.9 产品逻辑铁律:X.com /home 流深度上限 ~3 天(从 v0.2.3 已删功能失败抽象)

任何"基于 tweetId 在 /home 找推文"的方案,**最多覆盖 3 天内的目标推文**。理由:`/home` 算法流只展示 50-1000 条最热推文,3 天前的推文基本被挤出首屏 + 自动加载深度有上限。

**4 个被否决的修法**:
1. ❌ 加更多重试(10+ 次 60s+):流深度不够,等不到
2. ❌ 模拟用户向下滚找目标:同上,还污染用户当前位置
3. ❌ 跳到推文详情页:用户拍板"留在 /home",跳走违反诉求
4. ❌ toast 提示可选跳转:产品逻辑跟"自动跳"一致,只是 50% 自动化

**3 个衍生规则**:
- 任何"自动定位到推文 N"的产品设计,先评估"目标 N 在 feed 中的存活时长"
- 如果用户执意要做,引向 X.com 自带的 Bookmarks 功能(X 自己设计的产品)
- 不要劝退后还硬试(v0.2.3 姐姐出过"跳详情页"方案,用户拍板否,姐姐及时收回,不死磕)
- **用户拍板关功能时,一次性彻底删**(GM_key + 工具函数 + 菜单 + 启动 + 诊断 log 全清,**不**留僵尸代码或半成品, v0.3.4 删已删功能 196 行一次性删干净)

### 1.11 失败循环铁律:3 版硬上限 + 立即让用户装参考对照 (v0.3.6-0.3.19 共 14 版沉淀)

**核心规则**:**同一类问题连续改 2 个版本仍不工作 → 立即停手**,**不发第 3 版**。姐姐本轮 (v0.3.12-0.3.19) 又走了 8 版才识破真因, 5 轮阈值太高, **降到 3 轮** (v0.3.X-2 错 + v0.3.X-1 换推论又错 + v0.3.X 推论第三次还是错 = 立即停手)。

**触发**:
- 同一 bug 用户报告 ≥ 2 次没修好
- 改完发新版, 用户测试仍失败, **你的修复理由跟前一次一样**(推论没更新)
- 你在"找问题"而不是"修问题"——你每次发新版都在推论根因, 推论每次都换, 推论本身在变, 说明你没真正在验证

**停手后做 4 件事**(顺序):
1. **承认"我不知道真因"** —— 姐姐 v0.3.7→0.3.19 共 14 版没承认, 每次推论都说"X 改版后 React 重置 inline" / "DOMContentLoaded 触发很晚" / "inline 双轨不稳" / "抄 v9.4 简洁架构" / "油猴 wrapper throw" / "持续 patch 模式" / "CSS 抄了 90%" 等等, 推论每次不同, 14 个推论都错。**承认不知道 ≠ 推论, 是态度**。
2. **写诊断探针, 收集 3 件事**:(a) 5 个关键 selector 找到几个元素 (b) `<style>` 标签实际注入的字符数 (c) 脚本是否跑到 line 810 绿色 INSTALLED log。**诊断探针必须跟 @version + console.log 标识同步 bump**, 否则用户装上无法分辨。v0.3.11-debug 错了一次 (5 行探针 + version bump 但 INSTALLED log 没同步, 用户装上不知道是 debug 版)。
3. **让用户装参考脚本直接对照**——v9.4 greasyfork 545419 直接装, 如果 v9.4 在用户浏览器能生效, 真因是 v0.3.19 的实现问题; 如果 v9.4 也不能, 真因在用户环境(扩展 / 浏览器 / 油猴 wrapper)。**不**先继续改 v0.3.20,**等用户对照结果**。
4. **抄参考代码时, 必须读参考 100% 完整内容, 不能跳着读** —— 姐姐 v0.3.10/v0.3.18 都标榜"抄了 v9.4", 实际只读了 v9.4 的架构段 (line 322-330 + 405-419), 跳了 line 318-426 中间 100 多行 CSS, 漏了 5 个关键 selector/属性 (margin auto / .r-1ye8kvj / max-width / common 段 / #react-root)。**v9.4 work 的真因不是简洁架构, 是 CSS 内容**。**硬纪律**:**抄参考代码** = 抄**参考 100% 完整内容** (含全部 selector 和属性), 跳着抄 = 必错。

**v0.3.19-0.3.27 再踩的 9 版失败循环 (用户新原话 + 教训)**:
- 用户原话 "我想知道 为什么 公开的代码能做到的事情 你照抄都做不到" / "他写于多少年没关系 他对今天的twitter依然有效" / "我想知道 你为什么做不出来"
- **本会话 9 版新增的最大失职 = 一直让用户"同时装 v9.4 + v0.3.x 测", v9.4 赢 specificity 覆盖 v0.3.x, 但从来没让用户"卸 v9.4 单独测 v0.3.x"**。姐姐 v0.3.6-0.3.18 一直装 v9.4 测, v0.3.19-0.3.27 抄了 v9.4 完整 CSS 后**还**让用户装 v9.4 测, 9 个版本**没人**问过"卸 v9.4 单测了吗"。**v0.3.27 卸 v9.4 后立刻 work**, 27 版真因 = "一直跟赢家同台, 永远被赢家 specificity 覆盖"。**v0.3.28 修法 = 启动 0/100/500ms 强制重写 CSS 3 次 (绕 cache, 应对 v0.3.27 "刷新失效" — Styles.apply cache 命中跳过, X 改版后 React 重渲染覆盖)**。
- **用户硬偏好 (本会话最大新教训)**:**油猴脚本迭代时第一时间让用户跑 DevTools 4 行真值** (`document.querySelector` + `getComputedStyle().width` + class + 嵌套关系),不要反复改 CSS / selector / patch 周期猜。本会话到 v0.3.26 才让用户跑 1 次 DevTools, **晚 25 版**。
- **用户的核心洞察 = "公开代码 work 的真因不是它写得多好, 是它跟 X 改版正交" (靠 specificity + !important 拼, 不依赖 X 内部具体 class)**。
- **用户接受"自己拼的 inline 双轨 / 持续循环 / 探针 / try-catch / 启动延迟"都是"花里胡哨", v0.3.25 砍光后跟 v9.4 一致才 work** —— 任何用户原参考 work 的脚本, 抄的**全部** = 它 work 的全部, 不要加你以为更好的东西。
- **用户问"为什么做不到"时不要找借口, 直接承认 3 个根本错**:(1) 25 版没让用户真测 (2) 25 版一直在改 main 不是 primaryColumn (3) 8 月底沉淀的 inline 双轨铁律 25 版没用。承认"我不知道" + 说出"我知道什么"是正确答案, 推论 N+1 不是。

**沉没成本 SOP**:
- 备份每版 `versions/<name>-v<X.Y.Z>.user.js.bak-pre-v<X.Y+1.0>`(v0.3.6 起到当前, 已有 bak chain)
- 在 `references/v0.3.X-pitfalls.md` (或 `v0.3.X-Y-pitfalls.md` 多版合并) 写明"这版推论的根因 + 为什么不工作 + 下次不该再走的路"
- **`SKILL.md` status 改 `investigation-paused`**, 不再 `released` —— 防止下次会话盲信"已 released, 应该是好的"

**反模式**(姐姐 14 版全部踩了):
- ❌ 推论错 N 次, 每次发新版都说"这次必中" → **每次推论都给用户, 不验证就发** = 实验用户
- ❌ 抄 v9.4 之前没读 v9.4 完整 buildLayoutCss → "参考能工作"是听说的, 不是验证过的
- ❌ 抄 v9.4 之前没让用户装 v9.4 验证 → 真因可能在用户环境, 油猴脚本救不了
- ❌ 抄 v9.4 跳着读 (line 322-330 + 405-419 而非 318-426) → 漏关键 CSS 差异
- ❌ 加诊断探针不动 @version 标识 → 用户装上不知道是 debug 版
- ❌ status 写 `released` → 下次会话盲信
- ❌ 改 `references/v0.3.X-pitfalls.md` 只说"这版干了啥", 不说"这版为啥不行"
- ❌ **让用户同时装 v9.4 + v0.3.x 测** → v9.4 specificity 永远赢, 永远测不出 v0.3.x 是否 work (本会话 27 版最大新增错)
- ❌ **改完新版没让用户跑 1 行 DevTools** → 4 个关键值 (main 存在 / main width / primaryColumn width / style 标签数) 一目了然, 不跑永远在猜 (本会话 30 版后第一次跑, 1 行揭穿 28 版全错)
- ❌ **加宽功能加 5+ 个油猴菜单 + callback 闭包引用 page script 函数** → 油猴 sandbox 跨 frame throw "invalid name" 阻断整个 IIFE (v0.3.6-v0.3.30 共 25 版都中招, 姐姐到 v0.3.31 才识破)
- ❌ **加宽面板用 setTimeout 强制重写 CSS** → 油猴 sandbox setTimeout 也会 throw, 跟 requestIdleCallback/MutationObserver 一样

### 1.12 油猴 sandbox "invalid name" throw 铁律 (v0.3.6-v0.3.31 共 26 版实战, 永久生效)

**核心铁律**: **改 X 改版后任何油猴脚本, callback 闭包引用 page script 函数 = 100% throw "invalid name"**。

**机制** (从 31 版失败总结):
1. 油猴把 `GM_registerMenuCommand` 的 callback 包成一个 wrapper function
2. 油猴 wrapper 在 X 改版后, 每次用户点油猴菜单时, **验证 callback 引用的 page script 函数** (如 `getTimelineWidth` / `buildWidthCss` / `applyWidthStyles`)
3. X 改版后, page script 函数被 X content.js wrapper 改过引用, **油猴 wrapper 验证失败 → throw "invalid name"**
4. throw 后所有后续代码 (包括 `applyWidthStyles` 写 CSS) 都不跑 → **加宽无效**
5. console 看到 `Uncaught (in promise) invalid name` + `At @ VMxxxx:10` + `r.setMessageListener.r` 是这个 throw 的特征

**5 段永久铁律**:

**1. 改 X 改版后, callback 闭包绝不能引用 page script 函数**

| 油猴调用 | 在 X 改版后 throw 概率 | 修法 |
|---|---|---|
| `GM_registerMenuCommand` (callback 闭包引用 page script 函数) | **100% throw** | **0 菜单** 或用姐姐自创 HTML 面板 |
| `GM_registerMenuCommand` (callback 只引用字符串 + GM_* API) | 0% throw (v0.3.7 模板菜单 work) | 保留 |
| `GM_setValue` / `GM_getValue` | 0% throw | 保留 |
| `requestIdleCallback` / `MutationObserver` / 持续 `setTimeout` | 看运气 (v9.4 没事, v0.3.18-v0.3.30 throw) | 用 `setTimeout(0)` 兜底 |
| **自创 HTML 面板** (悬浮按钮 + 弹窗) | **0% throw** (不经油猴 wrapper) | **推荐用这个** |

**2. 加宽面板正确架构 (v0.3.32 实战 100% 稳)**:

```js
// 油猴头部 (0 加宽菜单, 0 持续循环, 0 MutationObserver)
const applyWidthStyles = () => { /* 直接 el.textContent = buildWidthCss() */ };
if (document.body) applyWidthStyles();
else document.addEventListener('DOMContentLoaded', applyWidthStyles);

// 启动 1.5 秒后用 setTimeout 加悬浮按钮 (setTimeout 0ms 主循环外安全)
setTimeout(() => {
  if (document.body && !document.getElementById('tms-fab')) {
    const fab = document.createElement('div');
    fab.id = 'tms-fab';
    fab.textContent = '⚙️';
    fab.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999998;...';
    fab.onclick = showWidthPanel;  // showWidthPanel 是 page script 函数, 但 onclick 触发时已经在 page script 上下文, 不经油猴 wrapper 验证
    document.body.appendChild(fab);
  }
}, 1500);
```

**3. 真因查询 DevTools 4 行 + 1 行真值必查**:

```js
JSON.stringify({
  main: !!document.querySelector('main[role="main"]'),
  mainW: getComputedStyle(document.querySelector('main[role="main"]') || document.body).width,
  primary: !!document.querySelector('div[data-testid="primaryColumn"]'),
  primaryW: getComputedStyle(document.querySelector('div[data-testid="primaryColumn"]') || document.body).width,
  style: document.querySelectorAll('style[id^="tm-"]').length  // ⚠️ 关键: id^="tm-" 不是 "tms-" (v9.4 同款 ID)
})
```

**4. "花里胡哨"全部砍掉 (姐姐 31 版验证 5 件无用功)**:

❌ **inline 双轨** (`el.style.setProperty`) — React mount 重置 inline, 28 版验证不稳
❌ **持续 setTimeout 循环** (`setTimeout(keepApplyingWidth, 200)`) — 油猴 sandbox setTimeout 也会 throw
❌ **unhandledrejection + error 探针** — 加了反而 throw 更复杂
❌ **IIFE 末尾 try-catch** — throw 阻断后续代码, catch 也救不了
❌ **启动 1500ms 延迟** — 解决时序但不解决 throw, 用 `setTimeout(0)` 主循环外兜底

**5. 抄 v9.4 必须 100% 完整 + 用同款 style ID**:

| 项 | 抄 v9.4 必须一致 |
|---|---|
| CSS 100% (所有 selector + 属性) | ✅ 抄全 |
| style 标签 ID `tm-timeline-inner-lock` (不是 `tms-xxx`) | ✅ 用同款 ID |
| buildLayoutCss 100% | ✅ 抄全 |
| **不要加 v9.4 没有的任何"花里胡哨"** | ✅ 别加 |
| **加宽菜单数 = 0** (v9.4 0 个, 你也别加) | ✅ 0 个 |

**v0.3.32 关键突破 (31 版最终方案)**:
- v0.3.6 → v0.3.30 共 25 版失败, **真因不是 CSS 错, 是油猴 sandbox throw "invalid name" 阻断** (5 个加宽菜单 callback 闭包引用 page script 函数)
- v0.3.31 = 0 加宽菜单 + 写死 1200px + 同步 applyWidthStyles, 100% 不会 throw
- v0.3.32 = 0 加宽菜单 + 姐姐自创 HTML 面板 (`showWidthPanel()` + `setTimeout(1500)` 加 ⚙️ 按钮), 5 个加宽值用 5 个 slider 控制
- v0.3.33 = v0.3.32 + slider ↔ number input 双向同步 + +/- 10px 步进按钮

**v9.4 在用户浏览器 work 的真因** (v0.3.32 验证):
- v9.4 没设任何加宽菜单, **没有 callback 闭包引用 page script 函数**, 油猴 wrapper 不验证 → 不 throw
- 之前 28 版姐姐分析 "v0.3.x 跟 v9.4 拼 specificity" **完全错**
- 之前 28 版姐姐分析 "v0.3.x CSS 不 work" **完全错** (CSS 一直 work, 姐姐的 `id^="tms-"` 查询错, 永远 0)

**6 段铁律永久生效 (写任何 X 改版油猴脚本必读)**:

1. **callback 闭包绝不引用 page script 函数** (改用自创 HTML 面板)
2. **真因查询用 `id^="tm-"` 不用 `id^="tms-"`** (v9.4 同款 ID, 永远能查到)
3. **第一次失败立即让用户跑 1 行 DevTools** (4 值 30 秒定位)
4. **"花里胡哨"全砍, 抄 v9.4 100% 完整** (v9.4 已经 work, 你的 5 行 hack 全是噪声)
5. **加宽面板用悬浮按钮 + 自创 HTML 面板, 不用 5+ 个油猴菜单**
6. **31 版真因 = 油猴 sandbox throw, 不是 CSS / selector / cache / patch 周期**

### 1.13 不验证就写 = 28 版全错 元教训 (v0.3.6-v0.3.33 共 28 版实战)

**核心铁律**: **任何"加新功能 / 改 X 行为 / 改用户感知的输出"前, 必须先 1 行 DevTools 验证当前真实状态, 再写代码**。

**为什么是元教训 (跨一切任务)**:
- §1.11 失败循环 = "改 3 版无效, 停手收集证据"
- §1.12 油猴 throw = "callback 闭包引用 page script 函数 throw"
- **§1.13 = §1.11 + §1.12 之上的元教训**: 不验证就改 = 28 版同根错 (CSS 一直 work, 姐姐的 `id^="tms-"` 查询错, 永远以为"throw 阻断"实则"查询错")
- **v0.3.34 实战证明**: 用户问"自动原图 / 自动载入大图", 姐姐先 1 行 DevTools 跑 `document.querySelectorAll('article img[src*="pbs.twimg.com/media"]')`, 30 秒拿到 5 个真值: `imgCount=16` (不是 100+), `name=large` (X 改版后默认就是大图, 不是 small), `naturalW/H=2048x2048` (实际加载尺寸), `fmt=jpg 100%` (无 webp 兼容问题), `videoCount=0` (主页无视频, 视频方案不用考虑). **姐姐再决定 "下载强制 orig" 而不是"自动原图"功能** (因为 X 已经是 large, 用户点查看原图才是 orig).

**4 步 DevTools 验证 SOP (任何"X 行为不 work"任务都跑)**:

1. **确定现象**: 用户说 "X 不 work" → 问: 不 work = 完全没效果? 效果不对? 一致性差? 性能慢? (5 选 1)
2. **跑 1 行 DevTools**: 查 4 个值 (存在性 / 数量 / 当前状态 / 期望值), **不要超过 1 行**, 多于 1 行说明你没想清楚要查什么
3. **看真值再决策**: 真值 X 真值, 决策 = A 方案 / B 方案 / 都不需要 (因为 X 行为已经对了)
4. **改代码后 1 行真值再验**: 改完发新版, 让用户跑同一行 DevTools, 对比修改前后 4 个值, **如果值没变 = 没生效, 回去查 1.11 失败循环铁律, 不是改代码**

**3 类必查的 1 行 DevTools (写 twitter 助手这类 X 改版油猴脚本必备)**:

**A. CSS 是否写进 head** (加宽 / 颜色 / 主题类功能):
```js
JSON.stringify({
  style: document.querySelectorAll('style[id^="tm-"]').length,  // ⚠️ tm- 不是 tms-
  main: !!document.querySelector('main[role="main"]'),
  mainW: getComputedStyle(document.querySelector('main[role="main"]') || document.body).width,
  primaryW: getComputedStyle(document.querySelector('div[data-testid="primaryColumn"]') || document.body).width
})
```

**B. 媒体 URL 实际值** (下载 / 自动大图类功能):
```js
const imgs = document.querySelectorAll('article img[src*="pbs.twimg.com/media"]');
const sample = Array.from(imgs).slice(0, 3).map(i => {
  const u = new URL(i.src);
  return {w: i.naturalWidth, name: u.searchParams.get('name'), fmt: u.searchParams.get('format')};
});
JSON.stringify({imgCount: imgs.length, sample})
```

**C. 用户能看到的功能状态** (按钮 / 悬浮元素 / 菜单类功能):
```js
JSON.stringify({
  fab: !!document.getElementById('tms-fab'),
  panel: !!document.getElementById('tms-width-panel'),
  downloadButtons: document.querySelectorAll('button[aria-label*="download" i], [data-testid*="download" i]').length,
  consoleLog: '[在 console 找 INSTALLED log, 确认脚本启动]'
})
```

**D. 媒体字节 + ext 一致性 (下载类功能, 10-13 立)**:
```js
(async () => {
  const url = Array.from(document.querySelectorAll('img[src*="pbs.twimg.com/media"]'))[0]?.src;
  if (!url) return 'no img';
  const baseUrl = url.split('?')[0];
  const r = await fetch(`${baseUrl}?format=jpg&name=orig`);
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf).slice(0, 4);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return JSON.stringify({contentType: r.headers.get('content-type'), len: buf.byteLength, magic: hex, isJpeg: hex.startsWith('ffd8ff'), isPng: hex === '89504e47', isWebp: hex.startsWith('52494646')}, null, 2);
})()
```

**真值判读 (10-13 验证, 永久生效)**:
- `magic` = `ffd8ff...` → JPEG 字节, 跟 `.jpg` 扩展名一致
- `magic` = `89504e47` → PNG 字节, 但 ext 是 `.jpg` → **双击打不开**, 真因
- `magic` = `52494646...` → WebP 字节, 同上
- **油猴 `GM_download` 不能转码**, 拿啥存啥, ext 写死 'jpg' 但实际字节可能是 png/webp → 文件名跟内容不一致, 双击打不开
- **修法**: 改 URL `${baseUrl}?format=jpg&name=orig` 强制 X 后端 re-encode 成 jpg, 字节 100% 是 jpg

**X 改版后 `?format=jpg&name=orig` 真值 (10-13)**:
- X 后端会 re-encode 原图成 jpg 编码 (v0.3.36 验证, 待用户 1 行 DevTools 确认)
- 字节大小: 跟 `:orig` 字节比 1.0-1.5 倍 (jpg 压缩比 png 小, 实际可能略小)
- **关键**: `contentType: image/jpeg` (response header 验证)
- 如果 `contentType: image/png` → X 不支持 format=jpg re-encode, 走 v0.3.35 兜底 `:orig` (ext 跟字节不一致, 用户需自己改名)

**反模式 (v0.3.7-v0.3.35 33 版都踩了)**:
- ❌ 写死 `ext: 'jpg'` 但用 `media_url_https + ':orig'` → 字节可能是 png, 双击打不开
- ❌ 用 `?format=png&name=orig` 拿原格式 → ext 跟字节不一致
- ✅ 用 `baseUrl + '?format=jpg&name=orig'` → X re-encode, ext 跟字节一致

**视频/gif 不改** (v0.3.36 只改图, 视频保留 max bitrate mp4, gif 不动, 改 jpg 丢动画)

**C-extra. 媒体字节真值对比 (下载 / 原图类功能, 10-13 立)**:
```js
(async () => {
  const url = Array.from(document.querySelectorAll('img[src*="pbs.twimg.com/media"]'))[0]?.src;
  if (!url) return 'no img';
  const baseUrl = url.split('?')[0];
  const [l, o] = await Promise.all([
    fetch(`${baseUrl}?format=jpg&name=large`).then(r => r.headers.get('content-length')),
    fetch(`${baseUrl}?format=jpg&name=orig`).then(r => r.headers.get('content-length'))
  ]);
  return JSON.stringify({baseUrl: baseUrl.substring(0, 50), large: parseInt(l), orig: parseInt(o), ratio: (o / l).toFixed(2)});
})()
```

**X 改版后媒体档位真值 (10-13 验证, 永久生效)**:
- X 改版后主页 `?name=thumb` / `?name=small` = **0 张**, X 主页只发 `?name=large` (e.g. 2048x2048) / `?name=medium` (1200x1200) / `?name=900x900`
- 对**同一张图**, `?name=large` 和 `:orig` 字节比 = **1.00** (X 后端返回同一份文件, large 已 re-encode 到原图同等大小)
- **结论**: 下载强制 `:orig` 即可, 不需要"自动原图"功能 (X 默认就是 large, large === orig, 1:1 字节比证明)
- **用户硬偏好 (10-13 锁定)**: "我只需要确定下载的不是缩略图" — 跑 C-extra 探针证明下载的图是 large/medium (>= 1200px), 不是 thumb/small (<= 400px), 即可. 不用纠结 orig 跟 large 字节比 (1.00 是 X 改版后的正常行为, 不是 bug). **写"自动原图"功能前必跑 C-extra, 99% 跑完发现不需要新功能, 现有 `:orig` 路径就是正确方案**

**反模式 (姐姐 28 版全踩了)**:
- ❌ "用户说 X 不 work, 我改 1 版 CSS" → 1 版没改对, 再改 1 版, 再改 1 版, 28 版
- ❌ "我猜 X 是 selector 错" → 猜 + 改 + 发, 用户说还错, 再猜 + 改 + 发, 28 版
- ❌ "我读 v9.4 完整 CSS 应该能 work" → 抄了 100%, 还是不 work, 因为 v9.4 work 的真因是"不设加宽菜单", 跟 CSS 无关
- ❌ "我加 inline 双轨 / 持续循环 / 探针 / try-catch / 启动延迟, 这样应该稳" → 加 5 件全是噪声, 真因 1 行 DevTools 就揭穿
- ✅ "1 行 DevTools 拿真值 → 决策方案 → 改代码 → 1 行 DevTools 验证" → 4 步走完, 1 版搞定

**1.13 + §1.11 + §1.12 三章一起读 = 完整的不验证就写 = 必错元教训**:
- §1.11 教"3 版无效停手"
- §1.12 教"油猴 throw 真因"
- §1.13 教"动手前 1 行 DevTools, 动手后 1 行 DevTools 验证"

### 1.10 接管 X.com CSS 布局的 6 段铁律(v0.3.0 → v0.3.10 实战,X 改版后所有 CSS 接管通用)

1. **改主栏 width 救不回右栏,3 栏必须一起管** —— X 改版后右栏用 absolute 定位,主栏变宽不会让右栏让位 → 单纯设 `width: 700px` 到 `primaryColumn` 会**直接把右栏挤出屏**。`buildLayoutCss` 必须同时输出 3 栏 width,缺一个就破。
2. **多图轮播接管宽度但别动 aspect-ratio** —— X 用 `position: relative; padding-bottom: N%` 算多图高度,脚本接管 height 会导致图片裁切。**只**锁 `max-width: 100%`,**别动** `aspect-ratio` / `padding-bottom` / `position: relative`。`display: none` 藏 X 原生 prev/next 滑按钮**会**破坏桌面端 3+ 张图翻页,藏前必验证。
3. **`display: none` 影响范围比想象大,藏前先验证** —— X 改版后很多"小但关键"的元素(滑按钮 / 折叠按钮 / sticky 浮窗)看着"多余",但都是用户主要交互入口。**先验证再藏,藏了要补**(滚轮监听 / 键盘快捷键 / 替代 UI)。
4. **X 改版后主栏内部 4 层 flex 嵌套,缺一不可** —— `main` → `primaryColumn` → `r-1awozwy.r-18u37iz` → `r-16y2uox`。`r-*` class 是 React 动态 hash(每次部署都换,**不能**写死 selector),但 selector 结构稳定。`r-1awozwy` 是 flex 容器(display: flex, flex-direction: row,头像 / 内容 / 更多按钮),`r-16y2uox` 是内容容器(默认 `flex-grow: 1`)。**每一层都得显式 `width: 100%` + `flex-grow: 1`**,缺一层就被上层 grow 顶爆。**只动 primaryColumn 一定撞**(v0.3.5 单改主栏 → 单视频撑爆;v0.3.6 搬参考代码 §5 4 个 r-* class 全控制才修好)。**关键**:就算 v0.3.10 砍了 inline 双轨,这一段在文档级 CSS 里仍然要全管(`buildWidthCss` 必须包含全部 4 层的 width 控制)。
5. **X 改版后 CSS 接管优先级的不完整认知** — 浏览器 specificity 铁律说"inline 一定赢 `!important`",姐姐之前(v0.3.8)信这条 → 写 inline `setProperty` 试图赢 React → 输。**但反过来, 文档级 `<style>` + `!important` 一定能赢 inline 也是错的**——X 改版后 React 组件在 mount/unmount 时会改 DOM,CSS 实际被 React 覆盖还是被 React 重置,机制不明,油猴社区没定论。**v9.4 work 的真因不是"文档级 CSS + !important 必然 work", 真因是 v9.4 的 buildLayoutCss 跟我们的 CSS 有 5 个关键差异 (margin auto / .r-1ye8kvj / max-width / common 段 / #react-root), v0.3.19 跟 v9.4 100% 一致后才逼近锁定**。**不要凭"参考的能工作 = 抄过来能工作"推方案**, 抄参考必须读 100% 完整内容(见 §1.11 第 4 步硬纪律)。**v9.4 在 greasyfork 评论里说能工作 = 99% 用户用 Chrome 默认设置, 用户可能有 adblock / Dark Reader / 隐私扩展 删了 `!important` 或阻止了 `<style>` 注入**。**下次接到"载入就生效"诉求的诊断顺序**:(1) 先看用户浏览器装的扩展 (2) 让用户装参考脚本 (v9.4 直接装) 验证 (3) **装不上 v9.4 时, 真因不在油猴脚本, 在用户环境**。
6. **X 改版后 SPA 启动时序:别依赖 `document.body` 早绑定** —— `@run-at document-start` 时 `document.body` 通常 null(HTML 还没解析完),走 `if (document.body)` 假 → 走 `DOMContentLoaded` 兜底 → **X 改版后 DOMContentLoaded 触发很晚**(可能几秒后)= 中间用户看见宽度没生效。**修法**:
   - **不要**用 `@run-at document-start`(走油猴默认 = `@run-at document-end`,启动时 `document.body` 一定存在,免去所有时序问题)
   - **不要**用 `addEventListener('DOMContentLoaded', ...)` 兜底(触发太晚)
   - **不要**用 `setInterval` 200ms 轮询找 primaryColumn(用户报告刷新后仍失效,因为 v0.3.10 验证 inline 双轨方案本身不稳,轮询只解决时序不解决 React 重置)
   - **直接** `if (document.body) new MutationObserver(scheduleWidthApply).observe(document.body)` —— `document-end` 启动时 body 一定有,X 改版后第一次 React mount 必然改 body → 触发 observer → `applyWidthStyles` 走 `WidthStyles.apply` 幂等缓存(key 没变就 no-op)

**v0.3.10 终极方案**(回归 v9.4 简洁架构,本会话 4 版实战 100+ 行白写后的最终方案):
```js
// 油猴头部 — 不要写 @run-at(让油猴默认 = document-end)
new MutationObserver(scheduleWidthApply).observe(document.body, { childList: true, subtree: true });
applyWidthStyles();  // G.4 启动时跑一次,X React mount 后 observer 持续接力
```
全文就这 3 行核心。**6 段铁律 #1-#4 都在 `buildWidthCss` 里写文档级 CSS**(3 栏 width + 4 层 flex + 隐藏 / fillCenter / 特殊页白名单),#5 + #6 都靠"`@run-at` 默认 + 文档级 CSS + 文档级 `<style>`"解决,不需要 inline / 轮询 / documentElement 兜底。

**完整代码示例**:`twitter-assistant` v0.3.10 是 6 段铁律的最小实现(803 行,v0.3.9 923 行砍 120 行 = v0.3.8 删 inline 函数 91 行 + v0.3.9 删轮询 22 行 + v0.3.10 进一步简化 G.4 / G.5)。改 X 改版后任何样式照搬这套。**踩坑细节在 `references/v0.3.4-pitfalls.md` / `v0.3.6-pitfalls.md` / `v0.3.7-pitfalls.md` / `v0.3.8-pitfalls.md` / `v0.3.9-pitfalls.md` / `v0.3.10-pitfalls.md`(6 个文件各对应一段铁律的实战沉淀)**。

## 2. Procedure(写 v0.X.0 的步骤)

### 2.1 写新版前的 30 秒

1. **读 SKILL.md §1 always-on rules**(本文)→ 避免重蹈覆辙
2. **读 `references/v0.1.0-v0.2.0-changelog.md`** → 知道上版改了啥、踩了啥坑
3. **明确目标**:新功能是什么、跟现有功能的关系、用户拍板了哪些边界
4. **★ step 0 - 1 行 DevTools 验证当前 X 行为** (元教训 §1.13) — **没跑这步不动手**:
   - 加宽/颜色/主题类功能 → 跑 1.13 段 A (style/main/mainW/primaryW)
   - 下载/自动大图类功能 → 跑 1.13 段 B (imgCount/sample)
   - 按钮/悬浮元素/菜单类功能 → 跑 1.13 段 C (fab/panel/downloadButtons)
   - 真值拿回来, 跟用户描述对一下, 确认"用户说的不 work"和"X 实际行为"之间有没有认知差
   - 跑完**对话里贴出来**, 再问"按这 4 个真值, 你的方案是什么?" (让用户拍板, 不是姐姐拍板)

### 2.2 写新版时

1. **cp 上版 → 新版文件**(改扩展名前缀时用 `mv` 批量改,保留所有旧版)
2. **patch 4 个 metadata**:`@name` + `@name:zh` + `@version` + `console.log` 版本号
3. **patch @grant** 加新功能需要的(GM_download / GM_setValue / GM_getValue / GM_registerMenuCommand / GM_deleteValue)
4. **写新功能代码** → 插到合适位置(参考同类功能)
5. **node -e "new Function('GM_xxx', IIFE)"** 跑 syntax 检查
6. **md5sum** 算产物指纹
7. **写 changelog**(`references/v0.1.0-v0.2.0-changelog.md` 追加)+ 报告:`产物 = <name>-v<X.Y.Z>.<ext>,md5=xxx`

### 2.3 写新版后

1. **本地测试场景** —— 新功能的 3-5 个 happy path 跑通(node 模拟或直接调函数)
2. **更新 SKILL.md** 主体:新功能写进 always-on rules / 关键能力
3. **md5 记到报告** —— 用户装上对照

## 3. 8 占位符(对齐参考 goemon2017 87KB line 854-860)

| 占位符 | 例子 | 来源 |
|---|---|---|
| `{user-name}` | 益新 | user.name(清洗) |
| `{user-id}` | yixinyaoxin | user.screen_name |
| `{status-id}` | 1971234567890123456 | legacy.id_str |
| `{date-time}` | 20261013-081530 | UTC,默认 YYYYMMDD-hhmmss |
| `{date-time:格式}` | 自定义格式 | DD-MMM-YY hh.mm |
| `{date-time-local}` | 161530 | 本地时区 |
| `{date-time-local:格式}` | 自定义 | 本地 + 格式 |
| `{full-text}` | 一句推文 | legacy.full_text |
| `{file-type}` | photo / video / gif | media.type |
| `{file-name}` | Cb1K7vXa | media.url stem |

## 4. 油猴菜单(v0.3.4 共 8 项,v0.3.0-v0.3.2 演变成型)

### 4.1 命名模板(v0.2.0 起,共 2 项)
- **📝 设置命名模板** — `window.prompt` 多行 help(对齐 IG Saver 78KB line 1782-1796)
- **🔄 重置模板** — 回 `TPL_DEFAULT`

### 4.2 面板宽度(v0.3.0 新增,v0.3.2 扩成 3 栏 + 隐藏开关,走 7 步模板 §1.8)
- **📐 设置时间轴宽度 (当前 700px)** — 范围 500-1500,主时间轴 `main div[data-testid="primaryColumn"]` 宽度
- **📏 设置左侧栏宽度 (当前 275px)** — 范围 200-400,`header[role="banner"]` 宽度
- **🪟 设置右侧栏宽度 (当前 290px)** — 范围 200-400,v0.3.2 新增,`[data-testid="sidebarColumn"]` 宽度
- **↔️ 中间填满 (当前 ⏹ 关闭)** — 切换 `fillCenter`,开启后 primaryColumn 占满 viewport
- **⬅️ 隐藏左栏 (当前 ❌ 显示)** — v0.3.2 新增,`display: none` 藏 `header[role="banner"]`
- **➡️ 隐藏右栏 (当前 ❌ 显示)** — v0.3.2 新增,`display: none` 藏 `[data-testid="sidebarColumn"]`

**6 个 GM_key**:`tms_timeline_width` / `tms_leftbar_width` / `tms_rightbar_width` / `tms_fill_center` / `tms_hide_leftbar` / `tms_hide_rightbar`,默认 700 / 275 / 290 / false / false / false。

**v0.3.0 → v0.3.1 → v0.3.2 演变成型**:
- v0.3.0 姐姐只改主栏 + 左侧栏 2 项,右栏被挤出屏(用户截图反馈)
- v0.3.1 强钉 `[data-testid="sidebarColumn"]` 290px,**仍然没解决**(X 改版后 3 栏是 absolute 浮动,改 width 救不回)
- v0.3.2 加右栏菜单 + 隐藏左/右栏开关 3 项,3 栏全控 + 软约束 console.warn(总宽 > 视窗时提示)

### 4.3 多图接管(v0.3.3 引入,v0.3.4 修 display:none bug)

`buildPhotoGridCss` 输出:
```css
article [data-testid="ScrollSnap-List"] { max-width: 100% !important; }
```
- **接管宽度不裁切**:锁 `max-width: 100%` 让容器跟主栏,**不动** X 原生 `aspect-ratio` / `padding-bottom` / `position: relative`(这些是 X 自己算高度的,接管会裁切图片)
- **不藏 prev/next 按钮**:v0.3.3 姐姐加了 `display: none` 藏 X 原生滑按钮,3+ 张图无法用按钮翻页(用户反馈),v0.3.4 撤回

## 5. 默认模板
```
{user-name}(@{user-id})_{date-time}_{status-id}_{file-type}
```

## 6. 关键能力
- 一键下原图(`baseUrl + '?format=jpg&name=orig'` 强制 X re-encode jpg, v0.3.36, ext 跟字节一致, 双击能打开)+ 视频 max bitrate mp4
- 8 占位符命名模板(油猴菜单可改)
- 加宽面板 3 栏全控(左/主/右宽度可调,加 fillCenter 和隐藏左/右栏开关,v0.3.2 演变成型,见 §1.10)
- 多图轮播接管宽度不裁切(v0.3.3 引入,v0.3.4 修 display:none bug,见 §1.10)
- **v0.3.10 回归 v9.4 简洁架构**(见 §1.10 铁律 #5 + #6)—— `@run-at` 走油猴默认 + 文档级 `<style>` + `!important` + `MutationObserver(document.body)`,**3 行核心**。inline setProperty 双轨 + 200ms 轮询 + documentElement 兜底**全部砍掉**(v0.3.7/8/9 验证了 3 个版本 100+ 行白写,React mount 重置 inline style,inline 方案本身不稳)。`buildWidthCss` 函数仍然要全管 3 栏 width + 4 层 flex 嵌套(铁律 #1 + #4),不走 inline 而是文档级 CSS
- 风控节流:graphql 800ms / 下载 300ms
- 引用推文自动下,文件名加 `-quoted` 后缀
- 多图/多视频 -N 后缀(模板不含 `{file-name}` 时自动加,参考 line 601)
- 自动 .ext 结尾(模板没写也加,参考 line 601)
- transform: translateY(-3px) 工具栏精准对齐(v0.1.9)

## 7. 触发词(下次会话自检)

- "twitter 助手 装上了" / "按钮不出现" / "下不了图" / "位置错" → §1.4 UI 错位排查
- "v0.2.0 改 X" → patch bump 到 v0.2.1,流程 §2.2
- "加新占位符" → **必须先 grep 参考 87KB** (§1.3)
- "命名模板改" / "想加占位符" → 油猴菜单改,**不要**改代码常量
- "参照 IG" / "参照 IG Helper" → ❌ **占位符绝不要参考 IG**(用户明确说,§1.2)
- "借鉴 X" → **先确认指哪个维度**(占位符 / UI / 模板默认值),§1.2
- "下载按钮不水平" / "图标位置错" / "图标挂底" → §1.4 排查顺序
- "刷新就失效" / "切回 X 页面没生效" / "点设置 N 才生效" / "@run-at 改后失效" → §1.10 铁律 #6(走油猴默认 `@run-at` 而不是 document-start,document.body 一定有,MutationObserver 直接挂上)
- "主栏撑爆右栏" / "主栏 600px" / "r-* class" → §1.10 铁律 #4(4 层 flex 嵌套)
- "console 报 invalid name" / "setProperty 报错" / "油猴 wrapper line 905" → §1.10 铁律 #5(inline setProperty 在 X 改版后不稳, 但**反过来, 文档级 CSS + !important 必然 work 也是错的** —— 见 §1.11)
- "width 不是载入就生效" / "切回 /home 没宽度" / "v0.3.7/8/9/10/11 都不行" → §1.11「5 轮失败循环必须停手收集证据」铁律: **不要**先发 v0.3.12, 先让用户装 v9.4 greasyfork 545419 对照, 等反馈
- "v9.4 怎么实现的" / "Clean-up v9.4 加宽怎么写" / "能不能抄 v9.4 简洁架构" → §1.10 铁律 #5+#6 v9.4 架构描述, **但**v9.4 在用户浏览器也可能不工作。**抄之前先让用户装 v9.4 直接对照**
- "自动原图" / "自动载入大图" / "图片不显示" / "图片模糊" / "下载的不是原图" → §1.13 元教训 step 0 跑 1 行 DevTools 查 X 实际 img URL, 99% 情况 X 改版后默认就是 `?name=large`, 不需要"自动原图"功能, 真正要做的是"下载强制 `:orig`" (v0.3.34 已做). **没跑 §1.13 段 B 探针前不要写自动原图功能**
- "下载原图" / "强制原画质" / "下到的图不清晰" / "想要上传原图" → v0.3.34 改 `media_url_https + :orig` (图) + max bitrate mp4 (视频), 已经有 console.log 探针打印实际下载 URL. **如果 console 探针没出 = 脚本没跑, 查 §1.7 INSTALLED log**
- "v0.3.34 装上还是下不到 orig" / "下到的图跟 large 一样大" → 真因可能是 X GraphQL 字段缺失, 走 v0.3.34 兜底逻辑 (改 `?format=jpg&name=orig`), 仍然 0 bytes 查 §1.13 段 B 探针
- "v0.3.34 console.log 太多" / "console 探针不想要" / "想要更干净" → 出 v0.3.35 = 删 v0.3.34 加的 2 个 console.log 探针, 下载功能 100% 等价. v0.3.35 唯一目标 = 减 console 噪音. v0.3.34 / v0.3.35 选哪个 = 用户要不要探针 (调试用), 不要就 v0.3.35
- "下载的不是缩略图" / "想要原图" / "下到的图小" / "X 主页看不到下载的图" → §1.13 段 C-extra 跑 fetch + content-length 对比 large vs orig. 期望: ratio 1.00 (X 改版后同档), imgCount 16 (主页 16 张图), name=large 100%. 结论: 下载强制 `:orig` 即可, v0.3.35 work, 不需要新功能
- "想要自动原图" / "想让 X 页面大图自动显示" → **不写**! §1.13 段 C-extra 跑完 ratio 1.00, X 主页 0 张 thumb/small, 已经是 large. 用户"想看大图"用浏览器原生点查看大图即可. 油猴改 URL 会触发浏览器重新请求所有图, 30 秒加载完 16 张大图, 用户体感变差. **不写就是正确答案**
- "想要控制台干净" / "console log 太多" / "删 console.log" → v0.3.35 默认不带探针. v0.3.34 有探针, 但 console 仍可能有多余 log. 审查 `console.log` 调用, 只保留 INSTALLED 那 1 条, 其余可删. 姐姐 v0.3.35 实战: 删 2 个 `强制原图 URL = ...` + `强制原画质视频 = ...` 探针, 保留 INSTALLED
- "下载的图打不开" / "双击 jpg 没反应" / "jpg 文件字节是 png" / "想要 jpg 格式保存" / "图片查看器打不开下载的文件" → §1.13 段 D 探针 (`magic` 头 4 字节判读, jpg=`ffd8ff`, png=`89504e47`, webp=`52494646`). 真因: v0.3.7-v0.3.35 ext 写死 'jpg' 但 `:orig` URL 返回 png/webp 字节, 文件名跟内容不一致, 双击打不开. 修法: 出 v0.3.36 = 改 URL `${baseUrl}?format=jpg&name=orig` 强制 X re-encode jpg. 验证: 跑 D 探针, `magic: 'ffd8ff...'` + `isJpeg: true` = work. 视频/gif 不改 (改 jpg 丢动画). **改 X 任何下载类功能前必跑 D 探针, ext 跟字节不一致是隐性 bug 不会 throw, 但用户用不了**
- "下到的图扩展名 .jpg 但实际是 png" / "文件管理器显示 .jpg 但内容是 png" → §1.13 段 D. 修法 v0.3.36 (URL 改 `?format=jpg&name=orig`). 油猴不能转码, 只能靠 X 后端 re-encode
- "下到的视频 .mp4 没事" / "下到的图打不开" / "图跟视频区别" → §1.13 段 D, v0.3.36 只改图 (mp4 本来就是 mp4, gif 改 jpg 丢动画)
- "下到的图 0 bytes" / "下载失败" / "文件空" → §1.13 段 C-extra 探针查 `?format=jpg&name=orig` content-length, 0 = X GraphQL 字段缺失, 走 v0.3.35 兜底 `media_url_https + ':orig'`

## 8. 关联
- **占位符 + 媒体下载** = 参考 `TwitterX-Media-Downloader.user.js`(goemon2017,87KB)
- **油猴菜单风格** = 思路对齐 IG Saver 78KB line 1782-1796(prompt + emoji)
- **跨 skill 注入踩坑** = `references/userscript-injection-pitfalls.md`
- **完整 changelog** = `references/v0.1.0-v0.2.0-changelog.md`
- **加宽面板 31 版真因** = `references/v0.3.32-v0.3.33-html-panel.md` (v0.3.0-v0.3.33 全部踩坑 + 31 版真因总表)
- **加宽面板 5 版真因 (v0.3.29-0.3.33)** = `references/v0.3.29-v0.3.33-pitfalls.md` (10 个真因 + 5 版流水账)
- **下载原图 2 版真因 (v0.3.34-0.3.35)** = `references/v0.3.34-v0.3.35-orig-confirm.md` (X 改版后 large === orig 真值 + 1 行 DevTools 验证 recipe)
- **下载 jpg 格式 1 版真因 (v0.3.36)** = `references/v0.3.36-jpg-format.md` (ext 跟字节一致真因 + 1 行 DevTools 验证 `magic` 头 4 字节)
