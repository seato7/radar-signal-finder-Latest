from pydantic import BaseModel, EmailStr
from typing import Optional

class AdminActionRequest(BaseModel):
    """Request model for admin actions"""
    email: EmailStr
    reason: Optional[str] = None
