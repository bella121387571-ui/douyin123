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
| `/douyin:profile` | 看自己主页:粉丝/获赞数据 + 作品表现分析(也可传他人主页链接) |
| `/douyin-likes` / `/douyin-collects` | 看我喜欢 / 收藏的视频 |
| `/douyin-comments` | 看我作品收到的评论(创作者中心) |
| `/douyin-watch 视频链接` | Claude「看」视频:自动截帧+读文案热评,总结视频内容 |

**语音转文字(可选):** 想让 Claude 连视频里说的话也"听"到,先装一次依赖:`winget install -e --id Gyan.FFmpeg`(重开终端后)运行 `powershell -ExecutionPolicy Bypass -File scripts\setup-whisper.ps1`(自动从国内镜像下载 whisper.cpp 和约 466MB 的模型)。之后对 Claude 说「连语音一起看」即可,识别全程在本机离线进行。 |
| `/douyin:post ./demo.mp4 "今天的日落 #风景"` | 上传视频并填好文案,**默认存草稿** |

也可以直接跟 Claude 说自然语言,比如:

> 「帮我看看现在抖音上什么在火」
> 「搜一下 ‘咖啡拉花’,告诉我点赞最高的三条是怎么拍的」
> 「把 ~/Videos/cat.mp4 发到抖音,文案你帮我想一个」

## 方式二:接入 Claude Desktop 桌面版(MCP)

不想用终端的话,可以把本插件作为 MCP 服务器接到 Claude Desktop(普通聊天窗口界面):

1. 安装 [Claude Desktop](https://claude.ai/download),克隆本仓库并 `npm install`。
2. 编辑配置文件(Windows 按 `Win+R` 输入 `%APPDATA%\Claude\claude_desktop_config.json`;Mac 在 `~/Library/Application Support/Claude/claude_desktop_config.json`),加入:

```json
{
  "mcpServers": {
    "douyin": {
      "command": "node",
      "args": ["C:\\Users\\你的用户名\\douyin123\\mcp\\server.mjs"]
    }
  }
}
```

3. 完全退出并重启 Claude Desktop,输入框下方出现工具图标即接入成功。
4. 直接聊天:「看看我的抖音主页」「刷会儿抖音总结下趋势」「把 XX 视频发抖音」。

MCP 工具列表:`douyin_login` / `douyin_feed` / `douyin_search` / `douyin_profile` / `douyin_post`(发布仍是默认存草稿、确认后才公开)。

## 进阶玩法:给 Claude 一个自己的抖音小号 🤖

让 Claude 拥有独立账号,每天定时上线:查你 @它 的视频并回评论、回你的私信、刷 10 条视频挑有意思的推荐给你。

1. **注册小号**:用一个新手机号注册抖音账号(建议养号几天再自动化,降低风控风险)。
2. **给小号登录**(独立登录态,不影响你的主账号):
   ```powershell
   $env:DOUYIN_PROFILE='claude'; node scripts/login.mjs
   ```
3. **填配置**:编辑 `daily/daily-prompt.md`,把「主人的抖音昵称」改成你的昵称。
4. **注册每日定时任务**(以每天 20:00 为例,管理员 PowerShell):
   ```powershell
   schtasks /create /tn "DouyinClaudeDaily" /sc daily /st 20:00 `
     /tr "powershell -ExecutionPolicy Bypass -File C:\Users\你的用户名\douyin123\daily\run-daily.ps1"
   ```
5. **互动方式**:发视频时 @小号,它当天会来回评论;直接私信小号,它会回复;每天它也会主动私信你分享刷到的内容。运行记录在 `.douyin-data/daily-log.md`。

⚠️ 注意:定时任务需要电脑在该时刻开着;新账号+自动化被抖音风控盯上的概率更高,脚本已把互动范围限制为「只跟你互动」并限量,请勿扩大;若小号被要求验证,手动跑一次对应脚本完成滑块即可。

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
