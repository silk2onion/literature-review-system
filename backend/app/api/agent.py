"""
AI Agent 对话 API 路由
"""
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.agent_service import get_agent_service

router = APIRouter(prefix="/api/agent", tags=["agent"])


class ChatMessage(BaseModel):
    role: str = Field(..., description="消息角色: user / assistant")
    content: str = Field(..., description="消息内容")


class ChatRequest(BaseModel):
    message: str = Field(..., description="用户消息")
    history: List[ChatMessage] = Field(default=[], description="对话历史")
    mode: Literal["ask", "agent"] = Field(
        default="agent",
        description="对话模式: ask=纯问答 / agent=可操作系统",
    )


class ActionResult(BaseModel):
    tool: str
    params: Dict
    result: Dict


class ChatResponse(BaseModel):
    reply: str = Field(..., description="AI 回复")
    action: Optional[ActionResult] = Field(None, description="执行的操作")


@router.post("/chat", response_model=ChatResponse)
async def agent_chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
) -> ChatResponse:
    """
    AI Agent 对话端点。

    接收用户自然语言指令，自动识别意图，执行对应操作，并返回结果。
    - mode="ask": 纯问答模式，不执行系统操作
    - mode="agent": Agent 模式，可执行文献检索等操作
    """
    service = get_agent_service()
    result = await service.chat(
        message=payload.message,
        history=[{"role": m.role, "content": m.content} for m in payload.history],
        db=db,
        mode=payload.mode,
    )
    return ChatResponse(**result)
