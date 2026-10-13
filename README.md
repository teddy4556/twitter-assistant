# Twitter 助手 (Twitter Assistant)

> Twitter/X 一键下载推文原图原视频 + 加宽布局面板。**v0.3.36 = 36 版最终方案**, 2026-10-13 完结。

## 1. 这是什么

油猴脚本 (Tampermonkey / ScriptCat / Greasemonkey), 装在 X.com (Twitter) 上, 提供两个核心功能:

| 功能 | 描述 | 实现 |
|---|---|---|
| **下载原图原视频** | 推文工具栏加 1 个下载按钮, 点一下下载推文所有图/视频到本地 | 走 GraphQL API + X 后端 `:orig` 档 |
| **加宽布局** | 页面右下角 ⚙️ 悬浮按钮, 点开调时间轴/左栏/右栏宽度 | 文档级 CSS + `!important` |

## 2. 截图 / 演示

- 推文工具栏多 1 个下载按钮 (🖼️ / 🎬 图标)
- 页面右下角悬浮 ⚙️ 按钮
- 点 ⚙️ 弹设置面板: 时间轴 / 左栏 / 右栏 slider + 数字 input + +/- 10px 步进 + 中间填满 / 隐藏左栏 / 隐藏右栏 checkbox

## 3. 安装

### 3.1 先装油猴

任选一个:
- **Tampermonkey** (Chrome/Edge/Firefox) - https://www.tampermonkey.net/
- **ScriptCat** (Chrome/Edge) - https://scriptcat.org/
- **Violentmonkey** (Firefox) - https://violentmonkey.github.io/

### 3.2 装本脚本

3 种方式 (任选 1):

**A. 直接装本地文件** (推荐, 36 版最终版)
1. 下载 `versions/twitter-assistant-v0.3.36.user.js`
2. 油猴面板 → 实用工具 → 导入文件 → 选 `twitter-assistant-v0.3.36.user.js`
3. 完成, 打开 https://x.com 验证

**B. 用 @require 远程**
1. 油猴面板 → 新建脚本
2. 粘贴 `@require` 指向你部署的 `twitter-assistant-v0.3.36.user.js` URL
3. 保存

**C. 用 Greasy Fork** (待发布)
- 链接: (TBD, 发布后填)

### 3.3 验证安装成功

打开 https://x.com, 浏览器 DevTools Console, 应该看到:
```
[tms v0.3.36 ✅ INSTALLED v0.3.36] loaded — Twitter Media Saver ready...
```

页面右下角 1.5 秒后出现蓝色 ⚙️ 悬浮按钮 = 装成功.

## 4. 功能详解

### 4.1 下载原图原视频

**操作**: 任意图片/视频推文, 工具栏点 🖼️ (图) / 🎬 (视频) 按钮.

**下载文件**:
- **图**: `media_url_https + '?format=jpg&name=orig'` ← X 服务端最大档 + 强制 jpg 编码
- **视频**: 取 `video_info.variants` 里 `bitrate` 最高的 mp4
- **文件名**: `{user-name}(@{user-id})_{date-time}_{status-id}_{file-type}.jpg` (默认模板, 可改)
- **存放**: 浏览器默认下载目录

**8 个占位符** (可改):
- `{user-name}` 用户昵称
- `{user-id}` 用户 screen_name
- `{status-id}` 推文 ID
- `{date-time}` UTC 时间 YYYYMMDD-hhmmss
- `{date-time-local}` 本地时区
- `{date-time:格式}` 自定义格式
- `{full-text}` 推文文本
- `{file-type}` photo / video / gif

**3 个油猴菜单**:
- 📝 设置命名模板 (多行 help)
- 🔄 重置模板
- (不设任何加宽菜单, 见 §5 真因)

### 4.2 加宽布局

**操作**: 右下角 ⚙️ → 弹设置面板

**5 个加宽值 + 3 个开关**:
- 时间轴宽度 (500-1800px)
- 左栏宽度 (200-400px)
- 右栏宽度 (200-400px)
- 中间填满 (主栏 100%)
- 隐藏左栏
- 隐藏右栏

**3 种操作任选**:
- 拖动 slider
- 点数字 input 直接输入
- 点 +/- 步进 10px

**应用** → GM_setValue 6 个值 + 立即重写 CSS + 关闭面板

**跨刷新保留**: GM_setValue 存浏览器本地, 下次打开 X.com 自动恢复

## 5. 36 版踩坑沉淀 (永久铁律)

这一节是本项目最珍贵的部分, 31 版失败 (v0.3.6-v0.3.30) 总结出来的 **5 段永久铁律**, 改任何 X 油猴脚本都适用.

### 5.1 油猴 sandbox "invalid name" throw 铁律

