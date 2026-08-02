// 查看互动消息里「@我」的提醒(需登录)
// 用法: node scripts/mentions.mjs [--count 20] [--profile claude] [--headless]
import fs from 'node:fs';
import path from 'node:path';
import { launch, isLoggedIn, requireLoginHint, getArg, hasFlag } from './lib.mjs';

const COUNT = parseInt(getArg('count', '20'), 10);

const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

if (!(await isLoggedIn(context))) requireLoginHint();

const rawCaptures = [];
const mentions = [];

// 在通知接口的 JSON 里递归找「像通知」的条目:带昵称 + 内容/视频信息
function extractNotices(node) {
  if (Array.isArray(node)) {
    for (const it of node) {
      if (it && typeof it === 'object') {
        const user =
          it.user || it.from_user || it.user_info || (typeof it.nickname === 'string' ? it : null);
        const aweme = it.aweme || it.item || null;
        const content = it.content || it.comment?.text || it.title || aweme?.desc || '';
        if (user && (aweme || content)) {
          mentions.push({
            from: user.nickname || '',
            content: String(content).trim().slice(0, 200),
            video_url: aweme?.aweme_id ? `https://www.douyin.com/video/${aweme.aweme_id}` : null,
            video_desc: (aweme?.desc || '').trim() || null,
            time: it.create_time
              ? new Date(it.create_time * 1000).toISOString().replace('T', ' ').slice(0, 16)
              : null,
            id: String(it.nid || it.notice_id || `${user.nickname}-${it.create_time || ''}`),
          });
          continue;
        }
        extractNotices(it);
      }
    }
    return;
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) extractNotices(v);
  }
}

page.on('response', async (res) => {
  const u = res.url();
  if (!/douyin\.com/.test(u) || !/notice|noticev2|message\/list/i.test(u)) return;
  try {
    const data = await res.json();
    rawCaptures.push({ url: u.split('?')[0], data });
    extractNotices(data);
  } catch {
    /* 忽略非 JSON */
  }
});

await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

// 打开「消息」通知面板,尽量切到「@我」分类
const noticeEntry = page.getByText('消息', { exact: true }).first();
if (await noticeEntry.count()) {
  await noticeEntry.click();
  await page.waitForTimeout(4000);
  const atTab = page.getByText(/^@我$|^@$/).first();
  if (await atTab.count()) {
    await atTab.click();
    await page.waitForTimeout(4000);
  }
}

// 去重
const seen = new Set();
const list = mentions
  .filter((m) => {
    if (seen.has(m.id) || (!m.from && !m.content)) return false;
    seen.add(m.id);
    return true;
  })
  .slice(0, COUNT);

if (list.length === 0) {
  const dumpDir = path.join(process.cwd(), '.douyin-data');
  fs.mkdirSync(dumpDir, { recursive: true });
  const dumpFile = path.join(dumpDir, 'mentions-raw.json');
  fs.writeFileSync(dumpFile, JSON.stringify(rawCaptures, null, 2));
  console.error('⚠️ 没有解析到 @提醒。可能确实没有新提醒,或接口结构有变。');
  console.error(`   原始响应已存到 ${dumpFile},可交给 Claude 分析修复。`);
}
console.log(JSON.stringify({ count: list.length, mentions: list }, null, 2));
await context.close();
