# CLAUDE.md

先读 `README.md`：里面有当前进度、已确认的业务规则、技术设计和后续计划。

## 关键约定
- 原生 HTML/CSS/JS（ES 模块），不引入框架和构建步骤；页面本身零依赖。
- 金额一律用整数“分”。时长四舍五入到分钟，金额四舍五入到分；改计费规则前先和用户确认。
- 计费和统计逻辑放在纯函数模块（`js/billing.js`、`js/report.js`），并补上 `tests/` 里的单元测试；只有 `js/app.js` 可以碰 DOM。
- 改存储结构时，把 `js/store.js` 的 `VERSION` 加 1，并写 `migrate()`。使用者手机上已经有真实数据，不能丢。
- 新增静态文件时，要加进 `sw.js` 的 `ASSETS` 列表。
- 界面文字用中文；按钮至少 44px 高；改了样式要检查深色模式和打印样式（`@media print`）。

## 验证
- `npm test`：单元测试
- `npm start`，再另开终端跑 `npm run e2e`：端到端测试，截图在 `e2e/shots/`，改了界面要看截图
- `git push` 到 `main` 就是发布（GitHub Pages）；只有在用户要求时才推送

## 完成一项工作后
更新 `README.md` 里的“当前进度”和“后续计划”。