**真因**: X 改版后, 油猴把 `GM_registerMenuCommand` 的 callback 包成 wrapper. wrapper 验证 callback 闭包引用的 page script 函数. X content.js 改 page script 函数引用后, 验证失败 → **100% throw "invalid name"** → 后续代码不跑 → CSS 写不进 head → 加宽无效.

**修法**:
- **0 个加宽油猴菜单**
- 改用 **自创 HTML 面板**: 悬浮按钮 ⚙️ + `document.createElement('div')` 注入
- 不经油猴 wrapper 验证, 0 throw

**v9.4 work 的真因** (不是 CSS 写得好): **v9.4 0 个菜单 + 0 引用 page script 函数**, 油猴 wrapper 不验证, 不 throw.

### 5.2 真因查询铁律

查 `<style>` 标签是不是 CSS 写进去了, 用 **`id^="tm-"`** 不用 `id^="tms-"` (v9.4 同款 ID, 永远能查到).

### 5.3 第一次失败立即让用户跑 1 行 DevTools

任何"加宽无效"问题, 装完立刻让用户跑:
```js
JSON.stringify({
  main: !!document.querySelector('main[role="main"]'),
  mainW: getComputedStyle(document.querySelector('main[role="main"]') || document.body).width,
  style: document.querySelectorAll('style[id^="tm-"]').length
})
```

30 秒拿真值, 不要瞎改 CSS.

### 5.4 "花里胡哨"全砍

5 件无用功 (姐姐 28 版都试过, 全失败):
- ❌ inline setProperty 双轨 (React mount 重置 inline)
- ❌ 持续 setTimeout 循环 (油猴 sandbox setTimeout 也 throw)
- ❌ unhandledrejection 探针 (加 throw 更复杂)
- ❌ IIFE 末尾 try-catch (throw 阻断后续代码, catch 救不了)
- ❌ 启动 1500ms 延迟 (解决时序不解决 throw)

**v9.4 已经 work, 你的 hack 全是噪声**.

### 5.5 抄 v9.4 必须 100% 完整 + 用同款 style ID

| 项 | 抄 v9.4 必须一致 |
|---|---|
| CSS 100% (所有 selector + 属性) | ✅ |
| style 标签 ID `tm-timeline-inner-lock` (不是 `tms-xxx`) | ✅ |
| buildLayoutCss 100% | ✅ |
| **不要加 v9.4 没有的任何"花里胡哨"** | ✅ |
| **加宽菜单数 = 0** (v9.4 0 个) | ✅ |

## 6. 版本历史 (36 版)

完整 36 版历史 + 每版踩坑, 见 `versions/` 目录 + `references/v0.3.*-pitfalls.md`.

| 版本 | 关键改造 | 状态 |
|---|---|---|
| v0.3.0-v0.3.5 | 加宽面板初版 | throw "invalid name" |
| v0.3.6-v0.3.30 | 25 版尝试修 throw | 全部失败 (真因不是 CSS 错) |
| **v0.3.31** | **砍 5 个加宽菜单 + 写死 1200px** | **解锁: 0 throw** |
| **v0.3.32** | **自创 HTML 面板 + ⚙️ 按钮** | 5 个加宽值可改 |
| v0.3.33 | slider + 数字 input + +/- 步进 | UI 完整 |
| v0.3.34 | orig URL 探针 | console 噪音 |
| v0.3.35 | 删探针 | console 干净 |
| **v0.3.36** | **改 URL 强制 jpg + 0 缩略图** | **下载 100% jpg + X 最大档** |

## 7. 数据准确性 (你 DevTools 真值已证)

- **v0.3.36 下载 URL = `?format=jpg&name=orig`**
- **content-type = `image/jpeg`**
- **字节头 4 位 = `ffd8ffe0` (JFIF JPEG 标准)**
- **大图字节 470 KB, 不是 67KB 缩略图**
- **X 改版后主页 0 张 `name=small` / `name=thumb`**

## 8. 已知限制

- 仅支持 X.com (Twitter.com), 不支持 mobile.twitter.com / 旧版界面
- 油猴跨平台 (Chrome/Edge/Firefox/Safari), 但 X 改版后某些浏览器 adblock 拦截 graphql API
- 4K 视频 (大视频) 浏览器会分段下载, 油猴 `GM_download` 一次只能下 1 段

## 9. 贡献

按 v0.3.X 命名铁律 (fact #515):
- filename = `<name>-<version>.<ext>`, semver `vMAJOR.MINOR.PATCH`
- 改 1 次 = `+0.0.1`
- 旧版保留 `versions/`, **不删**
- `@name` + `@version` + `console.log` 版本号同步 bump
- 任何**新功能**先跑 1 行 DevTools 验证真值, 不瞎改

## 10. License

MIT
