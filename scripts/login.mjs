// 打开有头浏览器,等待用户扫码登录抖音,登录态会持久化保存
import { launch, isLoggedIn } from './lib.mjs';

const TIMEOUT_MS = 5 * 60 * 1000; // 最多等 5 分钟

const context = await launch({ headless: false });
const page = context.pages()[0] || (await context.newPage());
await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded' });

if (await isLoggedIn(context)) {
  console.log('已经是登录状态,无需重复登录。');
  await context.close();
  process.exit(0);
}

console.log('浏览器已打开。请在页面上点击「登录」,用抖音 App 扫码完成登录……');

const start = Date.now();
let ok = false;
while (Date.now() - start < TIMEOUT_MS) {
  await page.waitForTimeout(3000);
  if (await isLoggedIn(context)) {
    ok = true;
    break;
  }
}

if (ok) {
  console.log('登录成功!登录态已保存,后续 feed / search / post 都可以直接用了。');
} else {
  console.error('等待超时,未检测到登录。请重新运行 login。');
}
await context.close();
process.exit(ok ? 0 : 1);
