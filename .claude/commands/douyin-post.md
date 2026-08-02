---
description: 发抖音(默认存草稿,确认后才发布)
allowed-tools: Bash, Read, Glob
argument-hint: "<视频路径> [文案]"
---

1. 确认视频文件 $1 存在;没给文案就帮用户写一个(标题≤30字,1-3 个 #话题)。
2. 先存草稿:`node scripts/post.mjs --video "$1" --title "文案"`,把文案展示给用户。
3. 用户明确确认后才加 `--publish` 重跑真正发布。未经确认绝不带 `--publish`。
