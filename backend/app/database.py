"""
数据库初始化和会话管理
"""
import re
import json
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
from app.config import settings

logger = logging.getLogger(__name__)

# 创建数据库引擎
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
    echo=settings.DEBUG  # 开发模式下打印SQL
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建基类
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    获取数据库会话
    用于FastAPI的依赖注入
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_review_columns():
    """
    为 reviews 表添加 conclusion 和 references_json 列（幂等操作）。
    无 Alembic 环境下的手动 ALTER TABLE 迁移。
    """
    raw_conn = engine.raw_connection()
    try:
        cursor = raw_conn.cursor()
        cursor.execute("PRAGMA table_info(reviews)")
        existing_columns = {row[1] for row in cursor.fetchall()}

        if "conclusion" not in existing_columns:
            cursor.execute("ALTER TABLE reviews ADD COLUMN conclusion TEXT")
            logger.info("✅ 已添加 reviews.conclusion 列")

        if "references_json" not in existing_columns:
            cursor.execute("ALTER TABLE reviews ADD COLUMN references_json TEXT")  # SQLite JSON 存储为 TEXT
            logger.info("✅ 已添加 reviews.references_json 列")

        raw_conn.commit()
    except Exception as e:
        logger.error(f"❌ 迁移 review 列失败: {e}")
        raw_conn.rollback()
    finally:
        raw_conn.close()


def _backfill_review_data():
    """
    从 analysis_json 和 content 回填 conclusion 字段。
    从 analysis_json.references_markdown 回填 references_json（基础格式）。
    仅处理尚未填充的记录（幂等）。
    """
    db = SessionLocal()
    try:
        from app.models.review import Review

        # --- 回填 conclusion ---
        reviews_without_conclusion = (
            db.query(Review)
            .filter(Review.conclusion.is_(None))
            .all()
        )
        backfilled_conclusion = 0
        for review in reviews_without_conclusion:
            conclusion_text = None

            # 优先从 analysis_json["conclusion"] 读取
            if review.analysis_json and isinstance(review.analysis_json, dict):
                conclusion_text = review.analysis_json.get("conclusion")

            # 如果 analysis_json 无 conclusion，尝试从 content 正文中提取
            if not conclusion_text and review.content:
                match = re.search(
                    r'##\s*Conclusion[s]?\s*\n(.*?)(?=\n##\s|\Z)',
                    review.content, re.DOTALL | re.IGNORECASE
                )
                if match:
                    conclusion_text = match.group(1).strip()

            if conclusion_text:
                review.conclusion = conclusion_text
                backfilled_conclusion += 1

        if backfilled_conclusion > 0:
            db.commit()
            logger.info(f"✅ 回填了 {backfilled_conclusion} 条 review 的 conclusion 字段")

        # --- 回填 references_json ---
        # 从 analysis_json 中的 citation_map + references_markdown 构建基础 references_json
        reviews_without_refs = (
            db.query(Review)
            .filter(Review.references_json.is_(None))
            .all()
        )
        backfilled_refs = 0
        for review in reviews_without_refs:
            if not review.analysis_json or not isinstance(review.analysis_json, dict):
                continue

            citation_map = review.analysis_json.get("citation_map")
            references_md = review.analysis_json.get("references_markdown", "")

            if not citation_map and not references_md:
                continue

            # 从 citation_map 构建 items
            items = []
            if citation_map and isinstance(citation_map, dict):
                for idx, (citation_key, paper_info) in enumerate(citation_map.items()):
                    item = {
                        "order_index": idx + 1,
                        "citation_key": citation_key,
                        "formatted": "",  # 将从 references_md 中匹配
                        "raw": {}
                    }
                    if isinstance(paper_info, dict):
                        item["paper_id"] = paper_info.get("paper_id")
                        item["raw"] = {
                            "title": paper_info.get("title", ""),
                            "authors": paper_info.get("authors", ""),
                            "year": paper_info.get("year"),
                            "doi": paper_info.get("doi", ""),
                        }
                    elif isinstance(paper_info, (int, str)):
                        item["paper_id"] = int(paper_info) if str(paper_info).isdigit() else None

                    items.append(item)

            # 尝试从 references_markdown 提取 formatted 文本
            if references_md and items:
                ref_lines = [
                    line.lstrip("- ").strip()
                    for line in references_md.split("\n")
                    if line.strip() and not line.strip().startswith("#")
                ]
                for i, item in enumerate(items):
                    if i < len(ref_lines):
                        item["formatted"] = ref_lines[i]

            if items:
                review.references_json = {"style": "harvard", "items": items}
                backfilled_refs += 1

        if backfilled_refs > 0:
            db.commit()
            logger.info(f"✅ 回填了 {backfilled_refs} 条 review 的 references_json 字段")

        # --- 用 composer 重组 content ---
        # 仅对已回填的 review 重组（确保 content 包含所有部分）
        if backfilled_conclusion > 0 or backfilled_refs > 0:
            from app.services.document_composer import compose_full_document
            all_reviews = db.query(Review).filter(Review.status == "completed").all()
            recomposed = 0
            for review in all_reviews:
                new_content = compose_full_document(review)
                if new_content and new_content != review.content:
                    review.content = new_content
                    recomposed += 1
            if recomposed > 0:
                db.commit()
                logger.info(f"✅ 用 composer 重组了 {recomposed} 条 review 的 content 字段")

    except Exception as e:
        logger.error(f"❌ 回填 review 数据失败: {e}")
        db.rollback()
    finally:
        db.close()


