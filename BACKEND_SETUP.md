# 后端快速启动指南

## 📋 前置要求

- Python 3.9+
- pip

## 🚀 快速启动

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

复制`.env.example`为`.env`并配置：

```bash
cp .env.example .env
```

编辑`.env`文件，至少配置：

```env
# OpenAI API配置（必须）
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4

# 数据库配置（可选，默认使用SQLite）
DATABASE_URL=sqlite:///./literature.db
```

### 3. 启动服务器

```bash
python run.py
```

或者：

```bash
python -m app.main
```

服务器将在 `http://localhost:8000` 启动

## 📚 API文档

启动后访问：
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc
- OpenAPI JSON: http://localhost:8000/api/openapi.json

## 🔧 主要功能

### 文献搜索API (`/api/papers`)

- `POST /api/papers/search` - 搜索文献
- `GET /api/papers` - 获取文献列表
- `GET /api/papers/{id}` - 获取文献详情
- `POST /api/papers/{id}/download` - 下载文献PDF

### 综述生成API (`/api/reviews`)

- `POST /api/reviews/generate` - 生成综述
- `GET /api/reviews` - 获取综述列表
- `GET /api/reviews/{id}` - 获取综述详情
- `GET /api/reviews/{id}/papers` - 获取综述关联的文献

## 📁 项目结构

```
backend/
├── app/
│   ├── api/              # API路由
│   │   ├── papers.py     # 文献API
│   │   └── reviews.py    # 综述API
│   ├── models/           # 数据库模型
│   │   ├── paper.py      # 文献模型
│   │   └── review.py     # 综述模型
│   ├── schemas/          # Pydantic schemas
│   │   ├── paper.py      # 文献schemas
│   │   └── review.py     # 综述schemas
│   ├── services/         # 业务逻辑
│   │   ├── crawler/      # 爬虫服务
│   │   │   └── arxiv_crawler.py
│   │   └── llm/          # LLM服务
│   │       └── openai_service.py
│   ├── config.py         # 配置管理
│   ├── database.py       # 数据库连接
│   └── main.py           # FastAPI应用入口
├── requirements.txt      # 依赖包
├── .env.example         # 环境变量示例
└── run.py               # 启动脚本
```

## 🧪 测试API

### 搜索文献

```bash
curl -X POST "http://localhost:8000/api/papers/search" \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["urban design", "sustainable cities"],
    "sources": ["arxiv"],
    "limit": 10,
    "year_from": 2020
  }'
```

### 生成综述

```bash
curl -X POST "http://localhost:8000/api/reviews/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["urban design", "sustainable cities"],
    "paper_limit": 20,
    "sources": ["arxiv"],
    "framework_only": false
  }'
```

## ⚙️ 配置说明

### 数据源配置

目前支持的数据源：
- `arxiv` - Arxiv学术论文库（已实现）
- `google_scholar` - Google Scholar（待实现）
- `pubmed` - PubMed（待实现）

### LLM配置

支持OpenAI兼容的API，包括：
- OpenAI官方API
- Claude API（通过适配器）
- 本地模型（如Ollama）

配置方法：修改`.env`中的`OPENAI_BASE_URL`和`OPENAI_MODEL`

## 🐛 常见问题

### 1. 导入错误

确保已安装所有依赖：
```bash
pip install -r requirements.txt
```

### 2. 数据库错误

数据库会自动创建，如果出错，删除`literature.db`文件重新启动

### 3. API Key错误

确保在`.env`文件中正确配置了`OPENAI_API_KEY`

## 📝 开发说明

### 添加新的爬虫

1. 在`app/services/crawler/`创建新的爬虫类
2. 实现`search()`和`download_pdf()`方法
3. 在`app/api/papers.py`中注册新数据源

### 添加新的API端点

1. 在`app/api/`对应的路由文件中添加新端点
2. 使用FastAPI的装饰器定义路由
3. 添加适当的Pydantic schemas进行数据验证

## 🔄 下一步

- [ ] 实现前端界面
- [ ] 添加更多数据源（Google Scholar、PubMed等）
- [ ] 实现综述导出功能（PDF、Word等）
- [ ] 添加用户认证
- [ ] 优化性能和缓存