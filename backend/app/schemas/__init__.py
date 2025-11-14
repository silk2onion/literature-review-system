"""
Pydantic schemas for API request/response validation
"""
from .paper import PaperCreate, PaperUpdate, PaperResponse, PaperSearch
from .review import ReviewCreate, ReviewUpdate, ReviewResponse, ReviewGenerate

__all__ = [
    "PaperCreate",
    "PaperUpdate", 
    "PaperResponse",
    "PaperSearch",
    "ReviewCreate",
    "ReviewUpdate",
    "ReviewResponse",
    "ReviewGenerate",
]