import { parseYuan, parseHours, hourlyTotal, prepaidAmount, settle, MS_PER_HOUR, MS_PER_MIN } from './billing.js';
import {
  yuan, yuanShort, yuanInput, duration, clock, dayKey, monthKey, hm, dayLabel, monthLabel,
  shiftDay, shiftMonth, diffText, horsesText, escapeHtml,
} from './format.js';
import { dayReport, monthReport } from './report.js';
import { load, save, exportBackup, importBackup } from './store.js';

const $ = (sel) => document.querySelector(sel);
const BACKUP_REMIND_DAYS = 7;

let state = load();
let draft = []; // 新开单里的马：[{ no, priceText }]
let pending = null; // 结算弹窗里待确认的 { rental, result }
const ledger = { mode: 'day', day: dayKey(Date.now()), month: monthKey(Date.now()) };

function commit() {
  try {
    save(state);
    return true;
  } catch (e) {
    alert(`保存失败：${e.message}\n请先备份数据。`);
    return false;
  }
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

const activeRentals = () => state.rentals.filter((r) => r.status === 'active').sort((a, b) => a.start - b.start);
const findRental = (id) => state.rentals.find((r) => r.id === id);

/* ---------------- 标签切换 ---------------- */

let currentTab = 'timer';
function showTab(name) {
  currentTab = name;
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${name}`;
  for (const b of document.querySelectorAll('.tabbar button')) {
    b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false');
  }
  if (name === 'timer') renderTimer();
  if (name === 'new') renderNew();
  if (name === 'ledger') renderLedger();
  window.scrollTo(0, 0);
}

function updateBadge() {
  const n = activeRentals().length;
  const badge = $('#active-badge');
  badge.hidden = n === 0;
  badge.textContent = n;
}

/* ---------------- 计时页 ---------------- */

function renderTimer() {
  const list = activeRentals();
  updateBadge();
  if (!list.length) {
    $('#active-list').innerHTML = `
      <div class="empty">
        <p>现在没有在外面的马</p>
        <button type="button" class="btn primary big" data-goto="new">新开一单</button>
      </div>`;
    return;
  }
  $('#active-list').innerHTML = list.map((r) => `
    <article class="card" data-id="${r.id}">
      <div class="card-head">
        <h3>${escapeHtml(r.note || '未备注')}</h3>
        <span class="start">${hm(r.start)} 开始</span>
      </div>
      <p class="horses">${escapeHtml(horsesText(r.horses))}</p>
      <p class="meta">共 ${r.horses.length} 匹 · 合计 ${yuanShort(hourlyTotal(r.horses))}/时 · 预付 ${r.prepaidHours} 小时 ${yuan(r.prepaid)}</p>
      <div class="elapsed" data-f="elapsed"></div>
      <div class="status" data-f="status"></div>
      <div class="live" data-f="live"></div>
      <div class="row">
        <button type="button" class="btn danger-text" data-act="cancel">取消订单</button>
        <button type="button" class="btn primary big" data-act="end">结束计时</button>
      </div>
    </article>`).join('');
  tick();
}

function tick() {
  const now = Date.now();
  for (const card of document.querySelectorAll('#active-list .card')) {
    const r = findRental(card.dataset.id);
    if (!r) continue;
    const left = r.start + r.prepaidHours * MS_PER_HOUR - now;
    const s = settle(r, now);
    card.classList.toggle('over', left < 0);
    card.querySelector('[data-f="elapsed"]').textContent = clock(now - r.start);
    card.querySelector('[data-f="status"]').textContent =
      left >= 0 ? `剩余 ${duration(Math.ceil(left / MS_PER_MIN))}` : `已超时 ${duration(Math.floor(-left / MS_PER_MIN))}`;
    card.querySelector('[data-f="live"]').textContent = `按现在结算：应收 ${yuan(s.fee)}，${diffText(s.diff)}`;
  }
}

$('#active-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.goto) return showTab(btn.dataset.goto);
  const r = findRental(btn.closest('.card')?.dataset.id);
  if (!r) return;
  if (btn.dataset.act === 'end') openSettle(r);
  if (btn.dataset.act === 'cancel') {
    const name = r.note || '这一单';
    if (!confirm(`取消「${name}」？\n记录会被删除，不计入收入。预付的 ${yuan(r.prepaid)} 请全额退还客人。`)) return;
    state.rentals = state.rentals.filter((x) => x.id !== r.id);
    if (commit()) toast('订单已取消');
    renderTimer();
  }
});

/* ---------------- 结算弹窗 ---------------- */

function openSettle(r) {
  const result = settle(r, Date.now()); // 结束时间就是按下按钮的这一刻
  pending = { rental: r, result };
  const cls = result.diff > 0 ? 'pay' : result.diff < 0 ? 'refund' : 'even';
  const label = result.diff > 0 ? '需向客人补收' : result.diff < 0 ? '应退还客人' : '刚好，无需补退';
  $('#modal-body').innerHTML = `
    <h2 id="modal-title">结算 · ${escapeHtml(r.note || '未备注')}</h2>
    <p class="sub">${hm(r.start)} → ${hm(result.end)}，共 ${duration(result.minutes)}</p>
    <p class="sub">${escapeHtml(horsesText(r.horses))}</p>
    <dl>
      <dt>每小时合计</dt><dd>${yuan(hourlyTotal(r.horses))}</dd>
      <dt>应收</dt><dd>${yuan(result.fee)}</dd>
      <dt>已预付（${r.prepaidHours} 小时）</dt><dd>${yuan(r.prepaid)}</dd>
    </dl>
    <div class="result ${cls}">${label}${result.diff ? `<strong>${yuan(Math.abs(result.diff))}</strong>` : ''}</div>`;
  $('#modal').hidden = false;
}

function closeSettle() {
  pending = null;
  $('#modal').hidden = true;
}

$('#modal-back').addEventListener('click', closeSettle);
$('#modal-ok').addEventListener('click', () => {
  if (!pending) return;
  const { rental, result } = pending;
  Object.assign(rental, result, { status: 'done' });
  if (commit()) toast('已结算，计入账本');
  closeSettle();
  renderTimer();
});

/* ---------------- 新开单 ---------------- */

function renderNew() {
  if (!$('#f-hours').value) $('#f-hours').value = state.prefs.lastPrepaidHours ?? '';
  if (!$('#q-price').value) $('#q-price').value = yuanInput(state.prefs.lastPrice);
  renderRows();
}

function nextNo() {
  const nums = draft.map((h) => parseInt(h.no, 10)).filter(Number.isFinite);
  return String(nums.length ? Math.max(...nums) + 1 : draft.length + 1);
}

function renderRows() {
  $('#horse-rows').innerHTML = draft.length
    ? draft.map((h, i) => `
      <div class="horse-row" data-i="${i}">
        <label>编号<input class="h-no" value="${escapeHtml(h.no)}" maxlength="8" autocomplete="off"></label>
        <label>单价 ¥/时<input class="h-price" value="${escapeHtml(h.priceText)}" inputmode="decimal" autocomplete="off"></label>
        <button type="button" class="icon-btn" data-act="remove" aria-label="移除 ${escapeHtml(h.no)} 号">✕</button>
      </div>`).join('')
    : '<p class="hint">用上面的“添加”一次加几匹同价的马，再单独改价。</p>';
  updateSummary();
}

/** 校验表单，返回 { horses, hours, prepaid } 或 { error }。 */
function readForm() {
  const hours = parseHours($('#f-hours').value);
  if (hours === null) return { error: '请填写预付小时（如 3 或 2.5）' };
  if (!draft.length) return { error: '请至少添加一匹马' };
  const horses = [];
  const seen = new Set();
  for (const h of draft) {
    const no = h.no.trim();
    const price = parseYuan(h.priceText);
    if (!no) return { error: '有马没填编号' };
    if (seen.has(no)) return { error: `编号 ${no} 重复了` };
    if (price === null) return { error: `${no} 号的单价不对` };
    seen.add(no);
    horses.push({ no, price });
  }
  return { horses, hours, prepaid: prepaidAmount(horses, hours) };
}

function updateSummary() {
  const f = readForm();
  $('#new-error').textContent = '';
  if (f.error) {
    $('#new-summary').innerHTML = `<span class="hint">${escapeHtml(f.error)}</span>`;
    $('#new-submit').textContent = '收款并开始计时';
    return;
  }
  $('#new-summary').innerHTML = `
    共 ${f.horses.length} 匹 · 合计 ${yuan(hourlyTotal(f.horses))}/时 × ${f.hours} 小时<br>
    预收 <strong>${yuan(f.prepaid)}</strong>`;
  $('#new-submit').textContent = `收款 ${yuan(f.prepaid)} 并开始计时`;
}

$('#q-add').addEventListener('click', () => {
  const count = parseInt($('#q-count').value, 10);
  if (!(count >= 1 && count <= 50)) return void ($('#new-error').textContent = '匹数请填 1–50');
  if (parseYuan($('#q-price').value) === null) return void ($('#new-error').textContent = '请先填写单价');
  const priceText = $('#q-price').value.trim();
  for (let i = 0; i < count; i++) draft.push({ no: nextNo(), priceText });
  $('#q-count').value = 1;
  renderRows();
});

$('#add-one').addEventListener('click', () => {
  const priceText = draft.at(-1)?.priceText ?? $('#q-price').value.trim();
  draft.push({ no: nextNo(), priceText });
  renderRows();
  document.querySelector('#horse-rows .horse-row:last-child .h-price')?.focus();
});

$('#horse-rows').addEventListener('input', (e) => {
  const i = Number(e.target.closest('.horse-row')?.dataset.i);
  if (!draft[i]) return;
  if (e.target.classList.contains('h-no')) draft[i].no = e.target.value;
  if (e.target.classList.contains('h-price')) draft[i].priceText = e.target.value;
  updateSummary();
});

$('#horse-rows').addEventListener('click', (e) => {
  if (e.target.closest('[data-act="remove"]')) {
    draft.splice(Number(e.target.closest('.horse-row').dataset.i), 1);
    renderRows();
  }
});

$('#f-hours').addEventListener('input', updateSummary);

$('#new-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = readForm();
  if (f.error) return void ($('#new-error').textContent = f.error);
  state.rentals.push({
    id: newId(),
    note: $('#f-note').value.trim(),
    horses: f.horses,
    prepaidHours: f.hours,
    prepaid: f.prepaid,
    start: Date.now(),
    end: null, minutes: null, fee: null, diff: null,
    status: 'active',
  });
  state.prefs.lastPrepaidHours = f.hours;
  state.prefs.lastPrice = f.horses.at(-1).price;
  if (!commit()) return;
  draft = [];
  $('#f-note').value = '';
  $('#q-price').value = '';
  toast('已开始计时');
  showTab('timer');
});

/* ---------------- 账本 ---------------- */

function renderLedger() {
  const isDay = ledger.mode === 'day';
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.mode === ledger.mode));
  $('#pick-day').hidden = !isDay;
  $('#pick-month').hidden = isDay;
  $('#pick-day').value = ledger.day;
  $('#pick-month').value = ledger.month;
  $('#report').innerHTML = isDay ? dayReportHtml() : monthReportHtml();
  renderBackupTip();
}

function statsHtml(t) {
  return `
    <div class="stats">
      <div class="stat"><span>订单</span><strong>${t.count} 单</strong></div>
      <div class="stat"><span>马匹·小时</span><strong>${(t.horseMinutes / 60).toFixed(1)}</strong></div>
      <div class="stat"><span>总收入</span><strong>${yuan(t.income)}</strong></div>
    </div>`;
}

function timeRange(r) {
  const sameDay = dayKey(r.start) === dayKey(r.end);
  const d = new Date(r.start);
  const startText = sameDay ? hm(r.start) : `${d.getMonth() + 1}/${d.getDate()} ${hm(r.start)}`;
  return `${startText}–${hm(r.end)}`;
}

function dayReportHtml() {
  const rep = dayReport(state.rentals, ledger.day);
  const activeCount = activeRentals().length;
  const isToday = ledger.day === dayKey(Date.now());
  const settleText = (r) => (r.diff > 0 ? `补 ${yuan(r.diff)}` : r.diff < 0 ? `退 ${yuan(-r.diff)}` : '—');
  // 手机屏幕上用列表，打印时用完整表格
  const items = rep.rows.map((r) => `
    <li class="order">
      <div class="order-main">
        <div class="order-title">${timeRange(r)} · ${escapeHtml(r.note || '未备注')}</div>
        <div class="order-sub">${escapeHtml(horsesText(r.horses))}</div>
        <div class="order-sub">${duration(r.minutes)} · 预付 ${yuan(r.prepaid)} · ${settleText(r)}</div>
      </div>
      <div class="order-side">
        <strong>${yuan(r.fee)}</strong>
        <button type="button" class="link-btn" data-del="${r.id}">删除</button>
      </div>
    </li>`).join('');
  const rows = rep.rows.map((r) => `
    <tr>
      <td>${timeRange(r)}</td>
      <td class="wrap">${escapeHtml(r.note || '—')}</td>
      <td class="wrap">${escapeHtml(horsesText(r.horses))}</td>
      <td>${duration(r.minutes)}</td>
      <td class="num">${yuan(r.prepaid)}</td>
      <td class="num">${settleText(r)}</td>
      <td class="num"><strong>${yuan(r.fee)}</strong></td>
    </tr>`).join('');
  return `
    <div class="report-head"><h2>马匹租赁日报</h2><p>${dayLabel(ledger.day)}</p></div>
    ${statsHtml(rep)}
    ${isToday && activeCount ? `<p class="hint no-print">另有 ${activeCount} 单正在计时，结算后计入。</p>` : ''}
    ${rep.rows.length ? `
      <ul class="order-list screen-only">${items}</ul>
      <div class="table-wrap print-only"><table>
        <thead><tr><th>时段</th><th>客人</th><th>马匹（单价/时）</th><th>时长</th><th class="num">预付</th><th class="num">补/退</th><th class="num">收入</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="6">合计</td><td class="num">${yuan(rep.income)}</td></tr></tfoot>
      </table></div>` : '<p class="empty">这天没有结算记录</p>'}`;
}

function monthReportHtml() {
  const rep = monthReport(state.rentals, ledger.month);
  const rows = rep.days.map((d) => `
    <tr class="clickable" data-day="${d.day}">
      <td>${Number(d.day.slice(8))}日</td>
      <td class="num">${d.count}</td>
      <td class="num">${(d.horseMinutes / 60).toFixed(1)}</td>
      <td class="num"><strong>${yuan(d.income)}</strong></td>
    </tr>`).join('');
  return `
    <div class="report-head"><h2>马匹租赁月报</h2><p>${monthLabel(ledger.month)}</p></div>
    ${statsHtml(rep)}
    ${rep.days.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>日期</th><th class="num">订单</th><th class="num">马匹·小时</th><th class="num">收入</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>合计</td><td class="num">${rep.count}</td><td class="num">${(rep.horseMinutes / 60).toFixed(1)}</td><td class="num">${yuan(rep.income)}</td></tr></tfoot>
      </table></div>
      <p class="hint no-print">点某一天可查看当天明细。</p>` : '<p class="empty">这个月没有结算记录</p>'}`;
}

function renderBackupTip() {
  const hasData = state.rentals.some((r) => r.status === 'done');
  const last = state.lastBackupAt;
  const days = last ? Math.floor((Date.now() - last) / 86_400_000) : null;
  let msg = '';
  if (state.recovered) msg = '本地数据读取失败，已另存原始数据。请用“恢复数据”导入最近的备份。';
  else if (hasData && days === null) msg = '还没有备份过数据，建议现在备份一次。';
  else if (hasData && days >= BACKUP_REMIND_DAYS) msg = `已经 ${days} 天没有备份了，建议现在备份。`;
  $('#backup-tip').innerHTML = msg ? `<div class="tip">${msg}</div>` : '';
}

for (const b of document.querySelectorAll('.seg button')) {
  b.addEventListener('click', () => { ledger.mode = b.dataset.mode; renderLedger(); });
}
$('#prev').addEventListener('click', () => shiftLedger(-1));
$('#next').addEventListener('click', () => shiftLedger(1));
function shiftLedger(delta) {
  if (ledger.mode === 'day') ledger.day = shiftDay(ledger.day, delta);
  else ledger.month = shiftMonth(ledger.month, delta);
  renderLedger();
}
$('#pick-day').addEventListener('change', (e) => { if (e.target.value) { ledger.day = e.target.value; renderLedger(); } });
$('#pick-month').addEventListener('change', (e) => { if (e.target.value) { ledger.month = e.target.value; renderLedger(); } });

$('#report').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    const r = findRental(del.dataset.del);
    if (r && confirm(`删除「${r.note || '未备注'}」这条 ${yuan(r.fee)} 的记录？删除后无法恢复。`)) {
      state.rentals = state.rentals.filter((x) => x.id !== r.id);
      if (commit()) toast('已删除');
      renderLedger();
    }
    return;
  }
  const row = e.target.closest('tr[data-day]');
  if (row) {
    ledger.mode = 'day';
    ledger.day = row.dataset.day;
    renderLedger();
  }
});

