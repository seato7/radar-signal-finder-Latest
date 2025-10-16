# Authentication Setup Guide

This guide explains how to set up and use the JWT authentication system in Opportunity Radar.

## Overview

The application now uses **JWT (JSON Web Token) authentication** with role-based access control. Users can register, login, and access features based on their subscription plan.

## User Roles & Plans

- **FREE** - Basic access to radar and themes
- **LITE** - Access to alerts and watchlist ($9.99/month)
- **PRO** - Full access including bots and backtesting
- **ADMIN** - Full administrative access

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

New dependencies added:
- `pyjwt==2.8.0` - JWT token generation/verification
- `passlib[bcrypt]==1.7.4` - Password hashing
- `python-jose[cryptography]==3.3.0` - JWT handling

### 2. Configure JWT Secret

**CRITICAL**: Change the JWT secret key in production!

Add to your `.env` file or environment variables:

```bash
JWT_SECRET_KEY=your-super-secret-random-key-here-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080  # 7 days
```

Generate a secure secret key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3. Database Collections

The authentication system creates a `users` collection with these fields:
- `email` (unique)
- `hashed_password`
- `role` (free, lite, pro, admin)
- `is_active` (boolean)
- `created_at`, `updated_at`

Indexes are automatically created on startup.

## API Endpoints

### Authentication

#### Register
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}

Response: {
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

#### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}

Response: {
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

#### Get Current User
```bash
GET /api/auth/me
Authorization: Bearer eyJ...

Response: {
  "id": "...",
  "email": "user@example.com",
  "role": "free",
  "is_active": true,
  "created_at": "2025-01-01T00:00:00"
}
```

### Protected Endpoints

All protected endpoints require the `Authorization` header:

```bash
Authorization: Bearer <your-jwt-token>
```

**Example:**
```bash
GET /api/bots/available
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Frontend Integration

### 1. Authentication Context

The `AuthContext` provides:
- `user` - Current user data
- `token` - JWT token
- `login(email, password)` - Login function
- `register(email, password)` - Register function
- `logout()` - Logout function
- `isAuthenticated` - Boolean flag

### 2. Protected Routes

Routes are automatically protected. Unauthenticated users are redirected to `/login`.

Admin-only routes (like `/admin`) require the `admin` role.

### 3. Making Authenticated API Calls

The API client automatically includes the JWT token from localStorage:

```typescript
import { api } from '@/lib/api';

// Token is automatically included in headers
const data = await api.getOpportunities();
```

## Creating the First Admin User

After deploying, create an admin user manually in MongoDB:

```javascript
db.users.insertOne({
  email: "admin@yourdomain.com",
  hashed_password: "<generate using passlib>",
  role: "admin",
  is_active: true,
  created_at: new Date(),
  updated_at: new Date()
})
```

Or use Python to hash a password:
```python
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
print(pwd_context.hash("your-admin-password"))
```

## Security Considerations

### Production Checklist

- [ ] **Change JWT_SECRET_KEY** to a random 32+ character string
- [ ] Use HTTPS in production (TLS/SSL)
- [ ] Set secure CORS origins in `backend/config.py`
- [ ] Enable rate limiting on auth endpoints
- [ ] Implement password reset flow (email-based)
- [ ] Add 2FA for admin accounts
- [ ] Monitor failed login attempts
- [ ] Regular security audits

### Password Requirements

- Minimum 8 characters
- Maximum 100 characters
- Client-side validation enforced
- Server-side validation enforced

### Token Expiry

- Default: 7 days (10080 minutes)
- Stored in localStorage
- No refresh token (user must re-login after expiry)

## Role-Based Access Control

### Protecting Backend Routes

```python
from backend.auth import get_current_active_user, require_admin, require_role
from backend.models_auth import UserRole

# Require authentication
@router.get("/protected")
async def protected_route(current_user: TokenData = Depends(get_current_active_user)):
    return {"user_id": current_user.user_id}

# Require admin role
@router.get("/admin-only", dependencies=[Depends(require_admin)])
async def admin_route():
    return {"message": "Admin access granted"}

# Require specific plan level
@router.get("/pro-feature")
async def pro_feature(current_user: TokenData = Depends(require_role(UserRole.PRO))):
    return {"message": "Pro feature"}
```

### Protecting Frontend Routes

```tsx
import { ProtectedRoute } from '@/components/ProtectedRoute';

// Require authentication
<Route path="/bots" element={
  <ProtectedRoute>
    <Bots />
  </ProtectedRoute>
} />

// Require admin
<Route path="/admin" element={
  <ProtectedRoute requireAdmin>
    <Admin />
  </ProtectedRoute>
} />
```

## Troubleshooting

### "Could not validate credentials"
- Check if JWT_SECRET_KEY matches between token generation and verification
- Verify token hasn't expired
- Ensure Authorization header is correctly formatted: `Bearer <token>`

### "Email already registered"
- User already exists with that email
- Check MongoDB users collection

### "Incorrect email or password"
- Verify credentials
- Check if user account is active

### CORS Errors
- Ensure frontend URL is in CORS allowed origins
- Check `FRONTEND_PUBLIC_URL` environment variable

## Migration from No-Auth

If migrating from a version without authentication:

1. All bots now have a `user_id` field linking them to the creator
2. Existing bots won't have a `user_id` - consider a migration script
3. Admin routes now require admin authentication
4. Frontend automatically redirects to login if not authenticated

## Next Steps

- [ ] Implement Stripe integration for paid plans (LITE/PRO)
- [ ] Add email verification on registration
- [ ] Implement password reset flow
- [ ] Add user profile management
- [ ] Implement subscription management
- [ ] Add usage analytics per user
