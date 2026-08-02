---
description: 发抖音(上传视频 + 填文案,默认存草稿,确认后才发布)
allowed-tools: Bash, Read, Glob
argument-hint: "<视频路径> [文案]"
---

帮用户把视频发到抖音。流程:

1. 确认视频文件存在($1 是路径)。如果用户没给文案($2),根据文件名和用户上下文帮用户起一个吸引人的标题文案(30 字以内,可带 1-3 个 #话题)。
2. **先存草稿,不直接发布**(安全默认):

```
cd ${CLAUDE_PLUGIN_ROOT} && node scripts/post.mjs --video "$1" --title "$2"
```

3. 告诉用户草稿已保存,把最终使用的文案展示给用户。
4. 只有当用户明确说“直接发布”或确认草稿后要求发布时,才加 `--publish` 重新运行:

```
cd ${CLAUDE_PLUGIN_ROOT} && node scripts/post.mjs --video "$1" --title "$2" --publish
```

发布是对外公开的操作,未经用户明确确认绝不要带 `--publish` 执行。
