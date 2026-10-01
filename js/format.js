const pad = (n) => String(n).padStart(2, '0');

/** 分 → "¥1,050.00" */
export function yuan(fen) {
  const sign = fen < 0 ? '-' : '';
  const abs = Math.abs(fen);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}¥${whole}.${pad(abs % 100)}`;
}

/** 单价等短显示：整元省略 .00 → "¥100"，否则 "¥99.50" */
export function yuanShort(fen) {
  return fen % 100 === 0 ? `¥${(fen / 100).toLocaleString('en-US')}` : yuan(fen);
}

/** 分 → 输入框里的元文本："100" / "99.5" */
export function yuanInput(fen) {
  return fen == null ? '' : String(fen / 100);
}

export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}分`;
  return m ? `${h}小时${m}分` : `${h}小时`;
}

/** 毫秒 → "01:23:45" */
export function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(ts) {
  return dayKey(ts).slice(0, 7);
}

export function hm(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2026-10-01" → "2026年10月1日" */
export function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${y}年${m}月`;
}

/** 日期键前后挪动：shiftDay("2026-10-01", -1) → "2026-09-30" */
export function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta).getTime());
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1).getTime());
}

export function diffText(diff) {
  if (diff > 0) return `需补收 ${yuan(diff)}`;
  if (diff < 0) return `应退还 ${yuan(-diff)}`;
  return '无需补退';
}

export function horsesText(horses) {
  return horses.map((h) => `${h.no}号 ${yuanShort(h.price)}`).join('、');
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
