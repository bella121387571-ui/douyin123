---
description: 刷抖音推荐流,汇总当前热门/推荐视频
allowed-tools: Bash
argument-hint: "[数量,默认 10]"
---

执行推荐流脚本抓取视频列表(参数 $1 是想要的条数,默认 10):

```
cd ${CLAUDE_PLUGIN_ROOT} && node scripts/feed.mjs --count ${1:-10}
```

拿到 JSON 输出后,不要原样贴 JSON,而是整理成易读的清单:每条包含作者、文案(截断到一行)、点赞/评论数和链接,并在最后用一两句话总结这波推荐里的内容趋势(什么题材多、什么在火)。

如果脚本报未登录或空结果,提示用户先运行 `/douyin:login`。
