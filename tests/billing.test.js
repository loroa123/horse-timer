import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYuan, parseHours, roundMinutes, hourlyTotal, prepaidAmount, feeFor, settle } from '../js/billing.js';
import { yuan, yuanShort, duration, clock, diffText, shiftDay, shiftMonth } from '../js/format.js';

const horses = [{ no: '1', price: 10000 }, { no: '2', price: 10000 }, { no: '3', price: 15000 }];

test('parseYuan 转成分，拒绝无效输入', () => {
  assert.equal(parseYuan('100'), 10000);
  assert.equal(parseYuan('99.99'), 9999);
  assert.equal(parseYuan('100.1'), 10010);
  assert.equal(parseYuan(' 0 '), 0);
  for (const bad of ['', 'abc', '-1', '1e3', null, undefined]) assert.equal(parseYuan(bad), null);
});

test('parseHours 支持小数和 0', () => {
  assert.equal(parseHours('2.5'), 2.5);
  assert.equal(parseHours('0'), 0);
  assert.equal(parseHours('-1'), null);
});

test('时长四舍五入到分钟', () => {
  assert.equal(roundMinutes(29_999), 0);
  assert.equal(roundMinutes(30_000), 1);
  assert.equal(roundMinutes(89_999), 1);
  assert.equal(roundMinutes(90_000), 2);
  assert.equal(roundMinutes(-5_000), 0);
});

test('每匹马单价不同时合计与预付', () => {
  assert.equal(hourlyTotal(horses), 35000);
  assert.equal(prepaidAmount(horses, 3), 105000);
  assert.equal(prepaidAmount(horses, 2.5), 87500);
});

test('应收四舍五入到分', () => {
  // ¥350/时 × 167 分钟 = ¥974.1666… → ¥974.17
  assert.equal(feeFor(horses, 167), 97417);
  // ¥100/时 × 1 分钟 = ¥1.6666… → ¥1.67
  assert.equal(feeFor([{ no: '1', price: 10000 }], 1), 167);
});

test('settle：少骑退钱、多骑补钱、刚好不补退', () => {
  const start = 1_000_000;
  const r = { horses, prepaid: 105000, start };
  const early = settle(r, start + (2 * 60 + 47) * 60_000 + 20_000); // 2小时47分20秒 → 167 分钟
  assert.deepEqual(early, { end: start + 10_040_000, minutes: 167, fee: 97417, diff: -7583 });
  const late = settle(r, start + 200 * 60_000);
  assert.equal(late.fee, 116667);
  assert.equal(late.diff, 11667);
  assert.equal(settle(r, start + 180 * 60_000).diff, 0);
});

test('格式化', () => {
  assert.equal(yuan(105000), '¥1,050.00');
  assert.equal(yuan(-7583), '-¥75.83');
  assert.equal(yuanShort(10000), '¥100');
  assert.equal(yuanShort(9950), '¥99.50');
  assert.equal(duration(167), '2小时47分');
  assert.equal(duration(120), '2小时');
  assert.equal(duration(5), '5分');
  assert.equal(clock(5_025_000), '01:23:45');
  assert.equal(diffText(11667), '需补收 ¥116.67');
  assert.equal(diffText(-7583), '应退还 ¥75.83');
  assert.equal(diffText(0), '无需补退');
  assert.equal(shiftDay('2026-10-01', -1), '2026-09-30');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});
