// 端到端测试：用本机 Chrome 以 iPhone 尺寸走一遍完整业务流程，并截图到 e2e/shots/。
// 用法：npm run e2e（默认测 http://localhost:8080/，需先 npm start）
//       BASE_URL=https://loroa123.github.io/horse-timer/ npm run e2e   测线上
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const URL = process.env.BASE_URL || 'http://localhost:8080/';
const OUT = new globalThis.URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

const text = (sel) => page.$eval(sel, (el) => el.innerText);
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await shot('1-empty');

// 新开单：3 匹 ¥100，再把 3 号改成 ¥150，预付 3 小时
await page.click('[data-tab="new"]');
await page.type('#f-note', '张三一行');
await page.$eval('#f-hours', (el) => (el.value = ''));
await page.type('#f-hours', '3');
await page.$eval('#q-count', (el) => (el.value = ''));
await page.type('#q-count', '3');
await page.type('#q-price', '100');
await page.click('#q-add');
const p3 = (await page.$$('.h-price'))[2];
await p3.click({ clickCount: 3 });
await p3.type('150');
assert.match(await text('#new-summary'), /¥350\.00\/时/);
assert.match(await text('#new-summary'), /¥1,050\.00/);
assert.equal(await text('#new-submit'), '收款 ¥1,050.00 并开始计时');
await shot('2-new');

// 重复编号校验
const n2 = (await page.$$('.h-no'))[1];
await n2.click({ clickCount: 3 });
await n2.type('1');
assert.match(await text('#new-summary'), /编号 1 重复/);
await n2.click({ clickCount: 3 });
await n2.type('2');

await page.click('#new-submit');
await page.waitForSelector('#active-list .card');
assert.equal(await text('#active-badge'), '1'); assert.equal(await page.$eval('#active-badge', el => getComputedStyle(el).display), 'inline-block');
assert.match(await text('.card .horses'), /1号 ¥100、2号 ¥100、3号 ¥150/);
await shot('3-timer');

// 把开始时间拨回 2小时47分20秒 前 → 167 分钟，应退 ¥75.83
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('horse-timer'));
  s.rentals[0].start = Date.now() - (167 * 60 + 20) * 1000;
  localStorage.setItem('horse-timer', JSON.stringify(s));
});
await page.reload({ waitUntil: 'networkidle0' });
assert.match(await text('.card .status'), /剩余 13分/);
await page.click('[data-act="end"]');
assert.match(await text('#modal-body'), /共 2小时47分/);
assert.match(await text('#modal-body'), /应收\s*¥974\.17/);
assert.match(await text('.result'), /应退还客人\s*¥75\.83/);
await shot('4-settle');
await page.click('#modal-ok');
await page.waitForSelector('#active-list .empty');

// 第二单：超时，需补收
await page.click('[data-tab="new"]');
assert.equal(await page.$eval('#f-hours', (el) => el.value), '3'); // 记住上次
await page.$eval('#f-hours', (el) => (el.value = ''));
await page.type('#f-hours', '1');
await page.click('#q-add');
await page.click('#new-submit');
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('horse-timer'));
  s.rentals.find((r) => r.status === 'active').start = Date.now() - 75 * 60 * 1000;
  localStorage.setItem('horse-timer', JSON.stringify(s));
});
await page.reload({ waitUntil: 'networkidle0' });
assert.ok(await page.$('.card.over'));
assert.match(await text('.card .status'), /已超时 15分/);
await shot('5-overtime');
await page.click('[data-act="end"]');
assert.match(await text('.result'), /需向客人补收\s*¥37\.50/); // ¥150/时 × 75分 = 187.5，预付 150
await page.click('#modal-ok');

// 账本
await page.click('[data-tab="ledger"]');
assert.match(await text('.stats'), /2 单/);
assert.match(await text('.stats'), /¥1,161\.67/); // 974.17 + 187.50
assert.match(await text('#backup-tip'), /还没有备份/);
await shot('6-ledger-day');
await page.emulateMediaType('print');
await shot('7-ledger-print');
await page.emulateMediaType('screen');
await page.click('[data-mode="month"]');
assert.match(await text('#report tfoot'), /¥1,161\.67/);
await shot('8-ledger-month');

// 取消订单不计入
await page.click('[data-tab="new"]');
await page.click('#q-add');
await page.click('#new-submit');
await page.click('[data-act="cancel"]');
await page.waitForSelector('#active-list .empty');
const n = await page.evaluate(() => JSON.parse(localStorage.getItem('horse-timer')).rentals.length);
assert.equal(n, 2);

// 深色模式截图
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await page.click('[data-tab="ledger"]');
await page.click('[data-mode="day"]');
await shot('9-dark');

// 打印成 PDF（模拟老板导出）
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
await page.pdf({ path: `${OUT}report.pdf`, format: 'A4' });

assert.deepEqual(errors, []);
console.log('E2E OK');
await browser.close();
