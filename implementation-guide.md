# 城市设计文献综述系统 - 详细实现指南

## 第一阶段：基础框架搭建

### 1. 后端基础设置

#### 1.1 Flask应用初始化
```python
# backend/app/__init__.py
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from config import Config

db = SQLAlchemy()
migrate = Migrate()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    CORS(app)
    db.init_app(app)
    migrate.init_app(app, db)
    
    # 注册蓝图
    from app.api import papers_bp, reviews_bp
    app.register_blueprint(papers_bp, url_prefix='/api/papers')
    app.register_blueprint(reviews_bp, url_prefix='/api/reviews')
    
    return app
```

#### 1.2 数据库模型设计
```python
# backend/app/models/paper.py
from app import db
from datetime import datetime

class Paper(db.Model):
    __tablename__ = 'papers'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(500), nullable=False)
    authors = db.Column(db.JSON)  # 存储作者列表
    abstract = db.Column(db.Text)
    publication_date = db.Column(db.Date)
    journal = db.Column(db.String(200))
    doi = db.Column(db.String(100), unique=True)
    url = db.Column(db.String(500))
    pdf_path = db.Column(db.String(500))
    source = db.Column(db.String(50))  # 'google_scholar', 'arxiv', 'pubmed'
    citations_count = db.Column(db.Integer, default=0)
    keywords = db.Column(db.JSON)
    embedding = db.Column(db.JSON)  # 存储文本嵌入向量
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 关系
    reviews = db.relationship('ReviewPaper', back_populates='paper')
```

### 2. 文献爬虫模块实现

#### 2.1 基础爬虫类
```python
# backend/app/services/crawler/base_crawler.py
from abc import ABC, abstractmethod
import time
import random

class BaseCrawler(ABC):
    def __init__(self):
        self.session = self._init_session()
        
    @abstractmethod
    def search(self, keywords, limit=10):
        """搜索文献的抽象方法"""
        pass
    
    @abstractmethod
    def get_paper_details(self, paper_id):
        """获取文献详情的抽象方法"""
        pass
    
    def _rate_limit(self):
        """限制请求频率"""
        time.sleep(random.uniform(1, 3))
```

#### 2.2 Google Scholar爬虫
```python
# backend/app/services/crawler/scholar_crawler.py
from scholarly import scholarly
from .base_crawler import BaseCrawler

class ScholarCrawler(BaseCrawler):
    def search(self, keywords, limit=10):
        search_query = ' '.join(keywords)
        search_results = []
        
        try:
            # 使用scholarly库搜索
            results = scholarly.search_pubs(search_query)
            
            for i, result in enumerate(results):
                if i >= limit:
                    break
                    
                paper_data = {
                    'title': result['bib'].get('title'),
                    'authors': result['bib'].get('author', '').split(' and '),
                    'abstract': result['bib'].get('abstract'),
                    'year': result['bib'].get('pub_year'),
                    'venue': result['bib'].get('venue'),
                    'url': result.get('pub_url'),
                    'citations': result.get('num_citations', 0),
                    'source': 'google_scholar'
                }
                search_results.append(paper_data)
                self._rate_limit()
                
        except Exception as e:
            print(f"Scholar爬虫错误: {e}")
            
        return search_results
```

#### 2.3 Arxiv爬虫
```python
# backend/app/services/crawler/arxiv_crawler.py
import arxiv
from .base_crawler import BaseCrawler

class ArxivCrawler(BaseCrawler):
    def search(self, keywords, limit=10):
        search_query = ' '.join(keywords)
        search_results = []
        
        try:
            # 使用arxiv API
            search = arxiv.Search(
                query=search_query,
                max_results=limit,
                sort_by=arxiv.SortCriterion.Relevance
            )
            
            for result in search.results():
                paper_data = {
                    'title': result.title,
                    'authors': [author.name for author in result.authors],
                    'abstract': result.summary,
                    'publication_date': result.published.date(),
                    'url': result.entry_id,
                    'pdf_url': result.pdf_url,
                    'categories': result.categories,
                    'source': 'arxiv'
                }
                search_results.append(paper_data)
                
        except Exception as e:
            print(f"Arxiv爬虫错误: {e}")
            
        return search_results
```

