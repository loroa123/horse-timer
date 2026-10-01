import { dayKey, monthKey } from './format.js';

// 收入按结算日（end）归属，只统计已结算订单。

function totals(rows) {
  return rows.reduce(
    (t, r) => ({
      count: t.count + 1,
      horseMinutes: t.horseMinutes + r.horses.length * r.minutes,
      income: t.income + r.fee,
    }),
    { count: 0, horseMinutes: 0, income: 0 },
  );
}

export function dayReport(rentals, day) {
  const rows = rentals
    .filter((r) => r.status === 'done' && dayKey(r.end) === day)
    .sort((a, b) => a.end - b.end);
  return { rows, ...totals(rows) };
}

export function monthReport(rentals, month) {
  const byDay = new Map();
  for (const r of rentals) {
    if (r.status !== 'done' || monthKey(r.end) !== month) continue;
    const key = dayKey(r.end);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }
  const days = [...byDay.keys()].sort().map((day) => ({ day, ...totals(byDay.get(day)) }));
  const sum = days.reduce(
    (t, d) => ({ count: t.count + d.count, horseMinutes: t.horseMinutes + d.horseMinutes, income: t.income + d.income }),
    { count: 0, horseMinutes: 0, income: 0 },
  );
  return { days, ...sum };
}
