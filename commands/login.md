---
description: 扫码登录抖音,保存登录态(首次使用必须先执行)
allowed-tools: Bash
---

在插件目录下执行登录脚本(需要有图形界面的环境,会弹出浏览器窗口让用户扫码):

```
cd ${CLAUDE_PLUGIN_ROOT} && npm install --silent && node scripts/login.mjs
```

运行前提醒用户:会打开一个浏览器窗口,请用抖音 App 扫码登录;登录态保存在本机 `~/.douyin-claude-plugin/`,不会上传到任何地方。脚本结束后把登录结果告诉用户。
