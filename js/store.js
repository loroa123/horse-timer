// 本地存储：整个状态存在一个 localStorage 键里，带版本号便于以后迁移。

export const KEY = 'horse-timer';
export const VERSION = 1;

export function emptyState() {
  return { version: VERSION, rentals: [], prefs: { lastPrepaidHours: 3, lastPrice: null }, lastBackupAt: null };
}

function migrate(data) {
  // 目前只有 v1；以后改结构时在这里按 data.version 逐级升级。
  return { ...emptyState(), ...data, prefs: { ...emptyState().prefs, ...data.prefs }, version: VERSION };
}

/** 读取状态。数据损坏时先把原文另存一份，避免被后续保存覆盖。 */
export function load(storage = globalThis.localStorage) {
  const raw = storage.getItem(KEY);
  if (!raw) return emptyState();
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rentals)) throw new Error('格式不对');
    return migrate(data);
  } catch {
    storage.setItem(`${KEY}-corrupt-${Date.now()}`, raw);
    return { ...emptyState(), recovered: true };
  }
}

/** 保存失败（如存储空间满）会抛异常，由调用方提示。 */
export function save(state, storage = globalThis.localStorage) {
  const { recovered, ...rest } = state;
  storage.setItem(KEY, JSON.stringify(rest));
}

export function exportBackup(state, now = Date.now()) {
  return JSON.stringify({ app: 'horse-timer', version: VERSION, exportedAt: now, rentals: state.rentals }, null, 1);
}

function isValidRental(r) {
  return (
    r && typeof r.id === 'string' &&
    Array.isArray(r.horses) && r.horses.length > 0 &&
    r.horses.every((h) => typeof h.no === 'string' && Number.isInteger(h.price) && h.price >= 0) &&
    Number.isFinite(r.start) && Number.isInteger(r.prepaid) &&
    (r.status === 'active' ||
      (r.status === 'done' && Number.isFinite(r.end) && Number.isInteger(r.minutes) && Number.isInteger(r.fee)))
  );
}

/** 按 id 合并导入：已有的记录不覆盖，只补充新的。返回新增和跳过的条数。 */
export function importBackup(state, text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('不是有效的备份文件');
  }
  if (data?.app !== 'horse-timer' || !Array.isArray(data.rentals)) throw new Error('不是本工具导出的备份文件');
  const known = new Set(state.rentals.map((r) => r.id));
  let added = 0, skipped = 0;
  for (const r of data.rentals) {
    if (!isValidRental(r) || known.has(r.id)) { skipped++; continue; }
    state.rentals.push(r);
    known.add(r.id);
    added++;
  }
  return { added, skipped };
}
