# 前端开发指南

本系统前端采用 React 18 + TypeScript + Vite 构建，使用 Ant Design 作为 UI 组件库。

## 1. 项目结构

```
frontend/
├── src/
│   ├── assets/          # 静态资源
│   ├── components/      # 公共组件
│   ├── pages/           # 页面组件
│   │   ├── LibraryPage.tsx       # 文献库页面
│   │   ├── StagingPapersPage.tsx # 暂存区页面
│   │   ├── CrawlJobsPage.tsx     # 爬虫任务页面
│   │   ├── PhdPipelinePage.tsx   # 综述生成页面
│   │   └── ...
│   ├── services/        # API 服务封装
│   │   ├── api.ts                # Axios 实例与拦截器
│   │   └── ...
│   ├── App.tsx          # 根组件与路由配置
│   ├── main.tsx         # 入口文件
│   └── index.css        # 全局样式
├── public/              # 公共静态文件
├── package.json         # 依赖管理
├── tsconfig.json        # TypeScript 配置
└── vite.config.ts       # Vite 配置
```

## 2. 核心技术栈

*   **React 18**: UI 框架
*   **TypeScript**: 静态类型检查
*   **Vite**: 构建工具
*   **Ant Design**: UI 组件库
*   **Axios**: HTTP 请求库
*   **React Router**: 路由管理
*   **ECharts**: 数据可视化 (用于 RAG 调试面板等)

## 3. 开发规范

### 3.1 组件开发

*   使用函数式组件 (Functional Components) 和 Hooks。
*   组件文件命名采用 PascalCase (如 `LibraryPage.tsx`)。
*   尽量将复杂逻辑抽离为自定义 Hooks。

### 3.2 状态管理

*   简单状态使用 `useState`。
*   复杂状态或跨组件共享状态可考虑 Context API 或 Redux (目前主要依赖 Context 和 Props)。
*   API 请求状态建议封装在 Hooks 中。

### 3.3 样式

*   主要使用 Ant Design 的内置样式和组件属性。
*   自定义样式写在 `index.css` 或组件对应的 CSS 模块中。
*   使用 Flexbox 和 Grid 进行布局。

## 4. 关键功能模块

### 4.1 文献库 (LibraryPage)

*   展示 `Paper` 列表。
*   支持分页、筛选、搜索。
*   提供详情查看、编辑、删除操作。

### 4.2 暂存区 (StagingPapersPage)

*   展示 `StagingPaper` 列表。
*   提供“提升” (Promote) 操作，将暂存文献转入正式库。
*   支持批量操作。

### 4.3 综述生成 (PhdPipelinePage)

*   多步骤向导式界面。
*   集成 RAG 可视化调试面板 (`SemanticSearchDebugPanel`)。
*   展示生成的综述内容 (Markdown 渲染)。

### 4.4 爬虫任务 (CrawlJobsPage)

*   创建新任务表单。
*   任务列表与状态监控。
*   轮询更新任务进度。

## 5. 调试与构建

*   **启动开发服务器**: `npm run dev`
*   **构建生产版本**: `npm run build`
*   **类型检查**: `npm run type-check` (建议在 `package.json` 中配置 `tsc --noEmit`)