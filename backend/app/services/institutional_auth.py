"""
机构访问认证服务

通过 Selenium WebDriver 模拟大学 EZProxy / Shibboleth 登录，
获取认证 cookie 后转移到 requests.Session 进行高速 HTTP 下载。

典型流程：
1. Selenium 打开 EZProxy 登录页
2. 填写大学用户名/密码，提交
3. 等待认证完成（检测 URL 变化或特定元素）
4. 将浏览器 cookie 注入 requests.Session
5. 后续所有 PDF 下载使用该 Session（无需反复启动浏览器）
"""

import logging
import os
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import urlparse

import requests as req_lib

logger = logging.getLogger(__name__)


class InstitutionalAuthService:
    """
    机构认证服务（单例）

    管理 Selenium WebDriver 生命周期，提供认证 session 给 PDF 下载使用。
    """

    _instance: Optional["InstitutionalAuthService"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "InstitutionalAuthService":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True

        self._driver = None
        self._session: Optional[req_lib.Session] = None
        self._cookies: List[Dict] = []
        self._authenticated = False
        self._last_login_time: Optional[datetime] = None
        self._login_lock = threading.Lock()

        logger.info("[InstitutionalAuth] 服务初始化")

    # ═══════════════════════════════════════════════════════════════
    # 公共接口
    # ═══════════════════════════════════════════════════════════════

    @property
    def is_authenticated(self) -> bool:
        return self._authenticated and self._session is not None

    @property
    def last_login_time(self) -> Optional[datetime]:
        return self._last_login_time

    def login(
        self,
        login_url: str,
        username: str,
        password: str,
        auth_type: str = "ezproxy",
        headless: bool = True,
    ) -> bool:
        """
        执行机构登录

        Args:
            login_url: 登录页 URL（EZProxy 登录页或 Shibboleth IdP）
            username: 大学用户名
            password: 大学密码
            auth_type: "ezproxy" 或 "shibboleth"
            headless: 是否无头模式（MFA 需设为 False）

        Returns:
            True 表示登录成功
        """
        with self._login_lock:
            try:
                logger.info(
                    "[InstitutionalAuth] 开始 %s 登录: %s",
                    auth_type, login_url,
                )

                # 初始化 WebDriver
                self._init_driver(headless)

                if auth_type == "ezproxy":
                    success = self._login_ezproxy(login_url, username, password)
                elif auth_type == "shibboleth":
                    success = self._login_shibboleth(login_url, username, password)
                else:
                    logger.error("[InstitutionalAuth] 未知认证类型: %s", auth_type)
                    return False

                if success:
                    self._transfer_cookies()
                    self._authenticated = True
                    self._last_login_time = datetime.utcnow()
                    logger.info("[InstitutionalAuth] 登录成功，cookie 已转移到 Session")
                else:
                    logger.warning("[InstitutionalAuth] 登录失败")

                return success

            except Exception as e:
                logger.error("[InstitutionalAuth] 登录异常: %s", e)
                return False
            finally:
                # 登录完成后关闭浏览器，只保留 cookie
                self._quit_driver()

    def get_authenticated_session(self) -> Optional[req_lib.Session]:
        """
        获取已认证的 requests.Session

        Returns:
            认证后的 Session，未认证返回 None
        """
        if not self._authenticated or not self._session:
            return None
        return self._session

    def get_proxied_url(self, url: str, ezproxy_prefix: str = "") -> str:
        """
        给 URL 加 EZProxy 前缀

        Args:
            url: 原始 URL
            ezproxy_prefix: EZProxy 前缀，例如 "https://ezproxy.nottingham.ac.uk/login?url="

        Returns:
            代理后的 URL
        """
        if not ezproxy_prefix:
            from app.config import settings
            ezproxy_prefix = getattr(settings, "INSTITUTIONAL_EZPROXY_PREFIX", "")

        if not ezproxy_prefix:
            return url

        # 避免重复加前缀
        if ezproxy_prefix.rstrip("/") in url:
            return url

        return f"{ezproxy_prefix}{url}"

    def check_session_health(self) -> bool:
        """
        检查当前 session 是否仍然有效

        通过访问一个需要认证的页面来验证。
        """
        if not self._session:
            return False

        try:
            # 尝试访问 ScienceDirect 一个受限页面
            test_url = "https://www.sciencedirect.com/user/identity/landing"
            resp = self._session.get(test_url, timeout=10, allow_redirects=False)
            # 如果没有被重定向到登录页，说明 session 有效
            if resp.status_code in (200, 302):
                location = resp.headers.get("Location", "")
                if "login" not in location.lower() and "auth" not in location.lower():
                    return True
            return False
        except Exception as e:
            logger.debug("[InstitutionalAuth] Session 健康检查失败: %s", e)
            return False

    def close(self) -> None:
        """关闭所有资源"""
        self._quit_driver()
        if self._session:
            try:
                self._session.close()
            except Exception:
                pass
            self._session = None
        self._authenticated = False
        self._cookies = []
        logger.info("[InstitutionalAuth] 服务已关闭")

    def download_pdf_via_selenium(
        self,
        article_url: str,
        save_path: str,
        ezproxy_prefix: str = "",
        headless: bool = True,
    ) -> Optional[str]:
        """
        使用 undetected_chromedriver 下载 PDF（绕过 Cloudflare 反爬）

        流程：
        1. 用 undetected_chromedriver 打开可见浏览器（Cloudflare 检测 headless）
        2. 通过 EZProxy → Shibboleth 完成机构认证
        3. 到达文章页后，用 JS 点击 "View PDF" 按钮
        4. 如果遇到 Cloudflare Turnstile 验证，用人类模拟鼠标点击
        5. 如果自动点击失败，等待用户手动介入（最多 120 秒）
        6. 检测下载目录中的新 PDF 文件

        Args:
            article_url: 文章页 URL
            save_path: PDF 保存路径
            ezproxy_prefix: EZProxy 前缀
            headless: 忽略此参数（强制 headless=False 以绕过 Cloudflare）

        Returns:
            保存路径，失败返回 None
        """
        import glob
        import random
        import re as _re
        from urllib.parse import urlparse

        try:
            import undetected_chromedriver as uc
        except ImportError:
            logger.error("[InstitutionalAuth] 需要安装 undetected-chromedriver: pip install undetected-chromedriver")
            return None

        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains

        download_dir = os.path.dirname(save_path)
        os.makedirs(download_dir, exist_ok=True)
        existing_pdfs = set(glob.glob(os.path.join(download_dir, "*.pdf")))

        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        prefs = {
            "download.default_directory": download_dir,
            "download.prompt_for_download": False,
            "plugins.always_open_pdf_externally": True,
        }
        options.add_experimental_option("prefs", prefs)

        driver = None
        try:
            # 强制可见浏览器 — Cloudflare 检测 headless
            driver = uc.Chrome(options=options, headless=False)
            driver.set_page_load_timeout(90)

            # ── Step 1: EZProxy + Shibboleth 认证 ──
            target_url = self.get_proxied_url(article_url, ezproxy_prefix)
            logger.info("[PDF-Selenium] Step 1: 访问 %s", target_url[:100])
            driver.get(target_url)
            time.sleep(3)

            # 处理认证重定向链（EZProxy → Shibboleth → 文章页）
            from app.config import settings
            for _step in range(10):
                url = driver.current_url.lower()
                if any(kw in url for kw in ["login", "idp", "shibboleth", "signin", "auth"]):
                    self._auto_login_in_driver(
                        driver,
                        getattr(settings, "INSTITUTIONAL_USERNAME", ""),
                        getattr(settings, "INSTITUTIONAL_PASSWORD", ""),
                    )
                    time.sleep(5)
                elif "sciencedirect" in url or "springer" in url or "wiley" in url or "tandfonline" in url:
                    break
                else:
                    time.sleep(3)

            logger.info("[PDF-Selenium] Step 2: 文章页 %s", driver.current_url[:100])
            time.sleep(5)  # 等 JS 完全加载

            # ── Step 2: 用 JS 点击 "View PDF" 按钮 ──
            clicked = False
            pdf_selectors = [
                "a.link-button-primary",
                "a.ViewPDF",
                "a[class*='ViewPDF']",
                "a[class*='accessbar-utility']",
                "a[href*='pdfft']",
                "a[href*='/pdf/']",
                "a[href*='.pdf']",
                "a[data-article-pdf]",
                "a.c-pdf-download",
            ]

            for sel in pdf_selectors:
                try:
                    elements = driver.find_elements(By.CSS_SELECTOR, sel)
                    for el in elements:
                        if not el.is_displayed():
                            continue
                        text = (el.text or "").lower()
                        href = (el.get_attribute("href") or "").lower()
                        if "pdf" in text or "view" in text or "download" in text or "pdf" in href:
                            logger.info("[PDF-Selenium] 点击: '%s'", el.text.strip()[:30])
                            # 人类模拟：先移动鼠标到按钮附近，再点击
                            self._human_click(driver, el)
                            clicked = True
                            break
                    if clicked:
                        break
                except Exception:
                    continue

            if not clicked:
                logger.warning("[PDF-Selenium] 未找到 PDF 按钮")
                self._save_debug_screenshot_driver(driver, "no_pdf_button")
                return None

            # ── Step 3: 等待并处理 Cloudflare Turnstile ──
            time.sleep(5)

            # 切换到新标签页（如果有）
            if len(driver.window_handles) > 1:
                driver.switch_to.window(driver.window_handles[-1])
                time.sleep(3)

            logger.info("[PDF-Selenium] Step 3: 点击后 URL=%s", driver.current_url[:100])

            # 检测并处理 Cloudflare Turnstile 验证
            turnstile_solved = self._handle_turnstile(driver)
            if turnstile_solved:
                logger.info("[PDF-Selenium] Turnstile 验证已通过")
                time.sleep(5)

            # ── Step 4: 等待下载完成 ──
            # 先快速检查（自动下载可能已经开始）
            downloaded = self._find_downloaded_pdf_new(download_dir, existing_pdfs, timeout=20)
            if downloaded:
                return self._finalize_download(downloaded, save_path)

            # 如果还没下载，可能还在 Turnstile 或 PDF viewer 页面
            # 给用户时间手动介入
            page_text = driver.page_source.lower()
            if "verify" in page_text or "challenge" in page_text or "captcha" in page_text:
                logger.info(
                    "[PDF-Selenium] 检测到验证页面，等待用户手动完成（最多 120 秒）..."
                )
                downloaded = self._find_downloaded_pdf_new(download_dir, existing_pdfs, timeout=120)
                if downloaded:
                    return self._finalize_download(downloaded, save_path)

            # 最后尝试：如果在 PDF viewer 页面，用 CDP printToPDF 保存
            try:
                content_type = driver.execute_script("return document.contentType;")
                if content_type == "application/pdf":
                    import base64
                    result = driver.execute_cdp_cmd("Page.printToPDF", {})
                    pdf_data = base64.b64decode(result["data"])
                    if len(pdf_data) > 5000:
                        os.makedirs(os.path.dirname(save_path), exist_ok=True)
                        with open(save_path, "wb") as f:
                            f.write(pdf_data)
                        logger.info("[PDF-Selenium] CDP printToPDF 保存: %s", save_path)
                        return save_path
            except Exception:
                pass

            logger.warning("[PDF-Selenium] 下载未完成, URL=%s", driver.current_url[:100])
            self._save_debug_screenshot_driver(driver, "download_incomplete")
            return None

        except Exception as e:
            logger.error("[PDF-Selenium] 异常: %s", e)
            return None
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

    def _human_click(self, driver, element) -> None:
        """模拟人类鼠标移动 + 点击（随机轨迹、随机延迟）"""
        import random
        from selenium.webdriver.common.action_chains import ActionChains

        try:
            actions = ActionChains(driver)

            # 先随机移动几次（模拟人类手抖）
            for _ in range(random.randint(2, 4)):
                x_off = random.randint(-100, 100)
                y_off = random.randint(-50, 50)
                actions.move_by_offset(x_off, y_off)
                actions.pause(random.uniform(0.1, 0.3))

            # 移动到目标元素（带随机偏移）
            x_jitter = random.randint(-3, 3)
            y_jitter = random.randint(-3, 3)
            actions.move_to_element_with_offset(element, x_jitter, y_jitter)
            actions.pause(random.uniform(0.3, 0.8))

            # 点击
            actions.click()
            actions.perform()
        except Exception:
            # Fallback: JS 点击
            try:
                driver.execute_script("arguments[0].click();", element)
            except Exception:
                element.click()

    def _handle_turnstile(self, driver, max_attempts: int = 3) -> bool:
        """
        处理 Cloudflare Turnstile 验证

        尝试自动点击验证复选框，用人类模拟鼠标行为。
        """
        import random
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains

        for attempt in range(max_attempts):
            page_text = driver.page_source.lower()
            if "verify" not in page_text and "challenge" not in page_text:
                return True  # 没有验证或已通过

            logger.info("[PDF-Selenium] Turnstile 验证 (attempt %d/%d)", attempt + 1, max_attempts)

            # 查找 Turnstile iframe
            try:
                iframes = driver.find_elements(
                    By.CSS_SELECTOR,
                    "iframe[src*='challenge'], iframe[src*='turnstile'], "
                    "iframe[title*='challenge'], iframe[title*='Widget']"
                )

                for iframe in iframes:
                    try:
                        driver.switch_to.frame(iframe)
                        time.sleep(random.uniform(1.0, 2.0))

                        # 找复选框
                        checkboxes = driver.find_elements(
                            By.CSS_SELECTOR,
                            "input[type='checkbox'], .cb-lb, .ctp-checkbox-label, "
                            "[role='checkbox'], label"
                        )

                        for cb in checkboxes:
                            if cb.is_displayed():
                                # 人类模拟点击
                                self._human_click(driver, cb)
                                logger.info("[PDF-Selenium] 点击了 Turnstile 复选框")
                                time.sleep(random.uniform(3.0, 6.0))
                                break

                        driver.switch_to.default_content()
                    except Exception:
                        driver.switch_to.default_content()
            except Exception:
                pass

            # 也尝试直接在页面上点击验证按钮
            try:
                verify_btns = driver.find_elements(
                    By.CSS_SELECTOR,
                    "input[type='checkbox'][id*='challenge'], "
                    "div[class*='checkbox'], span[class*='cb']"
                )
                for btn in verify_btns:
                    if btn.is_displayed():
                        self._human_click(driver, btn)
                        time.sleep(random.uniform(3.0, 5.0))
                        break
            except Exception:
                pass

            time.sleep(5)

        return False

    def _find_downloaded_pdf_new(
        self, directory: str, existing: set, timeout: int = 30
    ) -> Optional[str]:
        """在下载目录中查找新出现的 PDF 文件"""
        import glob

        start = time.time()
        while time.time() - start < timeout:
            # 等 .crdownload 完成
            crdownloads = glob.glob(os.path.join(directory, "*.crdownload"))
            if crdownloads:
                time.sleep(2)
                continue

            # 找新 PDF
            current = set(glob.glob(os.path.join(directory, "*.pdf")))
            new_pdfs = current - existing
            if new_pdfs:
                newest = max(new_pdfs, key=os.path.getmtime)
                if os.path.getsize(newest) > 5000:  # 至少 5KB
                    return newest
            time.sleep(2)
        return None

    def _finalize_download(self, downloaded: str, save_path: str) -> str:
        """重命名下载的文件到目标路径"""
        if downloaded != save_path:
            if os.path.exists(save_path):
                os.remove(save_path)
            os.rename(downloaded, save_path)
        logger.info("[PDF-Selenium] PDF 已保存: %s (%d KB)", save_path, os.path.getsize(save_path) // 1024)
        return save_path

    def _auto_login_in_driver(self, driver, username: str, password: str) -> None:
        """在已打开的 driver 中尝试自动登录"""
        from selenium.webdriver.common.by import By

        try:
            # 尝试找用户名/密码字段
            user_selectors = [
                (By.NAME, "user"), (By.NAME, "username"),
                (By.ID, "username"), (By.ID, "user"),
                (By.CSS_SELECTOR, "input[type='text']"),
                (By.CSS_SELECTOR, "input[type='email']"),
            ]
            pass_selectors = [
                (By.NAME, "pass"), (By.NAME, "password"),
                (By.ID, "password"), (By.CSS_SELECTOR, "input[type='password']"),
            ]

            user_field = None
            for by, sel in user_selectors:
                try:
                    el = driver.find_element(by, sel)
                    if el.is_displayed():
                        user_field = el
                        break
                except Exception:
                    continue

            pass_field = None
            for by, sel in pass_selectors:
                try:
                    el = driver.find_element(by, sel)
                    if el.is_displayed():
                        pass_field = el
                        break
                except Exception:
                    continue

            if user_field and pass_field:
                user_field.clear()
                user_field.send_keys(username)
                pass_field.clear()
                pass_field.send_keys(password)

                # 提交
                submit_selectors = [
                    (By.CSS_SELECTOR, "input[type='submit']"),
                    (By.CSS_SELECTOR, "button[type='submit']"),
                    (By.CSS_SELECTOR, "button"),
                ]
                for by, sel in submit_selectors:
                    try:
                        btn = driver.find_element(by, sel)
                        if btn.is_displayed():
                            btn.click()
                            time.sleep(3)
                            break
                    except Exception:
                        continue
        except Exception as e:
            logger.debug("[InstitutionalAuth] 自动登录尝试失败: %s", e)

    def _find_downloaded_pdf(self, directory: str, timeout: int = 30) -> Optional[str]:
        """在下载目录中查找最新的 PDF 文件"""
        import glob

        start = time.time()
        while time.time() - start < timeout:
            # 检查是否有 .crdownload 文件（Chrome 下载中）
            downloading = glob.glob(os.path.join(directory, "*.crdownload"))
            if downloading:
                time.sleep(2)
                continue

            # 找最新的 PDF 文件
            pdfs = glob.glob(os.path.join(directory, "*.pdf"))
            if pdfs:
                newest = max(pdfs, key=os.path.getmtime)
                # 确保文件不是空的
                if os.path.getsize(newest) > 1000:
                    return newest
            time.sleep(1)
        return None

    def _save_debug_screenshot_driver(self, driver, name: str) -> None:
        """用指定 driver 保存调试截图"""
        try:
            from app.config import settings as app_settings
            debug_dir = os.path.join(app_settings.PAPERS_PATH, "debug")
            os.makedirs(debug_dir, exist_ok=True)
            path = os.path.join(debug_dir, f"{name}_{int(time.time())}.png")
            driver.save_screenshot(path)
            logger.debug("[InstitutionalAuth] 截图: %s", path)
        except Exception:
            pass

    def get_status(self) -> Dict:
        """获取当前状态信息"""
        return {
            "authenticated": self._authenticated,
            "last_login_time": (
                self._last_login_time.isoformat() if self._last_login_time else None
            ),
            "cookie_count": len(self._cookies),
            "session_active": self._session is not None,
        }

    # ═══════════════════════════════════════════════════════════════
    # 登录实现
    # ═══════════════════════════════════════════════════════════════

    def _login_ezproxy(self, login_url: str, username: str, password: str) -> bool:
        """
        EZProxy 登录

        大多数大学的 EZProxy 登录页面包含一个简单的用户名/密码表单。
        """
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait

        driver = self._driver
        if not driver:
            return False

        try:
            driver.get(login_url)
            wait = WebDriverWait(driver, 30)

            # 等待登录表单出现 — 尝试多种常见的表单选择器
            username_field = None
            password_field = None

            # EZProxy 常见的字段名/ID
            username_selectors = [
                (By.NAME, "user"),
                (By.NAME, "username"),
                (By.NAME, "login"),
                (By.ID, "username"),
                (By.ID, "user"),
                (By.CSS_SELECTOR, "input[type='text']"),
                (By.CSS_SELECTOR, "input[type='email']"),
            ]

            password_selectors = [
                (By.NAME, "pass"),
                (By.NAME, "password"),
                (By.NAME, "passwd"),
                (By.ID, "password"),
                (By.ID, "pass"),
                (By.CSS_SELECTOR, "input[type='password']"),
            ]

            for by, selector in username_selectors:
                try:
                    username_field = wait.until(
                        EC.presence_of_element_located((by, selector))
                    )
                    if username_field and username_field.is_displayed():
                        break
                    username_field = None
                except Exception:
                    continue

            for by, selector in password_selectors:
                try:
                    password_field = driver.find_element(by, selector)
                    if password_field and password_field.is_displayed():
                        break
                    password_field = None
                except Exception:
                    continue

            if not username_field or not password_field:
                logger.error("[InstitutionalAuth] 未找到登录表单字段")
                # 保存截图用于调试
                self._save_debug_screenshot("ezproxy_no_form")
                return False

            # 填写凭据
            username_field.clear()
            username_field.send_keys(username)
            password_field.clear()
            password_field.send_keys(password)

            # 提交表单 — 尝试找提交按钮
            submit_selectors = [
                (By.CSS_SELECTOR, "input[type='submit']"),
                (By.CSS_SELECTOR, "button[type='submit']"),
                (By.CSS_SELECTOR, "input[name='login']"),
                (By.CSS_SELECTOR, "button"),
            ]

            submitted = False
            for by, selector in submit_selectors:
                try:
                    btn = driver.find_element(by, selector)
                    if btn and btn.is_displayed():
                        btn.click()
                        submitted = True
                        break
                except Exception:
                    continue

            if not submitted:
                # Fallback: 回车提交
                from selenium.webdriver.common.keys import Keys
                password_field.send_keys(Keys.RETURN)

            # 等待登录完成 — URL 变化或出现特定元素
            time.sleep(3)

            # 检查是否登录成功：URL 不再包含 login
            current_url = driver.current_url
            if "login" in current_url.lower() and "error" in driver.page_source.lower():
                logger.warning("[InstitutionalAuth] EZProxy 登录似乎失败，可能凭据错误")
                self._save_debug_screenshot("ezproxy_login_failed")
                return False

            logger.info("[InstitutionalAuth] EZProxy 登录完成，当前 URL: %s", current_url)
            return True

        except Exception as e:
            logger.error("[InstitutionalAuth] EZProxy 登录异常: %s", e)
            self._save_debug_screenshot("ezproxy_exception")
            return False

    def _login_shibboleth(self, login_url: str, username: str, password: str) -> bool:
        """
        Shibboleth / OpenAthens 登录

        联合认证流程：
        1. 访问资源 URL → 被重定向到 IdP
        2. 在 IdP 页面填写凭据
        3. 认证后重定向回 SP

        很多大学的 Shibboleth 登录页面 URL 包含 "idp" 或 "shibboleth"
        """
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait

        driver = self._driver
        if not driver:
            return False

        try:
            driver.get(login_url)
            wait = WebDriverWait(driver, 45)

            # Shibboleth 认证通常经过多次重定向
            # 等待最终出现用户名字段
            username_field = None
            password_field = None

            # Shibboleth IdP 常见字段
            username_selectors = [
                (By.ID, "username"),
                (By.NAME, "j_username"),
                (By.NAME, "username"),
                (By.NAME, "UserName"),
                (By.CSS_SELECTOR, "input[type='text']"),
                (By.CSS_SELECTOR, "input[type='email']"),
            ]

            password_selectors = [
                (By.ID, "password"),
                (By.NAME, "j_password"),
                (By.NAME, "password"),
                (By.NAME, "Password"),
                (By.CSS_SELECTOR, "input[type='password']"),
            ]

            # 等待页面加载（可能有多次重定向）
            time.sleep(3)

            for by, selector in username_selectors:
                try:
                    username_field = wait.until(
                        EC.presence_of_element_located((by, selector))
                    )
                    if username_field and username_field.is_displayed():
                        break
                    username_field = None
                except Exception:
                    continue

            for by, selector in password_selectors:
                try:
                    password_field = driver.find_element(by, selector)
                    if password_field and password_field.is_displayed():
                        break
                    password_field = None
                except Exception:
                    continue

            if not username_field or not password_field:
                logger.error("[InstitutionalAuth] Shibboleth: 未找到登录表单")
                self._save_debug_screenshot("shibboleth_no_form")
                return False

            # 填写凭据并提交
            username_field.clear()
            username_field.send_keys(username)
            password_field.clear()
            password_field.send_keys(password)

            # 查找提交按钮
            submit_selectors = [
                (By.CSS_SELECTOR, "button[type='submit']"),
                (By.CSS_SELECTOR, "input[type='submit']"),
                (By.CSS_SELECTOR, ".btn-submit"),
                (By.CSS_SELECTOR, "#login-btn"),
                (By.XPATH, "//button[contains(text(),'Login')]"),
                (By.XPATH, "//button[contains(text(),'Sign in')]"),
                (By.XPATH, "//input[@value='Login']"),
            ]

            submitted = False
            for by, selector in submit_selectors:
                try:
                    btn = driver.find_element(by, selector)
                    if btn and btn.is_displayed():
                        btn.click()
                        submitted = True
                        break
                except Exception:
                    continue

            if not submitted:
                from selenium.webdriver.common.keys import Keys
                password_field.send_keys(Keys.RETURN)

            # 等待认证完成 — Shibboleth 认证后通常会重定向回原站
            # 检测：URL 不再包含 idp/shibboleth/login
            max_wait = 60  # 最多等 60 秒（可能有 MFA）
            start = time.time()
            while time.time() - start < max_wait:
                current_url = driver.current_url.lower()
                if all(
                    kw not in current_url
                    for kw in ["idp", "shibboleth", "login", "auth", "signin"]
                ):
                    logger.info(
                        "[InstitutionalAuth] Shibboleth 认证完成, URL: %s",
                        driver.current_url,
                    )
                    return True
                time.sleep(2)

            # 超时 — 可能需要 MFA
            logger.warning(
                "[InstitutionalAuth] Shibboleth 登录超时 (可能需要 MFA), URL: %s",
                driver.current_url,
            )
            self._save_debug_screenshot("shibboleth_timeout")

            # 即使超时，也检查一下是否其实已经认证了
            page_source = driver.page_source.lower()
            if "error" in page_source or "invalid" in page_source:
                return False

            # 如果只是停在 MFA 页面但没有错误，可能用户需要手动操作
            return False

        except Exception as e:
            logger.error("[InstitutionalAuth] Shibboleth 登录异常: %s", e)
            self._save_debug_screenshot("shibboleth_exception")
            return False

    # ═══════════════════════════════════════════════════════════════
    # WebDriver 管理
    # ═══════════════════════════════════════════════════════════════

    def _init_driver(self, headless: bool = True) -> None:
        """初始化 Chrome WebDriver"""
        # 先关闭旧的
        self._quit_driver()

        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service

        options = Options()
        if headless:
            options.add_argument("--headless=new")

        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument(
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        )
        # 禁用自动化检测标志
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        # 设置下载目录
        from app.config import settings
        import os

        download_dir = os.path.join(settings.PAPERS_PATH, "pdfs")
        os.makedirs(download_dir, exist_ok=True)

        prefs = {
            "download.default_directory": download_dir,
            "download.prompt_for_download": False,
            "plugins.always_open_pdf_externally": True,
        }
        options.add_experimental_option("prefs", prefs)

        try:
            self._driver = webdriver.Chrome(options=options)
            self._driver.set_page_load_timeout(60)
            logger.info(
                "[InstitutionalAuth] Chrome WebDriver 已启动 (headless=%s)",
                headless,
            )
        except Exception as e:
            logger.error("[InstitutionalAuth] WebDriver 启动失败: %s", e)
            raise

    def _quit_driver(self) -> None:
        """关闭 WebDriver"""
        if self._driver:
            try:
                self._driver.quit()
            except Exception:
                pass
            self._driver = None

    def _transfer_cookies(self) -> None:
        """将 Selenium 浏览器 cookie 转移到 requests.Session"""
        if not self._driver:
            return

        self._cookies = self._driver.get_cookies()

        session = req_lib.Session()
        session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
        })

        for cookie in self._cookies:
            session.cookies.set(
                cookie["name"],
                cookie["value"],
                domain=cookie.get("domain", ""),
                path=cookie.get("path", "/"),
            )

        # 关闭旧 session
        if self._session:
            try:
                self._session.close()
            except Exception:
                pass

        self._session = session
        logger.info(
            "[InstitutionalAuth] 已转移 %d 个 cookie 到 requests.Session",
            len(self._cookies),
        )

    def _save_debug_screenshot(self, name: str) -> None:
        """保存调试截图"""
        if not self._driver:
            return
        try:
            import os
            from app.config import settings

            debug_dir = os.path.join(settings.PAPERS_PATH, "debug")
            os.makedirs(debug_dir, exist_ok=True)

            path = os.path.join(debug_dir, f"{name}_{int(time.time())}.png")
            self._driver.save_screenshot(path)
            logger.debug("[InstitutionalAuth] 调试截图已保存: %s", path)
        except Exception as e:
            logger.debug("[InstitutionalAuth] 截图保存失败: %s", e)


# ═══════════════════════════════════════════════════════════════
# 模块级单例访问
# ═══════════════════════════════════════════════════════════════

_auth_service: Optional[InstitutionalAuthService] = None


def get_institutional_auth_service() -> InstitutionalAuthService:
    """获取机构认证服务单例"""
    global _auth_service
    if _auth_service is None:
        _auth_service = InstitutionalAuthService()
    return _auth_service
