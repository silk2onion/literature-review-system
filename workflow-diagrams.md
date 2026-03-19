# 城市设计文献综述系统 - 工作流程图

## 1. 整体系统工作流程

```mermaid
graph TB
    Start[用户访问系统] --> Search[输入关键词搜索]
    Search --> Crawl[多源爬虫检索]
    
    Crawl --> Scholar[Google Scholar]
    Crawl --> Arxiv[Arxiv]
    Crawl --> PubMed[PubMed]
    
    Scholar --> Merge[合并去重]
    Arxiv --> Merge
    PubMed --> Merge
    
    Merge --> Store[存储到数据库]
    Store --> Display[前端展示文献列表]
    
    Display --> Select[用户选择文献]
    Select --> Generate[LLM生成综述]
    
    Generate --> Outline[生成大纲]
    Outline --> Content[生成详细内容]
    Content --> Format[格式化输出]
    
    Format --> Export[导出文档]
    Export --> Download[用户下载]
```

## 2. 文献爬虫详细流程

```mermaid
graph TB
    Input[接收搜索参数] --> Validate[验证参数]
    Validate --> Cache{检查缓存}
    
    Cache -->|命中| ReturnCache[返回缓存结果]
    Cache -->|未命中| Init[初始化爬虫]
    
    Init --> Proxy[配置代理]
    Proxy --> Loop[循环爬取]
    
    Loop --> Request[发送请求]
    Request --> Parse[解析响应]
    Parse --> Extract[提取数据]
    
    Extract --> RateLimit[限流等待]
    RateLimit --> Check{是否完成}
    
    Check -->|否| Loop
    Check -->|是| Dedupe[去重处理]
    
    Dedupe --> SaveDB[保存数据库]
    SaveDB --> UpdateCache[更新缓存]
    UpdateCache --> Return[返回结果]
    
    Request -->|错误| Retry{重试次数}
    Retry -->|未超限| Wait[等待后重试]
    Wait --> Request
    Retry -->|超限| Error[记录错误]
    Error --> Return
```

## 3. LLM综述生成流程

```mermaid
graph TB
    Start[开始生成综述] --> LoadPapers[加载文献数据]
    LoadPapers --> Preprocess[预处理文本]
    
    Preprocess --> Summarize[生成摘要]
    Summarize --> Extract[提取关键点]
    
    Extract --> BuildPrompt[构建提示词]
    BuildPrompt --> CallLLM1[调用LLM生成大纲]
    
    CallLLM1 --> ParseOutline[解析大纲结构]
    ParseOutline --> Loop[遍历章节]
    
    Loop --> Section[处理当前章节]
    Section --> BuildSectionPrompt[构建章节提示词]
    BuildSectionPrompt --> CallLLM2[调用LLM生成内容]
    
    CallLLM2 --> CheckToken{检查令牌数}
    CheckToken -->|超限| Split[分段生成]
    CheckToken -->|正常| Append[添加内容]
    
    Split --> CallLLM2
    Append --> NextSection{还有章节?}
    
    NextSection -->|是| Loop
    NextSection -->|否| Combine[组合所有章节]
    
    Combine --> AddReferences[添加参考文献]
    AddReferences --> Format[格式化文档]
    Format --> Save[保存到数据库]
    Save --> End[完成]
```

## 4. 用户交互流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant B as 后端API
    participant C as 爬虫服务
    participant L as LLM服务
    participant D as 数据库
    
    U->>F: 输入关键词
    F->>B: POST /api/papers/search
    B->>C: 调用爬虫
    C->>C: 多源检索
    C->>D: 保存文献
    D-->>C: 返回保存的文献
    C-->>B: 返回文献列表
    B-->>F: 返回JSON数据
    F-->>U: 展示文献列表
    
    U->>F: 选择文献并点击生成
    F->>B: POST /api/reviews/generate
    B->>D: 查询文献详情
    D-->>B: 返回文献数据
    B->>L: 调用LLM生成
    L->>L: 生成大纲
    L->>L: 生成内容
    L-->>B: 返回综述文本
    B->>D: 保存综述
    D-->>B: 确认保存
    B-->>F: 返回综述结果
    F-->>U: 展示综述内容
    
    U->>F: 点击导出
    F->>B: POST /api/reviews/export
    B->>B: 转换格式
    B-->>F: 返回文件
    F-->>U: 下载文件