def _migrate_crawl_job_columns():
    """
    为 crawl_jobs 表添加 exhaustive 列（幂等操作）。
    """
    raw_conn = engine.raw_connection()
    try:
        cursor = raw_conn.cursor()
        cursor.execute("PRAGMA table_info(crawl_jobs)")
        existing_columns = {row[1] for row in cursor.fetchall()}

        if "exhaustive" not in existing_columns:
            cursor.execute("ALTER TABLE crawl_jobs ADD COLUMN exhaustive BOOLEAN DEFAULT 0 NOT NULL")
            logger.info("✅ 已添加 crawl_jobs.exhaustive 列")

        raw_conn.commit()
    except Exception as e:
        logger.error(f"❌ 迁移 crawl_jobs 列失败: {e}")
        raw_conn.rollback()
    finally:
        raw_conn.close()


def _migrate_prisma_columns():
    """
    为 PRISMA 筛选附属功能添加新列（幂等操作）。
    - staging_papers: screening_stage, exclusion_reason
    - crawl_jobs: search_strategy
    """
    raw_conn = engine.raw_connection()
    try:
        cursor = raw_conn.cursor()

        # --- staging_papers 表 ---
        cursor.execute("PRAGMA table_info(staging_papers)")
        staging_columns = {row[1] for row in cursor.fetchall()}

        if "screening_stage" not in staging_columns:
            cursor.execute(
                "ALTER TABLE staging_papers ADD COLUMN screening_stage VARCHAR(20) DEFAULT 'identification'"
            )
            logger.info("✅ 已添加 staging_papers.screening_stage 列")

        if "exclusion_reason" not in staging_columns:
            cursor.execute("ALTER TABLE staging_papers ADD COLUMN exclusion_reason TEXT")
            logger.info("✅ 已添加 staging_papers.exclusion_reason 列")

        # --- crawl_jobs 表 ---
        cursor.execute("PRAGMA table_info(crawl_jobs)")
        crawl_columns = {row[1] for row in cursor.fetchall()}

        if "search_strategy" not in crawl_columns:
            cursor.execute("ALTER TABLE crawl_jobs ADD COLUMN search_strategy TEXT")  # SQLite JSON 存储为 TEXT
            logger.info("✅ 已添加 crawl_jobs.search_strategy 列")

        raw_conn.commit()
    except Exception as e:
        logger.error(f"❌ 迁移 PRISMA 列失败: {e}")
        raw_conn.rollback()
    finally:
        raw_conn.close()


def init_db():
    """
    初始化数据库
    创建所有表 + 执行幂等迁移 + 回填旧数据
    """
    # 导入所有模型以确保它们被注册
    from app import models  # noqa: F401
    
    # 创建所有表
    Base.metadata.create_all(bind=engine)
    print("✅ 数据库表创建成功！")

    # 幂等迁移：为已有数据库添加新列
    _migrate_review_columns()
    _migrate_crawl_job_columns()
    _migrate_prisma_columns()

    # 回填旧数据
    _backfill_review_data()


def drop_db():
    """
    删除所有表（谨慎使用！）
    """
    Base.metadata.drop_all(bind=engine)
    print("⚠️ 所有数据库表已删除！")