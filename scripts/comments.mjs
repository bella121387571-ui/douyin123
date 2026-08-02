// 看别人对我作品的评论(创作者中心-评论管理,需登录)
// 注:抖音网页版没有「我发出的评论」入口,只能看收到的评论
// 用法: node scripts/comments.mjs [--count 30] [--headless]
import fs from 'node:fs';
import path from 'node:path';
import { launch, isLoggedIn, requireLoginHint, getArg, hasFlag } from './lib.mjs';

const COUNT = parseInt(getArg('count', '30'), 10);

const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

if (!(await isLoggedIn(context))) requireLoginHint();

const comments = [];
const rawCaptures = []; // 解析失败时把原始响应存下来方便修

// 在任意 JSON 里递归找「像评论列表」的数组:元素带评论文本和用户昵称
function extractComments(node, out) {
  if (Array.isArray(node)) {
    const looksLikeComments = node.filter(
      (it) =>
        it &&
        typeof it === 'object' &&
        typeof (it.text ?? it.content ?? it.comment_text) === 'string' &&
        (it.user || it.nickname || it.user_info)
    );
    if (looksLikeComments.length > 0) {
      for (const it of looksLikeComments) {
        const user = it.user || it.user_info || {};
        out.push({
          text: (it.text ?? it.content ?? it.comment_text ?? '').trim(),
          from: it.nickname || user.nickname || user.name || '',
          likes: it.digg_count ?? it.like_count ?? null,
          time: it.create_time
            ? new Date(it.create_time * 1000).toISOString().replace('T', ' ').slice(0, 16)
            : null,
          video: it.item_title || it.aweme?.desc || it.item?.desc || null,
          reply_count: it.reply_comment_total ?? it.reply_count ?? null,
        });
      }
      return;
    }
    for (const it of node) extractComments(it, out);
    return;
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) extractComments(v, out);
  }
}

page.on('response', async (res) => {
  const u = res.url();
  if (!/creator\.douyin\.com/.test(u) || !/comment/i.test(u)) return;
  try {
    const data = await res.json();
    rawCaptures.push({ url: u.split('?')[0], data });
    extractComments(data, comments);
  } catch {
    /* 忽略非 JSON */
  }
});

await page.goto('https://creator.douyin.com/creator-micro/interact/comment', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(10000);

// 滚动评论列表加载更多
for (let i = 0; i < 8 && comments.length < COUNT; i++) {
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(2000);
}

// 去重
const seen = new Set();
const list = comments
  .filter((c) => {
    const key = c.from + '|' + c.text + '|' + c.time;
    if (seen.has(key) || !c.text) return false;
    seen.add(key);
    return true;
  })
  .slice(0, COUNT);

if (list.length === 0) {
  const dumpDir = path.join(process.cwd(), '.douyin-data');
  fs.mkdirSync(dumpDir, { recursive: true });
  const dumpFile = path.join(dumpDir, 'comments-raw.json');
  fs.writeFileSync(dumpFile, JSON.stringify(rawCaptures, null, 2));
  console.error('⚠️ 没有解析到评论。可能是没有新评论,或创作者中心接口结构有变。');
  console.error(`   已把抓到的原始响应存到 ${dumpFile},可以把它交给 Claude 分析并修复解析逻辑。`);
}
console.log(JSON.stringify({ count: list.length, comments: list }, null, 2));
await context.close();
