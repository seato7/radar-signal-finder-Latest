from fastapi import APIRouter, HTTPException, status, Depends
from backend.models_auth import UserRegister, UserLogin, Token, UserResponse, UserRole, TokenData
from backend.auth import (
    get_password_hash, 
    verify_password, 
    create_access_token,
    get_current_active_user
)
from backend.db import get_db
from datetime import datetime
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister):
    """Register a new user"""
    db = get_db()
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    user_dict = {
        "email": user_data.email,
        "hashed_password": get_password_hash(user_data.password),
        "role": UserRole.FREE.value,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    logger.info(f"New user registered: {user_data.email}")
    
    # Create access token
    access_token = create_access_token(
        data={
            "sub": user_data.email,
            "user_id": user_id,
            "role": UserRole.FREE.value
        }
    )
    
    return Token(access_token=access_token)

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    """Login and get access token"""
    db = get_db()
    
    # Find user
    user = await db.users.find_one({"email": credentials.email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Verify password
    if not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check if user is active
    if not user.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    # Create access token
    access_token = create_access_token(
        data={
            "sub": user["email"],
            "user_id": str(user["_id"]),
            "role": user.get("role", UserRole.FREE.value)
        }
    )
    
    logger.info(f"User logged in: {credentials.email}")
    
    return Token(access_token=access_token)

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: TokenData = Depends(get_current_active_user)):
    """Get current user information"""
    from bson import ObjectId
    db = get_db()
    
    user = await db.users.find_one({"_id": ObjectId(current_user.user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        role=user["role"],
        is_active=user["is_active"],
        created_at=user["created_at"]
    )
