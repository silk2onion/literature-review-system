# 贡献指南

欢迎为本项目做出贡献！在提交代码之前，请阅读以下指南。

## 1. 开发流程

1.  **Fork** 本仓库。
2.  **Clone** 到本地。
3.  创建一个新的 **Branch** 进行开发 (`git checkout -b feature/your-feature-name`)。
4.  提交代码 (`git commit -m "feat: add new feature"`)。
5.  推送到远程仓库 (`git push origin feature/your-feature-name`)。
6.  提交 **Pull Request**。

## 2. 代码规范

### 2.1 Python (后端)

*   遵循 **PEP 8** 编码规范。
*   使用 **Type Hints** (类型注解)。
*   使用 `black` 或 `autopep8` 进行代码格式化。
*   编写单元测试 (使用 `pytest`)。

### 2.2 TypeScript/React (前端)

*   遵循 **ESLint** 配置。
*   使用 **Prettier** 进行代码格式化。
*   组件命名使用 PascalCase，函数和变量使用 camelCase。
*   避免使用 `any` 类型，尽量定义清晰的 Interface。

## 3. 提交信息规范

请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

*   `feat`: 新功能
*   `fix`: 修复 Bug
*   `docs`: 文档修改
*   `style`: 代码格式修改 (不影响逻辑)
*   `refactor`: 代码重构
*   `test`: 测试用例修改
*   `chore`: 构建过程或辅助工具的变动

示例：
```
feat: add new crawler for Scopus
fix: resolve pagination issue in library page
docs: update API documentation
```

## 4. 报告问题

如果您发现了 Bug 或有功能建议，请在 GitHub Issues 中提交。请提供以下信息：

*   问题描述
*   复现步骤
*   期望行为
*   实际行为
*   环境信息 (OS, Browser, Python version, etc.)