// 发抖音:上传视频到创作者中心,填好标题/文案。默认只填不发,加 --publish 才真正点“发布”
// 用法: node scripts/post.mjs --video /path/to/video.mp4 --title "标题文案 #话题" [--publish] [--headful]
import fs from 'node:fs';
import { launch, isLoggedIn, requireLoginHint, getArg, hasFlag } from './lib.mjs';

const videoPath = getArg('video');
const title = getArg('title', '');
const publish = hasFlag('publish');

if (!videoPath || !fs.existsSync(videoPath)) {
  console.error('用法: node scripts/post.mjs --video /path/to/video.mp4 --title "文案" [--publish]');
  console.error('视频文件不存在: ' + videoPath);
  process.exit(2);
}

const context = await launch({ headless: !hasFlag('headful') });
const page = context.pages()[0] || (await context.newPage());

if (!(await isLoggedIn(context))) requireLoginHint();

console.log('打开创作者中心上传页……');
await page.goto('https://creator.douyin.com/creator-micro/content/upload', {
  waitUntil: 'domcontentloaded',
});

// 上传视频文件
const fileInput = page.locator('input[type="file"]').first();
await fileInput.waitFor({ state: 'attached', timeout: 30000 });
await fileInput.setInputFiles(videoPath);
console.log('视频已提交上传,等待进入编辑页……');

// 上传后会跳到发布编辑页,出现标题输入框
const titleInput = page
  .locator('input[placeholder*="标题"], input[placeholder*="填写作品标题"]')
  .first();
await titleInput.waitFor({ state: 'visible', timeout: 120000 });

if (title) {
  await titleInput.fill(title.slice(0, 30)); // 标题上限 30 字
  // 正文/话题写在下方富文本区(如果有)
  const editor = page.locator('.zone-container, [data-placeholder*="简介"], .editor-kit-container [contenteditable="true"]').first();
  if (await editor.count()) {
    await editor.click();
    await page.keyboard.type(title);
  }
  console.log('标题/文案已填写。');
}

// 等待视频上传完成:发布按钮从禁用变为可点,或出现“重新上传”字样
console.log('等待视频上传完成……');
const publishBtn = page.getByRole('button', { name: /^发布$/ }).first();
const deadline = Date.now() + 10 * 60 * 1000;
let uploaded = false;
while (Date.now() < deadline) {
  const reupload = await page.getByText('重新上传').count();
  const enabled = (await publishBtn.count()) && (await publishBtn.isEnabled().catch(() => false));
  if (reupload || enabled) {
    uploaded = true;
    break;
  }
  await page.waitForTimeout(3000);
}
if (!uploaded) {
  console.error('等待上传完成超时(10 分钟)。');
  await context.close();
  process.exit(1);
}
console.log('视频上传完成。');

if (publish) {
  await publishBtn.click();
  // 发布成功后会跳转到作品管理页
  await page
    .waitForURL(/content\/manage/, { timeout: 60000 })
    .then(() => console.log('✅ 发布成功!'))
    .catch(async () => {
      console.error('已点击发布,但未确认跳转,请到创作者中心检查作品状态。');
    });
} else {
  // 默认存草稿,留给用户在 App/网页里确认后再发,避免误发
  const draftBtn = page.getByRole('button', { name: /存草稿|保存草稿/ }).first();
  if (await draftBtn.count()) {
    await draftBtn.click();
    await page.waitForTimeout(3000);
    console.log('✅ 已保存为草稿(默认不直接发布)。确认无误后加 --publish 再运行,或在抖音里手动发布。');
  } else {
    console.log('未找到“存草稿”按钮。内容已填好但未发布;加 --publish 重新运行可直接发布。');
  }
}

await context.close();