$('#print').addEventListener('click', () => {
  const title = document.title;
  document.title = ledger.mode === 'day' ? `马匹租赁日报-${ledger.day}` : `马匹租赁月报-${ledger.month}`; // 作为 PDF 默认文件名
  window.addEventListener('afterprint', () => (document.title = title), { once: true });
  window.print();
});

$('#backup').addEventListener('click', async () => {
  const name = `马匹计时备份-${dayKey(Date.now())}.json`;
  const file = new File([exportBackup(state)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const url = URL.createObjectURL(file);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    state.lastBackupAt = Date.now();
    commit();
    renderBackupTip();
    toast('备份文件已导出');
  } catch (err) {
    if (err.name !== 'AbortError') alert(`导出失败：${err.message}`);
  }
});

$('#restore').addEventListener('click', () => $('#restore-file').click());
$('#restore-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { added, skipped } = importBackup(state, await file.text());
    delete state.recovered;
    if (commit()) alert(`恢复完成：新增 ${added} 条记录${skipped ? `，跳过 ${skipped} 条已存在或无效的记录` : ''}。`);
    renderLedger();
    updateBadge();
  } catch (err) {
    alert(`恢复失败：${err.message}`);
  }
});

/* ---------------- 启动 ---------------- */

for (const b of document.querySelectorAll('.tabbar button')) b.addEventListener('click', () => showTab(b.dataset.tab));

setInterval(() => { if (currentTab === 'timer') tick(); }, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentTab === 'timer') tick();
});

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

showTab('timer');