```

## 5. 数据库关系图

```mermaid
erDiagram
    PAPERS ||--o{ REVIEW_PAPERS : contains
    REVIEWS ||--o{ REVIEW_PAPERS : references
    USERS ||--o{ REVIEWS : creates
    USERS ||--o{ USER_CONFIG : has
    
    PAPERS {
        int id PK
        string title
        json authors
        text abstract
        date publication_date
        string journal
        string doi UK
        string url
        string pdf_path
        string source
        int citations_count
        json keywords
        json embedding
        datetime created_at
    }
    
    REVIEWS {
        int id PK
        int user_id FK
        string title
        json keywords
        json framework
        text content
        string status
        datetime created_at
        datetime updated_at
    }
    
    REVIEW_PAPERS {
        int id PK
        int review_id FK
        int paper_id FK
        int order_index
        text notes
    }
    
    USERS {
        int id PK
        string username
        string email
        string password_hash
        datetime created_at
    }
    
    USER_CONFIG {
        int id PK
        int user_id FK
        json api_keys
        json preferences
        datetime created_at
    }
```

## 6. 前端页面结构

```mermaid
graph TB
    App[App.js根组件] --> Layout[布局组件]
    
    Layout --> Header[头部导航]
    Layout --> Content[内容区域]
    Layout --> Footer[底部]
    
    Content --> SearchPage[搜索页面]
    Content --> ReviewPage[综述页面]
    Content --> SettingsPage[设置页面]
    Content --> HistoryPage[历史记录]
    
    SearchPage --> SearchBar[搜索栏]
    SearchPage --> FilterPanel[筛选面板]
    SearchPage --> PaperList[文献列表]
    SearchPage --> PaperCard[文献卡片]
    
    ReviewPage --> OutlineView[大纲视图]
    ReviewPage --> ContentEditor[内容编辑器]
    ReviewPage --> ReferenceList[参考文献列表]
    ReviewPage --> ExportPanel[导出面板]
    
    SettingsPage --> APIKeyConfig[API密钥配置]
    SettingsPage --> PreferenceConfig[偏好设置]
    SettingsPage --> DataSourceConfig[数据源配置]
```

## 7. API接口架构

```mermaid
graph LR
    Client[客户端] --> Gateway[API网关]
    
    Gateway --> Auth[认证中间件]
    Auth --> RateLimit[限流中间件]
    RateLimit --> Router[路由分发]
    
    Router --> PapersAPI[文献API]
    Router --> ReviewsAPI[综述API]
    Router --> UsersAPI[用户API]
    Router --> ExportAPI[导出API]
    
    PapersAPI --> CrawlerService[爬虫服务]
    ReviewsAPI --> LLMService[LLM服务]
    ReviewsAPI --> ReviewService[综述服务]
    ExportAPI --> ExportService[导出服务]
    
    CrawlerService --> Cache[Redis缓存]
    LLMService --> Cache
    
    CrawlerService --> DB[(数据库)]
    ReviewService --> DB
    ExportService --> DB
```

## 8. 部署架构

```mermaid
graph TB
    subgraph 用户层
        Browser[浏览器]
        Mobile[移动设备]
    end
    
    subgraph CDN层
        CDN[静态资源CDN]
    end
    
    subgraph 负载均衡层
        LB[Nginx负载均衡]
    end
    
    subgraph 应用层
        Frontend1[前端服务1]
        Frontend2[前端服务2]
        Backend1[后端服务1]
        Backend2[后端服务2]
    end
    
    subgraph 任务队列层
        Celery[Celery Worker]
        RabbitMQ[消息队列]
    end
    
    subgraph 数据层
        PostgreSQL[(PostgreSQL)]
        Redis[(Redis)]
        Storage[文件存储]
    end
    
    subgraph 外部服务
        OpenAI[OpenAI API]
        Scholar[学术数据库]
    end
    
    Browser --> CDN
    Mobile --> CDN
    Browser --> LB
    Mobile --> LB
    
    CDN --> Frontend1
    CDN --> Frontend2
    
    LB --> Backend1
    LB --> Backend2
    
    Backend1 --> RabbitMQ
    Backend2 --> RabbitMQ
    RabbitMQ --> Celery
    
    Backend1 --> PostgreSQL
    Backend2 --> PostgreSQL
    Backend1 --> Redis
    Backend2 --> Redis
    
    Celery --> PostgreSQL
    Celery --> Redis
    Celery --> Storage
    
    Celery --> OpenAI
    Celery --> Scholar
```

## 9. 错误处理流程

```mermaid
graph TB
    Error[发生错误] --> Type{错误类型}
    
    Type -->|网络错误| Retry[自动重试]
    Type -->|API限流| Wait[等待后重试]
    Type -->|数据验证| Return[返回错误信息]
    Type -->|系统错误| Log[记录日志]
    
    Retry --> Count{重试次数}
    Count -->|未超限| Delay[延迟等待]
    Count -->|超限| Fail[标记失败]
    
    Delay --> Execute[重新执行]
    Execute --> Success{是否成功}
    Success -->|是| Complete[完成]
    Success -->|否| Error
    
    Wait --> CheckQuota{检查配额}
    CheckQuota -->|已恢复| Execute
    CheckQuota -->|仍超限| Notify[通知用户]
    
    Return --> ShowError[前端展示错误]
    Log --> Alert[发送告警]
    Fail --> Rollback[回滚操作]
    
    Rollback --> Notify
    Alert --> Notify
    ShowError --> End[结束]
    Complete --> End
    Notify --> End
```

## 10. 缓存策略

```mermaid
graph TB
    Request[收到请求] --> CheckCache{检查缓存}
    
    CheckCache -->|命中| ValidCache{缓存有效?}
    CheckCache -->|未命中| FetchData[获取新数据]
    
    ValidCache -->|是| Return[返回缓存数据]
    ValidCache -->|否| Invalid[标记失效]
    
    Invalid --> FetchData
    FetchData --> Process[处理数据]
    Process --> SaveCache[保存到缓存]
    SaveCache --> SetExpire[设置过期时间]
    SetExpire --> Return
    
    Return --> UpdateStats[更新统计]
    UpdateStats --> End[结束]
    
    subgraph 缓存层级
        L1[浏览器缓存]
        L2[CDN缓存]
        L3[Redis缓存]
        L4[数据库]
    end
```

这些流程图清晰地展示了系统各个部分的工作流程和相互关系，可以帮助开发团队更好地理解系统架构。