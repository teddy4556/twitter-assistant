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

**2 个油猴菜单**：
- 📝 设置命名模板 (多行 help)
- 🔄 重置模板

### 4.2 加宽布局

**操作**: 右下角 ⚙️ → 弹设置面板

**5 个加宽值 + 3 个开关**：
- 时间轴宽度 (500-1800px)
- 左栏宽度 (200-400px)
- 右栏宽度 (200-400px)
- 中间填满 (主栏 100%)
- 隐藏左栏
- 隐藏右栏

**3 种操作任选**：
- 拖动 slider
- 点数字 input 直接输入
- 点 +/- 步进 10px

**应用** → 立即重写 CSS + 关闭面板

**跨刷新保留**：本地存储，下次打开 X.com 自动恢复

## 5. 性能指标 (v0.3.36 实测真值)

| 指标 | 真值 |
|---|---|
| content-type | `image/jpeg` |
| 文件头魔数 | `ffd8ffe0` (JFIF JPEG 标准) |
| 字节数 | 470 KB (大图) |
| 主页缩略图 | 0 张 (`name=thumb` / `name=small` 都没出现) |
| 加载时间 | 1.5 秒后 ⚙️ 按钮出现 |
| 下载 = X 最大尺寸 | ✓ (`name=orig` 档) |

## 6. 已知限制

- 仅支持 X.com (Twitter.com)，不支持 mobile.twitter.com / 旧版界面
- 油猴跨平台 (Chrome/Edge/Firefox/Safari)，但 X 改版后某些浏览器 adblock 拦截 graphql API
- 4K 视频 (大视频) 浏览器会分段下载，油猴 `GM_download` 一次只能下 1 段

## 7. 贡献

按 v0.3.X 命名铁律：
- filename = `<name>-<version>.<ext>`，semver `vMAJOR.MINOR.PATCH`
- 改 1 次 = `+0.0.1`
- 旧版保留 `versions/`，**不删**
- `@name` + `@version` + `console.log` 版本号同步 bump
- 任何**新功能**先跑 1 行 DevTools 验证真值，不瞎改

## 8. License

MIT
