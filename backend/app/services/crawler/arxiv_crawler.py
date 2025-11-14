"""
Arxiv爬虫服务
使用官方arxiv API，稳定可靠
"""
import arxiv
import logging
from typing import List, Optional
from datetime import datetime
from app.models.paper import Paper
from app.config import Settings

logger = logging.getLogger(__name__)


class ArxivCrawler:
    """Arxiv文献爬虫"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = arxiv.Client(
            page_size=100,
            delay_seconds=3,  # 遵守API速率限制
            num_retries=3
        )
    
    def search(
        self,
        keywords: List[str],
        max_results: int = 20,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None
    ) -> List[Paper]:
        """
        搜索Arxiv文献
        
        Args:
            keywords: 搜索关键词列表
            max_results: 最大返回结果数
            year_from: 起始年份
            year_to: 结束年份
            
        Returns:
            Paper对象列表
        """
        try:
            # 构建查询字符串
            query = self._build_query(keywords, year_from, year_to)
            logger.info(f"Arxiv搜索查询: {query}")
            
            # 执行搜索
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=arxiv.SortCriterion.SubmittedDate,
                sort_order=arxiv.SortOrder.Descending
            )
            
            papers = []
            for result in self.client.results(search):
                paper = self._parse_result(result)
                if paper:
                    papers.append(paper)
            
            logger.info(f"Arxiv搜索完成，找到 {len(papers)} 篇文献")
            return papers
            
        except Exception as e:
            logger.error(f"Arxiv搜索失败: {e}")
            raise
    
    def _build_query(
        self,
        keywords: List[str],
        year_from: Optional[int] = None,
        year_to: Optional[int] = None
    ) -> str:
        """
        构建Arxiv查询字符串（改进版，增加“模糊匹配”效果）

        设计思路：
        - 不再对每个关键词使用 all:"xxx" 严格短语匹配 + AND
        - 改为更宽松的 OR 组合，并在 title/abstract 中搜索
          例如： (ti:ai OR abs:ai) OR (ti:"urban design" OR abs:"urban design")
        - 时间过滤仍然使用 submittedDate 区间
        """
        normalized_keywords = [kw.strip() for kw in keywords if kw and kw.strip()]
        if not normalized_keywords:
            # 没有关键词时，默认用一个广义主题，避免构造空 query
            base_query = 'all:"artificial intelligence"'
        else:
            # 为每个关键词构造一个“标题 OR 摘要”的子查询，多个关键词之间用 OR 连接
            # 示例：
            #   kw = "ai" =>
            #     (ti:ai OR abs:ai)
            #   kw = "urban design" =>
            #     (ti:"urban design" OR abs:"urban design")
            sub_queries = []
            for kw in normalized_keywords:
                # 对包含空格的关键词加引号，单词可以不加
                if " " in kw:
                    term = f'"{kw}"'
                else:
                    term = kw
                sub_q = f'(ti:{term} OR abs:{term})'
                sub_queries.append(sub_q)

            # 关键词之间使用 OR，增加“模糊匹配”的效果
            base_query = " OR ".join(sub_queries)

        query = base_query

        # 添加年份过滤（如果指定）
        # Arxiv使用 submittedDate 进行过滤
        # 格式: submittedDate:[YYYYMMDD0000 TO YYYYMMDD2359]
        if year_from or year_to:
            year_from_str = f"{year_from}0101" if year_from else "20000101"
            year_to_str = f"{year_to}1231" if year_to else datetime.now().strftime("%Y%m%d")
            query = f"({query}) AND submittedDate:[{year_from_str} TO {year_to_str}]"

        logger.info(f"[ArxivCrawler] 构造查询: {query}")
        return query
    
    def _parse_result(self, result: arxiv.Result) -> Optional[Paper]:
        """解析Arxiv搜索结果为Paper对象"""
        try:
            # 提取作者名
            authors = [author.name for author in result.authors]
            
            # 提取分类
            categories = result.categories if result.categories else []
            
            # 构建Paper对象
            paper = Paper(
                title=result.title,
                authors=authors,
                abstract=result.summary,
                publication_date=result.published.date(),
                year=result.published.year,
                arxiv_id=result.entry_id.split('/')[-1],  # 提取arxiv ID
                url=result.entry_id,
                pdf_url=result.pdf_url,
                source="arxiv",
                categories=categories,
                doi=result.doi if hasattr(result, 'doi') else None
            )
            
            return paper
            
        except Exception as e:
            logger.error(f"解析Arxiv结果失败: {e}")
            return None
    
    def get_paper_by_id(self, arxiv_id: str) -> Optional[Paper]:
        """
        通过Arxiv ID获取单篇文献详情
        
        Args:
            arxiv_id: Arxiv ID (例如: 2301.12345)
            
        Returns:
            Paper对象或None
        """
        try:
            search = arxiv.Search(id_list=[arxiv_id])
            result = next(self.client.results(search))
            return self._parse_result(result)
        except StopIteration:
            logger.warning(f"未找到Arxiv ID: {arxiv_id}")
            return None
        except Exception as e:
            logger.error(f"获取Arxiv文献失败 (ID: {arxiv_id}): {e}")
            return None
    
    def download_pdf(self, paper: Paper, download_dir: str) -> Optional[str]:
        """
        下载PDF文件
        
        Args:
            paper: Paper对象
            download_dir: 下载目录
            
        Returns:
            下载的文件路径或None
        """
        if not paper.pdf_url:
            logger.warning(f"文献缺少PDF链接: {paper.title}")
            return None
        
        try:
            # 使用arxiv库的下载功能
            search = arxiv.Search(id_list=[paper.arxiv_id])
            result = next(self.client.results(search))
            
            # 下载PDF
            pdf_path = result.download_pdf(dirpath=download_dir)
            logger.info(f"PDF下载成功: {pdf_path}")
            return str(pdf_path)
            
        except Exception as e:
            logger.error(f"PDF下载失败 (ID: {paper.arxiv_id}): {e}")
            return None