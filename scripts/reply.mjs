// 在指定视频下发评论(需登录)。用于回复 @提醒等场景
// 用法: node scripts/reply.mjs --url "https://www.douyin.com/video/xxx" --text "评论内容" [--profile claude]
import { launch, isLoggedIn, requireLoginHint, getArg, hasFlag } from './lib.mjs';

const url = getArg('url');
const text = getArg('text');
if (!url || !text) {
  console.error('用法: node scripts/reply.mjs --url "视频链接" --text "评论内容"');
  process.exit(2);
}

const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

if (!(await isLoggedIn(context))) requireLoginHint();

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// 找评论输入框:优先 data-e2e 标记,退化到可编辑区域
const candidates = [
  '[data-e2e="comment-input"] [contenteditable="true"]',
  '[data-e2e="comment-input"]',
  'div[contenteditable="true"]',
  'textarea[placeholder*="评论"]',
];
let box = null;
for (const sel of candidates) {
  const loc = page.locator(sel).first();
  if (await loc.count()) {
    box = loc;
    break;
  }
}
if (!box) {
  console.error('没找到评论输入框,页面可能改版了。加 --headful 观察后修本脚本。');
  await context.close();
  process.exit(1);
}

await box.click();
await page.waitForTimeout(500);
await page.keyboard.type(text, { delay: 50 });
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);

console.log(JSON.stringify({ ok: true, url, text, note: '评论已提交(以页面实际显示为准)' }, null, 2));
await context.close();