### 3. LLM集成模块

#### 3.1 OpenAI兼容接口封装
```python
# backend/app/services/llm/llm_service.py
import openai
from typing import List, Dict
import json

class LLMService:
    def __init__(self, api_key: str, base_url: str = None):
        self.client = openai.OpenAI(
            api_key=api_key,
            base_url=base_url  # 支持自定义端点
        )
        
    def generate_review_outline(self, papers: List[Dict]) -> Dict:
        """生成综述大纲"""
        prompt = self._build_outline_prompt(papers)
        
        response = self.client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "你是一位城市设计领域的学术专家，擅长撰写文献综述。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )
        
        outline = response.choices[0].message.content
        return self._parse_outline(outline)
    
    def generate_review_content(self, outline: Dict, papers: List[Dict]) -> str:
        """根据大纲生成详细内容"""
        sections = []
        
        for section in outline['sections']:
            prompt = self._build_section_prompt(section, papers)
            
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "你是一位城市设计领域的学术专家。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1500
            )
            
            sections.append(response.choices[0].message.content)
            
        return '\n\n'.join(sections)
    
    def _build_outline_prompt(self, papers: List[Dict]) -> str:
        """构建生成大纲的提示词"""
        paper_summaries = []
        for paper in papers[:20]:  # 限制输入长度
            summary = f"标题: {paper['title']}\n摘要: {paper.get('abstract', 'N/A')[:200]}"
            paper_summaries.append(summary)
            
        prompt = f"""
        基于以下文献，请生成一个城市设计文献综述的大纲：
        
        文献列表：
        {chr(10).join(paper_summaries)}
        
        请返回JSON格式的大纲，包含以下结构：
        {{
            "title": "综述标题",
            "sections": [
                {{
                    "heading": "章节标题",
                    "subsections": ["子章节1", "子章节2"],
                    "key_points": ["要点1", "要点2"]
                }}
            ]
        }}
        """
        return prompt
```

### 4. 前端React应用

#### 4.1 项目结构
```javascript
// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import SearchPage from './pages/SearchPage';
import ReviewPage from './pages/ReviewPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Router>
    </ConfigProvider>
  );
}

export default App;
```

#### 4.2 搜索页面组件
```javascript
// frontend/src/pages/SearchPage.js
import React, { useState } from 'react';
import { Input, Button, Table, Tag, message, Card, Checkbox, Spin } from 'antd';
import { SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../services/api';

const SearchPage = () => {
  const [keywords, setKeywords] = useState('');
  const [papers, setPapers] = useState([]);
  const [selectedPapers, setSelectedPapers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState(['google_scholar', 'arxiv']);

  const handleSearch = async () => {
    if (!keywords.trim()) {
      message.warning('请输入搜索关键词');
      return;
    }

    setLoading(true);
    try {
      const response = await api.searchPapers({
        keywords: keywords.split(' '),
        sources: sources,
        limit: 50
      });
      setPapers(response.data.papers);
      message.success(`找到 ${response.data.papers.length} 篇相关文献`);
    } catch (error) {
      message.error('搜索失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: '40%',
      render: (text, record) => (
        <a href={record.url} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      ),
    },
    {
      title: '作者',
      dataIndex: 'authors',
      key: 'authors',
      width: '20%',
      render: authors => authors?.join(', '),
    },
    {
      title: '年份',
      dataIndex: 'year',
      key: 'year',
      width: '10%',
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: '10%',
      render: source => <Tag color="blue">{source}</Tag>,
    },
    {
      title: '引用数',
      dataIndex: 'citations_count',
      key: 'citations',
      width: '10%',
      sorter: (a, b) => a.citations_count - b.citations_count,
    },
    {
      title: '操作',
      key: 'action',
      width: '10%',
      render: (_, record) => (
        <Button 
          icon={<DownloadOutlined />} 
          size="small"
          onClick={() => handleDownload(record.id)}
        >
          下载
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title="文献搜索" style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <Checkbox.Group
            options={[
              { label: 'Google Scholar', value: 'google_scholar' },
              { label: 'Arxiv', value: 'arxiv' },
              { label: 'PubMed', value: 'pubmed' },
            ]}
            value={sources}
            onChange={setSources}
          />
        </div>
        
        <Input.Search
          placeholder="输入关键词（如：城市设计 可持续发展）"
          enterButton={<><SearchOutlined /> 搜索</>}
          size="large"
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          onSearch={handleSearch}
          loading={loading}
        />
      </Card>

      <Spin spinning={loading}>
        <Table
          rowSelection={{
            selectedRowKeys: selectedPapers,
            onChange: setSelectedPapers,
          }}
          columns={columns}
          dataSource={papers}
          rowKey="id"
          pagination={{ pageSize: 20 }}
        />
      </Spin>

      {selectedPapers.length > 0 && (
        <Button
          type="primary"
          size="large"
          style={{ marginTop: 16 }}
          onClick={() => generateReview(selectedPapers)}
        >
          生成综述 ({selectedPapers.length} 篇文献)
        </Button>
      )}
    </div>
  );
};

export default SearchPage;
```

