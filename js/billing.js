// 计费规则：时长四舍五入到分钟，金额四舍五入到分。所有金额单位均为“分”。

export const MS_PER_MIN = 60_000;
export const MS_PER_HOUR = 3_600_000;

/** 用户输入的元（如 "100" / "99.5"）转成分；无效或负数返回 null。 */
export function parseYuan(text) {
  const s = String(text ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** 预付小时数：允许 0 和小数（如 2.5），无效返回 null。 */
export function parseHours(text) {
  const s = String(text ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function roundMinutes(ms) {
  return Math.max(0, Math.round(ms / MS_PER_MIN));
}

/** 一批马每小时合计单价（分）。 */
export function hourlyTotal(horses) {
  return horses.reduce((sum, h) => sum + h.price, 0);
}

export function prepaidAmount(horses, hours) {
  return Math.round(hourlyTotal(horses) * hours);
}

export function feeFor(horses, minutes) {
  return Math.round((hourlyTotal(horses) * minutes) / 60);
}

/** 按结束时间算出结算结果；diff > 0 需补收，diff < 0 应退还。 */
export function settle(rental, endTs) {
  const minutes = roundMinutes(endTs - rental.start);
  const fee = feeFor(rental.horses, minutes);
  return { end: endTs, minutes, fee, diff: fee - rental.prepaid };
}
