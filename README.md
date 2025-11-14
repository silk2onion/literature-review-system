# 城市设计文献综述系统

基于爬虫和LLM的智能文献综述生成系统，专为城市设计领域研究人员打造。

## 🎯 项目特点

- **多源文献检索**：支持 Google Scholar、Arxiv、PubMed 等多个学术数据库
- **智能LLM集成**：兼容 OpenAI API 格式的各种大语言模型
- **自动综述生成**：AI自动生成文献综述框架和详细内容
- **现代化界面**：React + TypeScript + Ant Design 构建
- **高性能后端**：FastAPI + SQLAlchemy + Redis 缓存
- **灵活部署**：支持本地开发和Docker容器化部署

## 📋 技术栈

### 后端
- **框架**：FastAPI 0.104+
- **数据库**：SQLite (开发) / PostgreSQL (生产)
- **缓存**：Redis
- **爬虫**：BeautifulSoup, Selenium, Scholarly, Arxiv
- **LLM**：OpenAI API (兼容格式)

### 前端
- **框架**：React 18
- **语言**：TypeScript
- **UI库**：Ant Design
- **状态管理**：Redux Toolkit
- **HTTP客户端**：Axios

## 🚀 快速开始

### 前置要求

- Python 3.9+
- Node.js 16+
- Redis (可选，用于缓存)

### 后端安装

```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 复制环境变量文件
cp .env.example .env

# 编辑 .env 文件，配置你的 OpenAI API Key
# OPENAI_API_KEY=your-api-key-here
```

### 启动后端

```bash
# 在 backend 目录下
cd backend
source venv/bin/activate

# 方式1: 使用 uvicorn
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 方式2: 直接运行 main.py
python -m app.main
```

后端将在 http://localhost:8000 启动
- API文档：http://localhost:8000/api/docs
- 健康检查：http://localhost:8000/api/health

### 前端安装（稍后）

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm start
```

前端将在 http://localhost:3000 启动

## 📚 项目结构

```
literature-review-system/
├── backend/                    # 后端代码
│   ├── app/
│   │   ├── api/               # API路由
│   │   ├── models/            # 数据库模型
│   │   ├── services/          # 业务逻辑
│   │   │   ├── crawler/      # 爬虫服务
│   │   │   ├── llm/          # LLM服务
│   │   │   └── review/       # 综述生成
│   │   ├── schemas/          # Pydantic模型
│   │   ├── utils/            # 工具函数
│   │   ├── config.py         # 配置管理
│   │   ├── database.py       # 数据库连接
│   │   └── main.py           # 主应用
│   ├── tests/                # 测试代码
│   ├── requirements.txt      # Python依赖
│   └── .env.example         # 环境变量示例
├── frontend/                  # 前端代码
│   ├── src/
│   │   ├── components/      # React组件
│   │   ├── pages/           # 页面
│   │   ├── services/        # API服务
│   │   └── store/           # Redux状态
│   └── package.json
├── data/                     # 数据存储
│   ├── papers/              # 文献PDF
│   └── exports/             # 导出文件
├── docs/                     # 文档
├── docker/                   # Docker配置
└── README.md
```

## 🔧 配置说明

### 环境变量配置

在 `backend/.env` 文件中配置：

```env
# OpenAI API配置
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# 使用其他兼容API（如Azure OpenAI、本地模型）
# OPENAI_BASE_URL=https://your-api-endpoint/v1

# 数据库配置
DATABASE_URL=sqlite:///./literature.db

# Redis配置（可选）
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 📖 API文档

启动后端后，访问 http://localhost:8000/api/docs 查看完整的API文档。

### 主要接口

- `POST /api/papers/search` - 搜索文献
- `GET /api/papers/{id}` - 获取文献详情
- `POST /api/reviews/generate` - 生成综述
- `GET /api/reviews/{id}` - 获取综述
- `POST /api/reviews/{id}/export` - 导出综述

## 🧪 开发进度

- [x] 项目结构搭建
- [x] 后端基础框架
- [x] 数据库模型设计
- [ ] 文献爬虫实现
- [ ] LLM服务集成
- [ ] API接口开发
- [ ] 前端页面开发
- [ ] 综述生成功能
- [ ] 导出功能
- [ ] 测试和优化

## 📝 待办事项

查看 [architecture.md](architecture.md) 了解详细的系统架构设计

查看 [implementation-guide.md](implementation-guide.md) 了解具体实现细节

查看 [tech-stack-options.md](tech-stack-options.md) 了解技术选型对比

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👥 联系方式

- 项目地址：https://github.com/your-repo/literature-review-system
- 问题反馈：https://github.com/your-repo/literature-review-system/issues

---

**当前版本**: v1.0.0 (开发中)

**最后更新**: 2024-11-14