// 抖音 MCP 服务器(stdio):把 scripts/ 下的 Playwright 脚本包装成 MCP 工具,
// 供 Claude Desktop 等 MCP 客户端调用。纯本地运行,登录态保存在本机。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runScript(script, args = [], timeoutMs = 3 * 60 * 1000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
      cwd: ROOT,
    });
    // 超时要杀掉整个进程树(含脚本拉起的浏览器),否则残留浏览器会锁住
    // 登录态目录,导致后续所有调用一直挂起
    const killTree = () => {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        /* 忽略 */
      }
    };
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? -1 : code, out, err, timedOut });
    });
  });
}

function toResult({ code, out, err, timedOut }) {
  const parts = [];
  if (out.trim()) parts.push(out.trim());
  if (err.trim()) parts.push(`[脚本提示]\n${err.trim()}`);
  if (timedOut) parts.push('[错误] 脚本执行超时,已终止。浏览器窗口里可能弹了滑块验证,请让用户完成验证后重试。');
  return {
    content: [{ type: 'text', text: parts.join('\n\n') || `脚本退出,退出码 ${code},无输出` }],
    isError: code !== 0,
  };
}

const server = new McpServer({ name: 'douyin', version: '0.2.0' });

server.registerTool(
  'douyin_login',
  {
    title: '登录抖音',
    description:
      '打开浏览器窗口让用户用抖音 App 扫码登录,登录态持久化保存在本机。首次使用或提示未登录时调用。调用前告知用户:会弹出浏览器窗口,请扫码,最多等 5 分钟。',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async () => toResult(await runScript('login.mjs', [], 6 * 60 * 1000))
);

server.registerTool(
  'douyin_feed',
  {
    title: '刷抖音推荐流',
    description:
      '打开抖音网页版推荐流并抓取视频列表,返回 JSON(作者、文案、点赞/评论/分享数、链接)。会弹出浏览器窗口自动刷,约 30-60 秒。拿到结果后应整理成易读清单并总结内容趋势,不要原样贴 JSON。',
    inputSchema: {
      count: z.number().int().min(1).max(50).default(10).describe('想抓取的视频条数,默认 10'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ count }) => toResult(await runScript('feed.mjs', ['--count', String(count)]))
);

server.registerTool(
  'douyin_search',
  {
    title: '搜索抖音视频',
    description:
      '按关键词搜索抖音视频,返回 JSON 结果列表。适合做选题调研:按点赞排序分析哪类内容数据好。会弹出浏览器窗口,约 30-60 秒。',
    inputSchema: {
      keyword: z.string().min(1).describe('搜索关键词,如 "美食探店"'),
      count: z.number().int().min(1).max(50).default(10).describe('想要的结果条数,默认 10'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ keyword, count }) =>
    toResult(await runScript('search.mjs', ['--keyword', keyword, '--count', String(count)]))
);

server.registerTool(
  'douyin_profile',
  {
    title: '查看抖音主页',
    description:
      '查看抖音主页数据:账号资料(昵称、粉丝、获赞、作品数)+ 已发布作品列表及各项数据。不传 url 看用户自己的主页(需已登录),传 url 看他人主页。适合账号分析和对标研究。',
    inputSchema: {
      url: z.string().url().optional().describe('他人主页链接,如 https://www.douyin.com/user/xxx;省略则看自己的主页'),
      count: z.number().int().min(1).max(100).default(20).describe('最多拉取的作品条数,默认 20'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ url, count }) => {
    const args = ['--count', String(count)];
    if (url) args.push('--url', url);
    return toResult(await runScript('profile.mjs', args));
  }
);

server.registerTool(
  'douyin_likes',
  {
    title: '看我喜欢的视频',
    description:
      '抓取用户自己主页「喜欢」列表里的视频,返回 JSON(作者、文案、点赞数、链接)。需已登录。适合分析用户的兴趣偏好或找回看过的视频。',
    inputSchema: {
      count: z.number().int().min(1).max(100).default(20).describe('最多抓取的条数,默认 20'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ count }) => toResult(await runScript('my.mjs', ['--type', 'likes', '--count', String(count)]))
);

server.registerTool(
  'douyin_collections',
  {
    title: '看我收藏的视频',
    description:
      '抓取用户自己主页「收藏」列表里的视频,返回 JSON(作者、文案、点赞数、链接)。需已登录。',
    inputSchema: {
      count: z.number().int().min(1).max(100).default(20).describe('最多抓取的条数,默认 20'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ count }) => toResult(await runScript('my.mjs', ['--type', 'collects', '--count', String(count)]))
);

server.registerTool(
  'douyin_comments',
  {
    title: '看我作品收到的评论',
    description:
      '从创作者中心抓取别人对用户作品的评论(评论内容、评论者、点赞数、对应作品)。需已登录。注意:抖音网页版没有「我发出的评论」入口,此工具看的是收到的评论;若用户想看自己发出的评论,请说明该限制。',
    inputSchema: {
      count: z.number().int().min(1).max(100).default(30).describe('最多抓取的条数,默认 30'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ count }) => toResult(await runScript('comments.mjs', ['--count', String(count)]))
);

server.registerTool(
  'douyin_watch',
  {
    title: '看作品内容',
    description:
      '「观看」一个抖音作品,视频帖和图文帖都支持:视频帖按时间顺序截取画面帧,图文帖取回每张原图,连同文案和热评一起返回(图片可直接查看)。配合 douyin_collections/douyin_likes/douyin_feed 拿到链接后使用,可回答"这个作品讲了什么"。约需 20-40 秒。',
    inputSchema: {
      url: z
        .string()
        .url()
        .describe('作品链接,视频帖 https://www.douyin.com/video/xxxx 或图文帖 https://www.douyin.com/note/xxxx'),
      frames: z.number().int().min(1).max(16).default(8).describe('视频帖截取的画面帧数,默认 8(在全片时长上均匀分布);长视频或信息量大时可加到 16。图文帖会取回全部图片,不受此值限制'),
      transcribe: z
        .boolean()
        .default(false)
        .describe('是否把语音转成文字(需本机装好 ffmpeg 和 whisper,见 scripts/setup-whisper.ps1)。口播/剧情类视频建议开启;用户说"连语音一起看"时设为 true。图文帖没有视频音轨,会转写背景音乐'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ url, frames, transcribe }) => {
    // 客户端等待上限约 4 分钟,这里必须更早返回
    const args = ['--url', url, '--frames', String(frames)];
    if (transcribe) args.push('--transcribe');
    const r = await runScript('watch.mjs', args, 200 * 1000);
    let info = null;
    try {
      info = JSON.parse(r.out.trim());
    } catch {
      /* 输出不是 JSON,走通用错误展示 */
    }
    if (!info || !Array.isArray(info.frames) || info.frames.length === 0) {
      // 抓不到画面时,把现场快照回传,便于直接看出是滑块验证还是页面改版
      if (info?.debug_screenshot && fs.existsSync(info.debug_screenshot)) {
        return {
          content: [
            {
              type: 'text',
              text:
                '没能取到作品画面。下面是当时的页面快照——如果看到滑块/验证码,请让用户在弹出的浏览器窗口里手动完成验证后重试;' +
                '如果是登录过期,请让用户运行 douyin_login。',
            },
            {
              type: 'image',
              data: fs.readFileSync(info.debug_screenshot).toString('base64'),
              mimeType: 'image/png',
            },
          ],
          isError: true,
        };
      }
      return toResult(r);
    }
    const content = [
      {
        type: 'text',
        text:
          `链接:${info.url}\n\n` +
          `【作者文案】(这是作者配的文字,不是画面内容):\n${info.title || '(未取到)'}\n\n` +
          (info.comments_preview
            ? `【观众热评】(这是评论区的话,也不是画面内容):\n${info.comments_preview}\n\n`
            : '') +
          (info.transcript
            ? `【语音转文字】(来源:${info.transcript_source || '音轨'};若不是中文,请在汇报时附上中文翻译):\n${info.transcript}\n\n`
            : '') +
          (info.transcript_error ? `【语音转文字失败】${info.transcript_error}\n\n` : '') +
          (info.media_type === 'images'
            ? `【图文内容】这是一个图文帖(不是视频),以下 ${info.frames.length} 张是帖子里的原图,按发布顺序排列。` +
              `描述内容时只能依据这些图片;文案和热评仅作背景参考:`
            : `【视频画面】以下 ${info.frames.length} 张图片是从视频里按时间顺序截取的真实画面帧(文件名含对应秒数)。` +
              `描述"视频里演了什么/画面是什么"时,只能依据这些图片;文案和热评仅作背景参考,不要当成画面内容:`),
      },
    ];
    for (const f of info.frames) {
      try {
        content.push({
          type: 'image',
          data: fs.readFileSync(f).toString('base64'),
          mimeType: f.endsWith('.png') ? 'image/png' : 'image/jpeg',
        });
      } catch {
        /* 单帧读取失败就跳过 */
      }
    }
    return { content };
  }
);

server.registerTool(
  'douyin_post',
  {
    title: '发抖音视频',
    description:
      '上传视频到抖音创作者中心并填写标题文案。publish=false(默认)只存草稿,是安全操作;publish=true 会把视频公开发布到用户的抖音账号,属于不可撤回的对外操作——只有在用户看过文案并明确确认发布后才允许设为 true。标题上限 30 字,可含 1-3 个 #话题。上传可能需要几分钟。',
    inputSchema: {
      video: z.string().min(1).describe('本机视频文件的绝对路径,如 C:\\Users\\me\\Videos\\a.mp4'),
      title: z.string().max(60).describe('标题文案(≤30字,可带 #话题)'),
      publish: z
        .boolean()
        .default(false)
        .describe('false=只存草稿(默认、安全);true=直接公开发布,必须先获得用户明确确认'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ video, title, publish }) => {
    if (!fs.existsSync(video)) {
      return {
        content: [{ type: 'text', text: `视频文件不存在: ${video}\n请让用户确认路径(需要绝对路径)。` }],
        isError: true,
      };
    }
    const args = ['--video', video, '--title', title];
    if (publish) args.push('--publish');
    return toResult(await runScript('post.mjs', args, 15 * 60 * 1000));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('douyin MCP server 已启动 (stdio)');
