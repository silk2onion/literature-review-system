# 快速启动指南 - 城市设计文献综述系统

## 环境要求

- Python 3.9+
- Node.js 16+
- Git
- Redis (可选，用于缓存)

## 快速开始（5分钟搭建）

### 步骤1：克隆项目并创建目录结构

```bash
# 创建项目根目录
mkdir literature-review-system
cd literature-review-system

# 创建基础目录结构
mkdir -p backend/{app/{api,models,services/{crawler,llm,review},utils},tests}
mkdir -p frontend/{public,src/{components,pages,services,store}}
mkdir -p docker
mkdir -p docs
```

### 步骤2：后端快速设置

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 创建requirements.txt
cat > requirements.txt << EOF
Flask==2.3.2
Flask-CORS==4.0.0
Flask-SQLAlchemy==3.0.5
Flask-Migrate==4.0.4
openai==1.3.0
scholarly==1.7.11
arxiv==1.4.8
beautifulsoup4==4.12.2
selenium==4.11.2
requests==2.31.0
python-dotenv==1.0.0
celery==5.3.1
redis==4.6.0
SQLAlchemy==2.0.19
pandas==2.0.3
numpy==1.24.3
EOF

# 安装依赖
pip install -r requirements.txt
```

### 步骤3：创建最小可运行的后端

```bash
# 创建配置文件
cat > config.py << 'EOF'
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///literature.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
EOF

# 创建.env文件
cat > .env << EOF
SECRET_KEY=your-secret-key-here
OPENAI_API_KEY=your-openai-api-key-here
# 如果使用其他兼容API，设置BASE_URL
# OPENAI_BASE_URL=https://your-api-endpoint.com/v1
EOF

# 创建主应用文件
cat > run.py << 'EOF'
from flask import Flask, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from config import Config

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)
db = SQLAlchemy(app)

@app.route('/api/health')
def health_check():
    return jsonify({'status': 'healthy', 'message': '系统运行正常'})

@app.route('/api/papers/search', methods=['POST'])
def search_papers():
    # 模拟搜索结果
    return jsonify({
        'success': True,
        'papers': [
            {
                'id': 1,
                'title': '智慧城市设计的可持续发展策略',
                'authors': ['张三', '李四'],
                'year': 2023,
                'source': 'google_scholar',
                'citations_count': 42
            }
        ]
    })

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)
EOF

# 启动后端服务
python run.py
```

### 步骤4：前端快速设置

打开新的终端窗口：

```bash
cd frontend

# 创建React应用
npx create-react-app . --template typescript

# 安装额外依赖
npm install antd axios react-router-dom @ant-design/icons

