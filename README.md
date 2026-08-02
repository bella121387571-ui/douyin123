# 抖音 Claude Code 插件 🎬

让 Claude 帮你**刷抖音**(看推荐流、搜视频、总结趋势)和**发抖音**(上传视频、写文案、存草稿/发布)的 Claude Code 插件。

底层原理:用 [Playwright](https://playwright.dev/) 驱动一个真实浏览器,登录你自己的抖音账号,操作抖音网页版(douyin.com)和创作者中心(creator.douyin.com)。**没有用任何私有 API,登录态只保存在你本机。**

## 安装

```bash
# 1. 在 Claude Code 里添加本仓库为插件市场并安装
/plugin marketplace add bella121387571-ui/douyin123
/plugin install douyin

# 2. 安装依赖(插件目录下)
npm install
npx playwright install chromium
```

## 使用

| 命令 | 作用 |
| --- | --- |
| `/douyin:login` | 首次使用:弹出浏览器窗口,用抖音 App 扫码登录 |
| `/douyin:feed 15` | 刷 15 条推荐流,Claude 汇总成清单 + 趋势点评 |
| `/douyin:search 美食探店 20` | 搜索关键词,按点赞排序并分析哪类内容数据好 |
| `/douyin:post ./demo.mp4 "今天的日落 #风景"` | 上传视频并填好文案,**默认存草稿** |

也可以直接跟 Claude 说自然语言,比如:

> 「帮我看看现在抖音上什么在火」
> 「搜一下 ‘咖啡拉花’,告诉我点赞最高的三条是怎么拍的」
> 「把 ~/Videos/cat.mp4 发到抖音,文案你帮我想一个」

## 安全设计

- **发布需二次确认**:`post` 默认只上传 + 填文案 + 存草稿,只有你明确确认后 Claude 才会加 `--publish` 真正发布。
- 登录态保存在 `~/.douyin-claude-plugin/user-data`,不会离开你的电脑;不想用了删掉该目录即可退出登录。
- 脚本抓取的数据仅供你个人浏览和选题参考。

## 注意事项

- 需要本机有图形界面完成首次扫码登录(登录后 feed/search 可无头运行)。
- 抖音网页版会不定期改版,页面选择器可能失效——脚本挂了可以加 `--headful` 观察页面,让 Claude 帮你修 `scripts/` 里的选择器。
- 请遵守抖音的用户协议,控制操作频率,仅用于你自己的账号;不要用于批量注册、刷量、爬库等行为。

## 目录结构

```
.claude-plugin/plugin.json   插件清单
commands/                    /douyin:* 斜杠命令
skills/douyin/SKILL.md       让 Claude 自动会用的技能说明
scripts/
  lib.mjs                    浏览器启动 / 登录态 / 数据整理公共库
  login.mjs                  扫码登录
  feed.mjs                   推荐流抓取(监听 aweme 接口响应)
  search.mjs                 关键词搜索
  post.mjs                   上传视频 + 填文案 + 存草稿/发布
```
