---
description: 按关键词搜索抖音视频
allowed-tools: Bash
argument-hint: "<关键词> [数量]"
---

用用户给的关键词执行搜索脚本($1 为关键词,$2 为条数,默认 10):

```
cd ${CLAUDE_PLUGIN_ROOT} && node scripts/search.mjs --keyword "$1" --count ${2:-10}
```

把 JSON 结果整理成易读清单(作者、文案、点赞数、链接),按点赞数从高到低排列,并简单点评一下这个关键词下什么样的内容数据最好——如果用户是想做同类内容,这个信息对选题有用。
