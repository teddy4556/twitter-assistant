# Twitter 助手 (Twitter Assistant)

> Twitter/X 一键下载推文原图原视频 + 加宽布局面板。**当前 v0.3.38**, 2026-10-14。

## 1. 这是什么

油猴脚本 (Tampermonkey / ScriptCat / Greasemonkey), 装在 X.com (Twitter) 上, 提供两个核心功能:

| 功能 | 描述 | 实现 |
|---|---|---|
| **下载原图原视频** | 推文工具栏加 1 个下载按钮, 点一下下载推文所有图/视频到本地 | 走 GraphQL API + X 后端 `name=orig` 原生格式档 |
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

**A. 直接装本地文件** (推荐)

1. 下载 [`versions/twitter-assistant-v0.3.38.user.js`](versions/twitter-assistant-v0.3.38.user.js)
2. 油猴面板 → 实用工具 → 导入文件
3. 打开 https://x.com 验证

**B. Greasy Fork** (待发布)
- 链接: (TBD, 发布后填)

### 3.3 验证安装成功

打开 https://x.com, 浏览器 DevTools Console, 应该看到:
```
[tms v0.3.38 ✅ INSTALLED v0.3.38] loaded — Twitter Media Saver ready...
```

页面右下角 1.5 秒后出现 ⚙️ 悬浮按钮 = 装成功.

## 4. 功能详解

### 4.1 下载原图原视频

**操作**: 任意图片/视频推文, 工具栏点 🖼️ (图) / 🎬 (视频) 按钮.

**下载文件**:
- **图**: `media_url_https` 的**原生 format** + `name=orig` (X 最大尺寸档)
- **视频**: 取 `video_info.variants` 里 `bitrate` 最高的 mp4
- **文件名**: `{user-name}(@{user-id})_{date-time}_{status-id}_{file-type}.jpg` (默认模板, 可改)
- **存放**: 浏览器默认下载目录

> ⚠️ **关于图片格式 (v0.3.38 起)**
>
> X 的 `pbs.twimg.com` **不做服务端转码** —— URL 里的 `format=` 参数只认这张图的**原生格式**, 给别的值直接返回 404。
>
> 所以本脚本**保留原生 format, 只把 `name` 提到 `orig`**, 并按原生 format 推导文件扩展名 (`png → .png` / `jpg → .jpg` / `webp → .webp`)。
> 文件扩展名永远跟文件字节 4 位一致 (`ffd8ffe0` ↔ `.jpg`, `89504e47` ↔ `.png`), 双击一定能打开。
>
> 如果下载失败, 脚本会自动退回 X 原始链接重下一次。

**8 个占位符** (可改):
- `{user-name}` 用户昵称
- `{user-id}` 用户 screen_name
- `{status-id}` 推文 ID
- `{date-time}` UTC 时间 YYYYMMDD-hhmmss
- `{date-time-local}` 本地时区
- `{date-time:格式}` 自定义格式
- `{full-text}` 推文文本
- `{file-type}` photo / video / gif

**2 个油猴菜单**:
- 📝 设置命名模板 (多行 help)
- 🔄 重置模板

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

**应用** → 立即重写 CSS + 关闭面板

**跨刷新保留**: 本地存储, 下次打开 X.com 自动恢复

## 5. 性能指标 (v0.3.38 实测真值)

沙箱直接打 `pbs.twimg.com` 实测 (3 组 MEDIA_ID 完美反相关):

| 指标 | 真值 |
|---|---|
| `format` 参数语义 | **原生格式声明器**, 非转换器, 给非原值 = 404 |
| jpg 原生图 | `format=jpg&name=orig` → 200, 魔数 `ffd8ffe0` |
| png 原生图 | `format=png&name=orig` → 200, 魔数 `89504e47` |
| 跨格式请求 | 一律 404 |
| 文件名 ↔ 字节 | 扩展名由原生 format 推导, 4 位一致 |
| 下载失败兜底 | 自动退回 X 原始 URL 重试 1 次 |
| 加载时间 | 1.5 秒后 ⚙️ 按钮出现 |

复现命令见 [`references/v0.3.38-png-404-rootcause.md`](references/v0.3.38-png-404-rootcause.md)。

## 6. 已知限制

- 仅支持 X.com (Twitter.com), 不支持 mobile.twitter.com / 旧版界面
- 油猴跨平台 (Chrome/Edge/Firefox/Safari), 但 X 改版后某些浏览器 adblock 可能拦截 graphql API
- 4K 视频 (大视频) 浏览器会分段下载, 油猴 `GM_download` 一次只能下 1 段

## 7. 版本历史

| 版本 | 日期 | 改了什么 |
|---|---|---|
| **v0.3.38** | 2026-10-14 | **修 PNG 原生图 100% 下载失败** (X 不支持服务端转码, 写死 `format=jpg` 让所有 PNG 图 404) + 修 `GM_download` 兜底死代码 + 修纯 HLS 视频静默丢弃 + 修 metadata 指向虚构仓库 + 补 `icons/icon.svg` |
| v0.3.37 | 2026-10-13 | 油猴 metadata 清理 + Greasy Fork 上架准备 |
| v0.3.36 | 2026-10-13 | 加宽面板 + "强制 jpg 下载" (⚠️ 该思路已被 v0.3.38 推翻) |

完整历史见 `versions/` 目录与 `SKILL.md`。

## 8. 贡献

按 v0.3.X 命名铁律:
- filename = `<name>-<version>.<ext>`, semver `vMAJOR.MINOR.PATCH`
- 改 1 次 = `+0.0.1`
- 旧版保留 `versions/`, **不删**
- `@name` + `@version` + `console.log` 版本号同步 bump
- 任何**新功能 / 改下载 URL** 先实测真值, 不瞎改
  - ⚠️ 验证下载类改动时, 样本**必须覆盖多种格式** (jpg + png), 只测页面第一张图会被抽样偏差骗

## 9. License

MIT