### 5. API服务实现

#### 5.1 文献搜索API
```python
# backend/app/api/papers.py
from flask import Blueprint, request, jsonify
from app.services.crawler import CrawlerManager
from app.models import Paper
from app import db

papers_bp = Blueprint('papers', __name__)

@papers_bp.route('/search', methods=['POST'])
def search_papers():
    data = request.json
    keywords = data.get('keywords', [])
    sources = data.get('sources', ['google_scholar'])
    limit = data.get('limit', 20)
    
    crawler_manager = CrawlerManager()
    all_papers = []
    
    for source in sources:
        papers = crawler_manager.search(source, keywords, limit)
        all_papers.extend(papers)
    
    # 去重和保存到数据库
    saved_papers = []
    for paper_data in all_papers:
        existing = Paper.query.filter_by(doi=paper_data.get('doi')).first()
        if not existing and paper_data.get('doi'):
            paper = Paper(**paper_data)
            db.session.add(paper)
            saved_papers.append(paper)
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'papers': [p.to_dict() for p in saved_papers]
    })
```

### 6. 部署配置

#### 6.1 Docker配置
```dockerfile
# docker/Dockerfile
FROM python:3.9-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

ENV FLASK_APP=run.py
ENV FLASK_ENV=production

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "run:app"]
```

#### 6.2 Docker Compose配置
```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  backend:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/literature
      - REDIS_URL=redis://redis:6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
      - redis

  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - backend

  db:
    image: postgres:13
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=literature
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

## 关键技术要点

### 1. 爬虫反爬策略
- 使用代理池轮换IP
- 设置随机User-Agent
- 实现请求频率限制
- 使用Selenium处理动态页面

### 2. LLM优化技巧
- 使用流式输出减少等待时间
- 实现提示词模板管理
- 添加缓存机制避免重复生成
- 支持多模型切换和负载均衡

### 3. 性能优化
- 使用Celery异步处理爬虫任务
- Redis缓存搜索结果
- 数据库查询优化和索引
- 前端虚拟列表处理大量数据

### 4. 用户体验
- 实时进度展示
- 错误友好提示
- 支持断点续传
- 一键导出多种格式

## 测试策略

### 单元测试
```python
# tests/test_crawler.py
import pytest
from app.services.crawler import ScholarCrawler

def test_scholar_search():
    crawler = ScholarCrawler()
    results = crawler.search(['urban design'], limit=5)
    assert len(results) <= 5
    assert all('title' in r for r in results)
```

### 集成测试
```python
# tests/test_api.py
def test_search_api(client):
    response = client.post('/api/papers/search', json={
        'keywords': ['sustainable cities'],
        'sources': ['arxiv'],
        'limit': 10
    })
    assert response.status_code == 200
    assert 'papers' in response.json
```

## 常见问题解决

1. **Google Scholar访问限制**
   - 使用scholarly库的代理功能
   - 实现重试机制
   - 考虑使用SerpAPI等付费服务

2. **LLM令牌限制**
   - 分段处理长文本
   - 实现文本摘要预处理
   - 使用向量数据库检索相关段落

3. **PDF下载失败**
   - 实现多源下载策略
   - 使用Sci-Hub作为备选
   - 支持用户手动上传

这个实现指南提供了完整的技术细节和代码示例，可以直接用于开发。