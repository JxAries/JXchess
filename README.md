# JXchess

面向中文棋手的国际象棋平台。0.x 阶段做单机学棋工具：复盘棋盘、引擎分析、揭棋与盲棋玩法、账号；联网功能在 1.x 阶段实现。

当前状态：v0.1.0 复盘棋盘开发完成，待正式发布。

> ⚠️ 页面必须通过本地服务访问，不能直接双击 HTML 文件打开。
> 本工程由 TypeScript 编写，棋盘等内容在浏览器里动态生成，直接打开文件只会看到空骨架。

## 快速开始

```bash
cd v0.1
npm install        # 首次运行前执行，安装依赖
npm run dev        # 启动本地服务，然后用浏览器访问 http://localhost:5173
```

- 首页 http://localhost:5173/index.html
- 复盘页 http://localhost:5173/review.html
- 摆盘页 http://localhost:5173/editor.html

其他命令：

```bash
npm run build      # 类型检查并构建，产物输出到 v0.1/dist
npm run preview    # 在本地预览构建产物
```

## 目录结构

- `v0.1/`：Web 前端工程，按 v0.1 里程碑独立管理。`node_modules/`、`dist/` 等本地产物不提交。
- `ignore/`：本地提示词等个人文件，不参与提交。
- `设计文档.md`：项目设计文档，先讲为什么、再讲怎么做。

## 素材与许可

- 棋子图标：使用 lichess 项目 lila 中的 gioco 棋子样式，作者 sadsnake1，许可为 CC BY-NC-SA 4.0，需署名、非商业、相同方式共享。来源：https://github.com/lichess-org/lila 的 public/piece/gioco。
- 仓库协议：MPL-2.0，仅适用于本项目自研代码；第三方素材保留其自身许可。

## 版本变化

本板块记录每个版本的变更。

- v0.1.0：复盘棋盘功能完成，等待发布。实现 PGN 导入与导出、逐步回放与任意跳转、点击走子与合法性校验、摆盘编辑、吃子记录；并含棋盘翻转、走子动画与音效、被将军红格提醒、摆盘的选择移动/擦除/放置与走子方、易位权利选项。
- 筹备阶段：设计文档定稿，首次提交只包含 README 与设计文档。

作者：谏贤
