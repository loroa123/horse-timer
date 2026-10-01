# 马匹租赁计时（horse-timer）

马场租马用的计时和结算小工具。来一批客人，谈好每匹马的单价，按预付小时收款后开始计时；回来时一键结束，按实际分钟算出该补收还是该退还多少，并能出日报、月报，打印或导出 PDF。

- **线上地址**：https://loroa123.github.io/horse-timer/
- **仓库**：https://github.com/loroa123/horse-timer
- **使用者**：一位马场老板，在一台手机上用（安卓或 iPhone），装法是“添加到主屏幕”

---

## 当前进度

**状态：MVP 已上线（2026-10-01），等朋友用真机试用并反馈。**

### 已完成
- [x] 新开单：每匹马单独定价；编号每单从 1 自动排，可手改；编号重复时提示；实时显示预收金额；记住上次用的预付小时和单价
- [x] 计时：卡片每秒刷新已骑时长；显示剩余或超时（超时卡片变橙）；实时显示“按现在结算”的应收和补/退
- [x] 结算：结束时间定在按下按钮那一刻，弹窗确认，可撤回“继续计时”
- [x] 取消订单：开错单时用，记录删除，不计入收入
- [x] 账本：按日看明细，按月看每日汇总；点月报某一天可跳到当天明细；可删除已结算记录
- [x] 打印 / 导出 PDF：系统打印，A4 专用排版
- [x] 备份 / 恢复：导出 JSON 文件（手机上走系统分享，可直接发微信）；导入时按 id 合并，不覆盖已有记录；超过 7 天没备份会提醒
- [x] PWA：可添加到主屏幕，断网可用，申请持久存储
- [x] 深色模式
- [x] 单元测试 11 个，端到端测试本地和线上均通过

### 待真机确认（还没在实体手机上测过）
- [ ] iPhone 从主屏幕图标打开时，`window.print()` 能不能调出打印（部分 iOS 版本不行，备用办法是在 Safari 里打开再打印）
- [ ] iPhone 主屏幕 App 和 Safari 的 localStorage 是否共享（不同 iOS 版本表现不一致，说明里要求只从主屏幕图标打开）
- [ ] 安卓和 iPhone 上，「备份数据」通过分享发到微信是否顺利
- [ ] 户外强光下字号和对比度是否够用

---

## 业务规则（已和使用者确认）

| 项 | 规则 |
|---|---|
| 时长 | 四舍五入到分钟（不足 30 秒舍去，满 30 秒进 1 分钟） |
| 金额 | 四舍五入到分 |
| 收入归属 | 按**结算那天**算 |
| 超时宽限 | 不设 |
| 回程 | 同一批**一起回**（分批回见后续计划） |
| 价格 | 同一批里每匹马可以不同价 |
| 编号 | 每单从 1、2、3 开始排，可手改；不同订单之间不检查冲突 |

```
每小时合计(分) = Σ 每匹单价(分/时)
预付(分)       = round(每小时合计 × 预付小时)
应收(分)       = round(每小时合计 × 实际分钟 ÷ 60)
差额           = 应收 − 预付      // > 0 补收，< 0 退还
```

例子：3 匹（¥100、¥100、¥150），预付 3 小时 = ¥1,050；实际 2 小时 47 分，应收 ¥974.17，退 ¥75.83。

---

## 技术设计

| 决定 | 原因 |
|---|---|
| 原生 HTML/CSS/JS（ES 模块），不用框架和构建工具 | 只有 3 个页面，零依赖，改完刷新即可，谁接手都看得懂 |
| PWA（manifest + Service Worker） | 一套代码同时覆盖安卓和 iPhone，不用上架 |
| 数据存 localStorage，不用后端 | 目前只有一台手机；一单约 0.5KB，存几万单没问题 |
| 金额一律用**整数“分”**存储和计算 | 避免浮点误差，只在显示时转成元 |
| 计时只存开始时间戳，不在页面上累加 | 锁屏、切后台、页面被杀后时间仍然准确 |
| Service Worker 联网时优先取最新文件，断网时用缓存 | 推送更新后，用户联网打开就是新版本 |
| 部署在 GitHub Pages（main 分支根目录） | 免费、自带 HTTPS（PWA 必须用 HTTPS） |

