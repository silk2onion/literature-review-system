"""
简单内存缓存工具，用于：
- 文献检索结果缓存
- LLM 综述结果缓存

特点：
- 进程内字典缓存，适合当前开发阶段和单实例部署
- 支持 TTL（过期时间）
- 支持最大容量 + 简单 LRU 淘汰
"""
from __future__ import annotations

import time
import threading
from typing import Any, Dict, Hashable, Tuple, Optional


class InMemoryCache:
    """线程安全的简单内存缓存"""

    def __init__(self, max_size: int = 256, default_ttl: int = 3600) -> None:
        self.max_size = max_size
        self.default_ttl = default_ttl
        # key -> (expire_ts, value)
        self._store: Dict[Hashable, Tuple[float, Any]] = {}
        # key -> last_access_ts，用于简单 LRU
        self._access: Dict[Hashable, float] = {}
        self._lock = threading.Lock()

    def _now(self) -> float:
        return time.time()

    def _purge_expired(self) -> None:
        """清理过期条目"""
        now = self._now()
        expired_keys = [k for k, (ts, _) in self._store.items() if ts < now]
        for k in expired_keys:
            self._store.pop(k, None)
            self._access.pop(k, None)

    def _evict_if_needed(self) -> None:
        """超出容量时，淘汰最久未访问的若干 key"""
        if len(self._store) <= self.max_size:
            return
        # 按 last_access_ts 升序排序，优先淘汰最旧的
        sorted_keys = sorted(self._access.items(), key=lambda x: x[1])
        overflow = len(self._store) - self.max_size
        for i in range(overflow):
            key, _ = sorted_keys[i]
            self._store.pop(key, None)
            self._access.pop(key, None)

    def make_key(self, *parts: Hashable) -> Hashable:
        """统一的 key 构造方式，保证可 hash"""
        return tuple(parts)

    def get(self, key: Hashable) -> Optional[Any]:
        with self._lock:
            self._purge_expired()
            if key not in self._store:
                return None
            expire_ts, value = self._store[key]
            if expire_ts < self._now():
                # 再次兜底检查
                self._store.pop(key, None)
                self._access.pop(key, None)
                return None
            # 更新访问时间
            self._access[key] = self._now()
            return value

    def set(self, key: Hashable, value: Any, ttl: Optional[int] = None) -> None:
        expire_ts = self._now() + (ttl or self.default_ttl)
        with self._lock:
            self._store[key] = (expire_ts, value)
            self._access[key] = self._now()
            self._evict_if_needed()


# 单例缓存实例：一个用于文献搜索，一个用于 LLM 综述
search_cache = InMemoryCache(max_size=128, default_ttl=1800)  # 30 分钟
review_cache = InMemoryCache(max_size=128, default_ttl=7200)  # 2 小时