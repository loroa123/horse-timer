import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayReport, monthReport } from '../js/report.js';
import { emptyState, load, save, exportBackup, importBackup, KEY } from '../js/store.js';

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime(); // 2026年10月（本地时区）

function done(id, endTs, horseCount, minutes, fee) {
  const horses = Array.from({ length: horseCount }, (_, i) => ({ no: String(i + 1), price: 10000 }));
  return { id, note: id, horses, prepaidHours: 1, prepaid: 0, start: endTs - minutes * 60_000, end: endTs, minutes, fee, diff: fee, status: 'done' };
}

const rentals = [
  done('a', at(1, 12), 2, 60, 20000),
  done('b', at(1, 18), 1, 90, 15000),
  done('c', at(2, 10), 3, 30, 15000),
  done('d', new Date(2026, 8, 30, 23).getTime(), 1, 60, 10000), // 9 月
  { id: 'e', horses: [{ no: '1', price: 10000 }], prepaid: 10000, start: at(1, 9), status: 'active' },
];

test('日报：只算当天结算的已完成订单，按结算时间排序', () => {
  const r = dayReport(rentals, '2026-10-01');
  assert.deepEqual(r.rows.map((x) => x.id), ['a', 'b']);
  assert.equal(r.count, 2);
  assert.equal(r.horseMinutes, 2 * 60 + 90);
  assert.equal(r.income, 35000);
});

test('月报：按天汇总并合计', () => {
  const r = monthReport(rentals, '2026-10');
  assert.deepEqual(r.days.map((d) => [d.day, d.count, d.income]), [['2026-10-01', 2, 35000], ['2026-10-02', 1, 15000]]);
  assert.equal(r.count, 3);
  assert.equal(r.income, 50000);
  assert.equal(monthReport(rentals, '2026-09').income, 10000);
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()] };
}

test('存取往返，损坏数据会另存而不是丢掉', () => {
  const s = memoryStorage();
  assert.deepEqual(load(s), emptyState());
  const state = { ...emptyState(), rentals: [rentals[0]] };
  save(state, s);
  assert.deepEqual(load(s).rentals, [rentals[0]]);

  s.setItem(KEY, '{broken');
  const recovered = load(s);
  assert.equal(recovered.recovered, true);
  assert.ok(s.keys().some((k) => k.startsWith(`${KEY}-corrupt-`)));
});

test('备份导入按 id 合并，不覆盖已有、跳过无效', () => {
  const backup = exportBackup({ rentals });
  const state = { ...emptyState(), rentals: [rentals[0]] };
  const bad = JSON.parse(backup);
  bad.rentals.push({ id: 'x', horses: [] });
  const result = importBackup(state, JSON.stringify(bad));
  assert.deepEqual(result, { added: 4, skipped: 2 });
  assert.equal(state.rentals.length, 5);
  assert.throws(() => importBackup(state, '{"foo":1}'), /不是本工具/);
  assert.throws(() => importBackup(state, 'nope'), /不是有效/);
});