### 目录结构
```
index.html              页面骨架：计时 / 新开单 / 账本三个标签页 + 结算弹窗
css/app.css             样式（颜色变量、深色模式、打印样式 @media print）
js/billing.js           计费纯函数：parseYuan、roundMinutes、prepaidAmount、feeFor、settle
js/format.js            金额、时长、日期格式化
js/report.js            日报 / 月报汇总（纯函数）
js/store.js             localStorage 读写、版本迁移、备份导出 / 导入合并
js/app.js               界面渲染与事件（唯一依赖 DOM 的模块）
sw.js                   离线缓存
manifest.webmanifest    PWA 配置
icons/                  180（iOS）、192、512 图标
tests/*.test.js         单元测试（node:test）
e2e/run.mjs             端到端测试（puppeteer-core 驱动本机 Chrome）
.nojekyll               让 GitHub Pages 原样发布文件
```

### 数据模型
整个状态存在 localStorage 的 `horse-timer` 这个键下：
```js
{
  version: 1,
  rentals: [{
    id: "uuid",
    note: "张三一行",
    horses: [{ no: "1", price: 10000 }, { no: "3", price: 15000 }], // price 单位：分/小时
    prepaidHours: 3,
    prepaid: 105000,          // 分
    start: 1759312800000,     // 时间戳（毫秒）
    end: null, minutes: null, fee: null, diff: null,  // 结算后填上
    status: "active" | "done" // 取消的订单直接删除
  }],
  prefs: { lastPrepaidHours: 3, lastPrice: 10000 },
  lastBackupAt: null
}
```
- **改数据结构时**：把 `store.js` 里的 `VERSION` 加 1，并在 `migrate()` 里写从旧版本升级的逻辑。用户手机上的旧数据必须能自动升级。
- 读取时如果数据损坏，会把原文另存到 `horse-timer-corrupt-<时间戳>`，不会被后续保存覆盖。

---

## 启动与开发

前提：Node 20+、Python 3、Google Chrome（端到端测试用）。

```bash
npm install          # 只为端到端测试安装 puppeteer-core；页面本身没有任何依赖
npm start            # 本地服务器 http://localhost:8080
npm test             # 单元测试（计费、格式化、报表、存储）
npm run e2e          # 端到端测试，需先 npm start；截图在 e2e/shots/
BASE_URL=https://loroa123.github.io/horse-timer/ npm run e2e   # 测线上
```

- ES 模块和 Service Worker 不能用 `file://` 打开，必须走本地服务器。
- 手机通过局域网 IP 访问本机时不是 HTTPS，Service Worker 不会生效，但其他功能可以测。
- **新增静态文件时，要把它加进 `sw.js` 的 `ASSETS` 列表**，否则断网时打不开这个文件。

## 部署

GitHub Pages 已经配好，发布源是 `main` 分支根目录：
```bash
npm test && git push      # 推送后 1–2 分钟自动生效
```
本仓库的提交署名用 GitHub 隐私邮箱，只配在本仓库的 `git config` 里：`loroa123 <208918097+loroa123@users.noreply.github.com>`。

### 给使用者的安装说明
- **不要在微信里直接打开**，先点右上角“…”，选“在浏览器打开”
- iPhone：用 Safari 打开，点“分享”，选“添加到主屏幕”，以后只从图标打开
- 安卓：用 Chrome 打开，点菜单，选“添加到主屏幕”或“安装应用”
- 定期在「账本」里点「备份数据」，把文件发到微信或网盘

---

## 后续计划（按优先级）

1. **根据真机试用反馈修问题**（见上面“待真机确认”）
2. **马匹档案**：给老板的每匹马设固定编号和默认价格；开单时直接勾选这批客人骑了哪几匹，自动带出价格。
   - 订单的 `horses[]` 每项加 `horseId` 引用档案，同时保留 `no`/`price` 快照，以后改价不影响历史账单
   - 编号改为马的固定编号后，需要提示“这匹马正在外出”
3. **分批回**：`horses[]` 每项加自己的 `end`，可以单独结束某几匹；订单在所有马都回来后才结算完毕
4. **修改开始时间**：忘了按开始时，可以补设开始时间
5. **超时宽限设置**：比如超时 10 分钟内不加钱
6. **多手机同步**：需要后端（比如 Supabase 或 Cloudflare D1），这时再考虑登录
7. 可选：用 [apple-design-skill](https://github.com/dickwu/apple-design-skill) 对界面做一次审查。它只适用通用原则（无障碍、颜色、字体、文案），不适用 iOS 专属规范，因为还要兼顾安卓