# 创建简单的主页
cat > src/App.tsx << 'EOF'
import React, { useState } from 'react';
import { Layout, Input, Button, Card, Table, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import axios from 'axios';
import 'antd/dist/reset.css';

const { Header, Content } = Layout;
const { Search } = Input;

const API_BASE_URL = 'http://localhost:5000/api';

function App() {
  const [loading, setLoading] = useState(false);
  const [papers, setPapers] = useState<any[]>([]);

  const handleSearch = async (value: string) => {
    if (!value.trim()) {
      message.warning('请输入搜索关键词');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/papers/search`, {
        keywords: value.split(' '),
        sources: ['google_scholar', 'arxiv'],
        limit: 20
      });
      
      setPapers(response.data.papers);
      message.success(`找到 ${response.data.papers.length} 篇文献`);
    } catch (error) {
      message.error('搜索失败，请检查后端服务是否运行');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '作者',
      dataIndex: 'authors',
      key: 'authors',
      render: (authors: string[]) => authors?.join(', '),
    },
    {
      title: '年份',
      dataIndex: 'year',
      key: 'year',
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
    },
    {
      title: '引用数',
      dataIndex: 'citations_count',
      key: 'citations_count',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', padding: '0 24px' }}>
        <h1>城市设计文献综述系统</h1>
      </Header>
      <Content style={{ padding: '24px' }}>
        <Card title="文献搜索" style={{ marginBottom: 24 }}>
          <Search
            placeholder="输入关键词（如：城市设计 可持续发展）"
            enterButton={<><SearchOutlined /> 搜索</>}
            size="large"
            onSearch={handleSearch}
            loading={loading}
          />
        </Card>
        
        <Card title="搜索结果">
          <Table
            columns={columns}
            dataSource={papers}
            rowKey="id"
            loading={loading}
          />
        </Card>
      </Content>
    </Layout>
  );
}

export default App;
EOF

# 启动前端服务
npm start
```

### 步骤5：访问应用

1. 后端运行在: http://localhost:5000
2. 前端运行在: http://localhost:3000
3. 健康检查: http://localhost:5000/api/health

## 核心功能实现示例

### 1. 实际的Google Scholar爬虫

```python
# backend/app/services/crawler/scholar.py
from scholarly import scholarly
import time
import random

def search_google_scholar(keywords, limit=10):
    """搜索Google Scholar"""
    results = []
    query = ' '.join(keywords)
    
    try:
        # 配置代理（如果需要）
        # scholarly.use_proxy(http="http://your-proxy.com:8080")
        
        search_query = scholarly.search_pubs(query)
        
        for i, paper in enumerate(search_query):
            if i >= limit:
                break
                
            # 提取论文信息
            info = paper['bib']
            paper_data = {
                'title': info.get('title', ''),
                'authors': info.get('author', '').split(' and '),
                'abstract': info.get('abstract', ''),
                'year': info.get('pub_year', ''),
                'venue': info.get('venue', ''),
                'url': paper.get('pub_url', ''),
                'citations': paper.get('num_citations', 0),
            }
            results.append(paper_data)
            
            # 添加随机延迟避免被封
            time.sleep(random.uniform(1, 3))
            
    except Exception as e:
        print(f"搜索错误: {e}")
        
    return results
```

### 2. OpenAI兼容API调用

```python
# backend/app/services/llm/openai_service.py
from openai import OpenAI
import json

class LLMService:
    def __init__(self, api_key, base_url=None):
        """
        初始化LLM服务
        支持OpenAI、Azure OpenAI、本地部署模型等
        """
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url  # 自定义端点
        )
    
    def generate_review(self, papers, prompt_template=None):
        """生成文献综述"""
        # 构建提示词
        papers_text = self._format_papers(papers)
        
        prompt = prompt_template or f"""
        请基于以下文献生成一篇关于城市设计的综述：
        
        {papers_text}
        
        综述要求：
        1. 总结主要研究趋势
        2. 分析不同观点
        3. 指出研究空白
        4. 提出未来方向
        
        请用中文撰写，字数2000字左右。
        """
        
        # 调用API
        response = self.client.chat.completions.create(
            model="gpt-4",  # 或其他兼容模型
            messages=[
                {"role": "system", "content": "你是城市设计领域的专家"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=3000
        )
        
        return response.choices[0].message.content
    
    def _format_papers(self, papers):
        """格式化文献信息"""
        formatted = []
        for i, paper in enumerate(papers, 1):
            text = f"""
            文献{i}:
            标题: {paper.get('title')}
            作者: {', '.join(paper.get('authors', []))}
            摘要: {paper.get('abstract', 'N/A')[:300]}...
            """
            formatted.append(text)
        return '\n'.join(formatted)
```

### 3. 综述生成工作流

```python
# backend/app/services/review/generator.py
class ReviewGenerator:
    def __init__(self, llm_service, db):
        self.llm = llm_service
        self.db = db
    
    def create_review(self, paper_ids, config):
        """创建完整的文献综述"""
        # 1. 获取文献
        papers = self.db.get_papers_by_ids(paper_ids)
        
        # 2. 生成大纲
        outline = self.llm.generate_outline(papers)
        
        # 3. 为每个章节生成内容
        sections = []
        for section in outline['sections']:
            content = self.llm.generate_section(
                section, 
                papers,
                max_tokens=1000
            )
            sections.append(content)
        
        # 4. 组合成完整综述
        review = self._combine_sections(outline, sections)
        
        # 5. 生成参考文献
        references = self._format_references(papers)
        
        return {
            'title': outline['title'],
            'content': review,
            'references': references,
            'metadata': {
                'paper_count': len(papers),
                'word_count': len(review)
            }
        }
```

## 生产环境部署

### 使用Docker部署

```bash
# 构建镜像
docker build -t literature-review:latest .

# 运行容器
docker run -d \
  -p 5000:5000 \
  -e OPENAI_API_KEY=your-key \
  -v $(pwd)/data:/app/data \
  literature-review:latest
```

### 使用Nginx反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /var/www/frontend;
        try_files $uri /index.html;
    }

    # 后端API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 常见问题解决

### 1. Google Scholar被封
- 使用代理服务器
- 降低请求频率
- 考虑使用SerpAPI等付费服务

### 2. OpenAI API配额限制
- 实现请求缓存
- 使用流式输出
- 考虑本地部署开源模型

### 3. 大量文献处理
- 使用Celery异步任务
- 实现批处理
- 添加进度条显示

## 下一步优化

1. **添加更多数据源**
   - CNKI中国知网
   - Web of Science
   - Semantic Scholar

2. **增强LLM功能**
   - 多语言支持
   - 自定义提示词模板
   - 细粒度内容控制

3. **改进用户体验**
   - 实时搜索建议
   - 文献推荐系统
   - 协作功能

## 获取帮助

- 查看详细文档: `docs/`
- 提交问题: GitHub Issues
- 技术支持: support@example.com

现在你可以开始开发了！🚀