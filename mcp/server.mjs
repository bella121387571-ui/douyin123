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

function runScript(script, args = [], timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
      cwd: ROOT,
    });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
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
    title: '看视频内容',
    description:
      '「观看」一个抖音视频:打开视频页静音播放,按时间顺序截取画面帧,连同文案和热评一起返回(帧以图片形式返回,可直接查看理解视频内容)。配合 douyin_collections/douyin_likes/douyin_feed 拿到视频链接后使用,可回答"这个视频讲了什么"。约需 20-40 秒。',
    inputSchema: {
      url: z.string().url().describe('视频链接,如 https://www.douyin.com/video/xxxx'),
      frames: z.number().int().min(1).max(8).default(4).describe('截取的画面帧数,默认 4;视频信息量大时可加到 8'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ url, frames }) => {
    const r = await runScript('watch.mjs', ['--url', url, '--frames', String(frames)]);
    let info = null;
    try {
      info = JSON.parse(r.out.trim());
    } catch {
      /* 输出不是 JSON,走通用错误展示 */
    }
    if (!info || !Array.isArray(info.frames) || info.frames.length === 0) return toResult(r);
    const content = [
      {
        type: 'text',
        text:
          `视频文案/标题:${info.title || '(未取到)'}\n` +
          `链接:${info.url}\n` +
          (info.comments_preview ? `热评节选:\n${info.comments_preview}\n` : '') +
          `\n以下是按时间顺序截取的 ${info.frames.length} 帧画面:`,
      },
    ];
    for (const f of info.frames) {
      try {
        content.push({ type: 'image', data: fs.readFileSync(f).toString('base64'), mimeType: 'image/png' });
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
