"""
出版商 PDF 下载处理器

策略模式：每个出版商一个 handler，负责从其文章页面中提取 PDF 下载链接。
PublisherHandlerRegistry 根据 URL 自动选择合适的 handler。
"""

import logging
import re
from abc import ABC, abstractmethod
from typing import List, Optional
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)


class BasePublisherHandler(ABC):
    """出版商处理器基类"""

    publisher_name: str = "unknown"
    url_patterns: List[str] = []

    def can_handle(self, url: str) -> bool:
        """检查此 handler 是否能处理给定 URL"""
        url_lower = url.lower()
        return any(p in url_lower for p in self.url_patterns)

    @abstractmethod
    def extract_pdf_url(self, page_source: str, page_url: str) -> Optional[str]:
        """
        从页面 HTML 中提取直接 PDF 下载链接

        Args:
            page_source: 页面 HTML 源码
            page_url: 当前页面 URL（用于解析相对路径）

        Returns:
            PDF 直接下载 URL，失败返回 None
        """
        raise NotImplementedError

    def _resolve_url(self, href: str, base_url: str) -> str:
        """将相对 URL 解析为绝对 URL"""
        if href.startswith(("http://", "https://")):
            return href
        return urljoin(base_url, href)


class ElsevierHandler(BasePublisherHandler):
    """ScienceDirect / Elsevier"""

    publisher_name = "elsevier"
    url_patterns = ["sciencedirect.com", "elsevier.com"]

    def extract_pdf_url(self, page_source: str, page_url: str) -> Optional[str]:
        # 方法 1: 查找 pdfLink meta 标签
        match = re.search(
            r'<meta[^>]+name="citation_pdf_url"[^>]+content="([^"]+)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 2: 查找 Download PDF 按钮的链接
        match = re.search(
            r'href="([^"]*(?:pdfft|pdf)[^"]*)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 3: ScienceDirect API 风格 — /pii/ 转为 pdf
        pii_match = re.search(r"/pii/(S\d+)", page_url)
        if pii_match:
            pii = pii_match.group(1)
            return f"https://www.sciencedirect.com/science/article/pii/{pii}/pdfft"

        return None


class SpringerHandler(BasePublisherHandler):
    """Springer / Nature / SpringerLink"""

    publisher_name = "springer"
    url_patterns = ["springer.com", "nature.com", "link.springer.com"]

    def extract_pdf_url(self, page_source: str, page_url: str) -> Optional[str]:
        # 方法 1: citation_pdf_url meta
        match = re.search(
            r'<meta[^>]+name="citation_pdf_url"[^>]+content="([^"]+)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 2: Springer 的 PDF URL 模式 /content/pdf/DOI.pdf
        match = re.search(
            r'href="([^"]*content/pdf/[^"]+\.pdf[^"]*)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 3: 从 article URL 构造 PDF URL
        # https://link.springer.com/article/10.1007/xxx -> /content/pdf/10.1007/xxx.pdf
        doi_match = re.search(r"/article/(10\.\d+/[^?#]+)", page_url)
        if doi_match:
            doi = doi_match.group(1)
            return f"https://link.springer.com/content/pdf/{doi}.pdf"

        return None


class WileyHandler(BasePublisherHandler):
    """Wiley Online Library"""

    publisher_name = "wiley"
    url_patterns = ["onlinelibrary.wiley.com", "wiley.com"]

    def extract_pdf_url(self, page_source: str, page_url: str) -> Optional[str]:
        # 方法 1: citation_pdf_url
        match = re.search(
            r'<meta[^>]+name="citation_pdf_url"[^>]+content="([^"]+)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 2: pdfdirect 链接
        match = re.search(
            r'href="([^"]*pdfdirect[^"]*)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 3: 从 DOI URL 构造
        # /doi/full/10.xxxx/yyyy -> /doi/pdfdirect/10.xxxx/yyyy
        doi_match = re.search(r"/doi/(?:full|abs|epdf)/(10\.\d+/[^?#]+)", page_url)
        if doi_match:
            doi = doi_match.group(1)
            parsed = urlparse(page_url)
            return f"{parsed.scheme}://{parsed.netloc}/doi/pdfdirect/{doi}?download=true"

        return None


class TaylorFrancisHandler(BasePublisherHandler):
    """Taylor & Francis / Routledge"""

    publisher_name = "taylor_francis"
    url_patterns = ["tandfonline.com", "taylorandfrancis.com"]

    def extract_pdf_url(self, page_source: str, page_url: str) -> Optional[str]:
        # 方法 1: citation_pdf_url
        match = re.search(
            r'<meta[^>]+name="citation_pdf_url"[^>]+content="([^"]+)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 2: /doi/pdf/ 链接
        match = re.search(
            r'href="([^"]*doi/pdf/[^"]*)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 3: 从 URL 构造
        doi_match = re.search(r"/doi/(?:full|abs)/(10\.\d+/[^?#]+)", page_url)
        if doi_match:
            doi = doi_match.group(1)
            return f"https://www.tandfonline.com/doi/pdf/{doi}?download=true"

        return None


class IEEEHandler(BasePublisherHandler):
    """IEEE Xplore"""

    publisher_name = "ieee"
    url_patterns = ["ieeexplore.ieee.org"]

    def extract_pdf_url(self, page_source: str, page_url: str) -> Optional[str]:
        # IEEE 使用 stamp/stamp.jsp?arnumber=XXXX 模式
        arnumber_match = re.search(r"arnumber=(\d+)", page_url)
        if not arnumber_match:
            arnumber_match = re.search(r"/document/(\d+)", page_url)

        if arnumber_match:
            arnumber = arnumber_match.group(1)
            return f"https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber={arnumber}"

        # Fallback: 查找页面中的 PDF 链接
        match = re.search(
            r'href="([^"]*stamp/stamp\.jsp[^"]*)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        return None


class SageHandler(BasePublisherHandler):
    """SAGE Journals"""

    publisher_name = "sage"
    url_patterns = ["journals.sagepub.com", "sagepub.com"]

    def extract_pdf_url(self, page_source: str, page_url: str) -> Optional[str]:
        # 方法 1: citation_pdf_url
        match = re.search(
            r'<meta[^>]+name="citation_pdf_url"[^>]+content="([^"]+)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 2: /doi/pdf/ 模式
        doi_match = re.search(r"/doi/(?:full|abs)/(10\.\d+/[^?#]+)", page_url)
        if doi_match:
            doi = doi_match.group(1)
            return f"https://journals.sagepub.com/doi/pdf/{doi}"

        return None


class ACMHandler(BasePublisherHandler):
    """ACM Digital Library"""

    publisher_name = "acm"
    url_patterns = ["dl.acm.org"]

    def extract_pdf_url(self, page_source: str, page_url: str) -> Optional[str]:
        # ACM: /doi/pdf/10.xxxx
        match = re.search(
            r'href="([^"]*doi/pdf/[^"]*)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        doi_match = re.search(r"/doi/(?:abs|full|)/?(\d+\.\d+/[^?#]+)", page_url)
        if doi_match:
            doi = doi_match.group(1)
            return f"https://dl.acm.org/doi/pdf/{doi}"

        return None


class GenericHandler(BasePublisherHandler):
    """
    通用 Fallback 处理器

    尝试从页面中找到任何 PDF 链接。
    """

    publisher_name = "generic"
    url_patterns = []  # 匹配一切

    def can_handle(self, url: str) -> bool:
        return True  # 始终可处理（作为 fallback）

    def extract_pdf_url(self, page_source: str, page_url: str) -> Optional[str]:
        # 方法 1: citation_pdf_url meta 标签（许多出版商都支持）
        match = re.search(
            r'<meta[^>]+name="citation_pdf_url"[^>]+content="([^"]+)"',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        # 方法 2: 查找所有 href 中包含 .pdf 的链接
        pdf_links = re.findall(
            r'href="([^"]+\.pdf(?:\?[^"]*)?)"',
            page_source,
            re.IGNORECASE,
        )
        if pdf_links:
            # 优先选择包含 "download" 或 "full" 的链接
            for link in pdf_links:
                if "download" in link.lower() or "full" in link.lower():
                    return self._resolve_url(link, page_url)
            return self._resolve_url(pdf_links[0], page_url)

        # 方法 3: 查找 "Download PDF" 按钮
        match = re.search(
            r'<a[^>]+href="([^"]+)"[^>]*>[^<]*(?:Download|下载)\s*PDF[^<]*</a>',
            page_source,
            re.IGNORECASE,
        )
        if match:
            return self._resolve_url(match.group(1), page_url)

        return None


# ═══════════════════════════════════════════════════════════════
# 注册表
# ═══════════════════════════════════════════════════════════════


class PublisherHandlerRegistry:
    """
    出版商处理器注册表

    根据 URL 自动选择合适的 handler 提取 PDF 链接。
    """

    def __init__(self) -> None:
        self._handlers: List[BasePublisherHandler] = [
            ElsevierHandler(),
            SpringerHandler(),
            WileyHandler(),
            TaylorFrancisHandler(),
            IEEEHandler(),
            SageHandler(),
            ACMHandler(),
            GenericHandler(),  # fallback 必须放最后
        ]

    def get_handler(self, url: str) -> BasePublisherHandler:
        """根据 URL 获取匹配的处理器"""
        for handler in self._handlers:
            if handler.can_handle(url):
                return handler
        return self._handlers[-1]  # generic fallback

    def get_handler_name(self, url: str) -> str:
        """获取匹配的出版商名称"""
        return self.get_handler(url).publisher_name
