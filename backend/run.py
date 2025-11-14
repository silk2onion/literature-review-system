"""
快速启动脚本
运行此文件以启动后端服务器
"""
import uvicorn
from app.config import settings

if __name__ == "__main__":
    print(f"""
    ╔═══════════════════════════════════════════════════════╗
    ║   城市设计文献综述系统 - 后端服务                      ║
    ╠═══════════════════════════════════════════════════════╣
    ║   服务地址: http://{settings.HOST}:{settings.PORT}                   ║
    ║   API文档: http://{settings.HOST}:{settings.PORT}/api/docs         ║
    ║   ReDoc文档: http://{settings.HOST}:{settings.PORT}/api/redoc      ║
    ╚═══════════════════════════════════════════════════════╝
    """)
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )