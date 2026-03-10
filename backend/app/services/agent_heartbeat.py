import asyncio
import logging
from datetime import datetime
from app.services.task_runner import list_tasks
from app.services.agent_broadcast import broadcast_manager
from app.services.llm.openai_service import OpenAIService
from app.config import settings

logger = logging.getLogger(__name__)

MAID_PROMPT = """
你是一个可爱的人工智能女仆助手。
你的任务是根据给出的任务状态更新信息，向你的主人汇报进度。
你的语气必须非常软萌、懂事、有点小俏皮，经常使用“主人”、“~”、“哒”、“呢”、“呜”、“哇”等词汇。

【当前任务进展】
{status_update}

【要求】
1. 用一段简短的话（不超过60字）汇报进度。
2. 保持萌妹女仆的人设，绝对不要机械化。
3. 如果任务完成了，要表现得很开心（比如“主人快来看看呀~”）并请主人检阅。
4. 如果任务失败了，要表现得很抱歉并安慰主人。
5. 如果正在进行中，要给主人加油打气。
"""

class AgentHeartbeatService:
    def __init__(self):
        self.last_states = {} # task_id -> last_status
        self.is_running = False
    
    async def start(self):
        if self.is_running: return
        self.is_running = True
        asyncio.create_task(self._loop())

    async def _loop(self):
        logger.info("Agent proactive heartbeat loop started.")
        while self.is_running:
            try:
                # 检查频率 (1分钟)
                tasks = list_tasks()
                for task in tasks:
                    tid = task["task_id"]
                    status = task["status"]
                    last_status = self.last_states.get(tid)
                    
                    if status != last_status:
                        # 状态变化，触发主动提醒
                        self.last_states[tid] = status
                        # 如果是新任务或者是重要状态变更（done/failed），触发提醒
                        if last_status is not None or status in ["done", "failed"]:
                            await self._proactive_notify(task)
                
                await asyncio.sleep(60) # 1 minute
            except Exception as e:
                logger.error(f"Heartbeat loop error: {e}")
                await asyncio.sleep(10)

    async def _proactive_notify(self, task):
        # 使用 LLM 格式化女仆话语
        llm = OpenAIService(settings=settings)
        status_msg = f"任务 {task['task_id']} ({task['topic']}) 现在的状态变更为: {task['status']}。"
        if task['status'] == 'done':
            status_msg += " 综述已经全部生成完毕。任务成功了。"
        elif task['status'] == 'failed':
            status_msg += f" 任务中途遇到了一些麻烦，失败了。错误信息是：{task.get('error')}"
        elif task['status'] == 'running':
            # 找到当前步骤
            steps = task.get("steps", [])
            current_step = next((s for s in steps if s["status"] == "running"), None)
            if current_step:
                status_msg += f" 现在正在努力执行：{current_step['label']} 哦！"

        prompt = MAID_PROMPT.format(status_update=status_msg)
        try:
            reply = await llm.complete(prompt=prompt, system_prompt="你是一个名为“小爱”的萌妹女仆助手。", temperature=0.8)
            
            # 广播给所有客户端
            await broadcast_manager.broadcast({
                "type": "proactive_notification",
                "role": "assistant",
                "content": reply,
                "task_id": task["task_id"],
                "timestamp": datetime.now().isoformat()
            })
            logger.info(f"Broadcasted proactive notification for task {task['task_id']}")
        except Exception as e:
            logger.error(f"Failed to generate proactive notification: {e}")

heartbeat_service = AgentHeartbeatService()
