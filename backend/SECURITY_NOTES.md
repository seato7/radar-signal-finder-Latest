# Security Implementation Notes

## Authentication Token Storage

### Current Implementation: localStorage
The application currently stores JWT authentication tokens in browser `localStorage`. This is documented here for security awareness.

**Known Risk**: localStorage is accessible to any JavaScript code running in the browser, including:
- Third-party analytics scripts
- Compromised npm dependencies
- XSS vulnerabilities in user-generated content

**Why This Approach Was Chosen**:
- Simple to implement for a prototype/MVP
- Works across browser tabs
- Persists across page refreshes
- Common pattern in many React applications

**Mitigations in Place**:
1. ✅ JWT tokens are short-lived (7 days expiration)
2. ✅ All user input is validated with Pydantic models
3. ✅ CORS is strictly configured to allowed origins only
4. ✅ Server-side validation on every request
5. ✅ No inline scripts that could be injection targets

**Alternative Approaches for Production**:

### Option 1: HttpOnly Cookies (Most Secure)
```python
# Backend sets cookie:
response.set_cookie(
    key="auth_token",
    value=token,
    httponly=True,  # Not accessible to JavaScript
    secure=True,     # HTTPS only
    samesite="strict"
)
```
**Pros**: Immune to XSS attacks  
**Cons**: Requires backend changes, CSRF protection needed

### Option 2: Memory-Only Storage
```typescript
// Store in React state only, no persistence
const [token, setToken] = useState<string | null>(null);
```
**Pros**: Immune to XSS  
**Cons**: User must re-login on every page refresh

### Option 3: Enhanced localStorage (Current + Mitigations)
- ✅ Implement Content Security Policy headers
- ✅ Regular dependency security audits
- ✅ Input sanitization with DOMPurify
- ✅ Reduce token lifetime to 24 hours

## Recommendation
For a production financial application handling broker API keys, **HttpOnly cookies (Option 1)** is strongly recommended.

## Admin Credentials

### Environment Variables Required
The application requires the following environment variables for admin initialization:

```bash
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=your-secure-password-here
```

**CRITICAL**: Never hardcode credentials in source code. Always use environment variables or secrets management.

## Input Validation

All API endpoints use Pydantic models with strict validation:
- Length limits on all string inputs
- Type checking and format validation
- Sanitization of special characters
- Protection against MongoDB operator injection

## Error Messages

The application uses a global exception handler that:
- Logs detailed errors server-side for debugging
- Returns generic error messages to clients
- Prevents information leakage about internal architecture
- Includes error codes for client-side handling

## CORS Configuration

CORS is configured with explicit allowlists:
- Specific allowed origins (not wildcard)
- Explicit HTTP methods (GET, POST, PUT, DELETE, PATCH, OPTIONS)
- Explicit allowed headers (Authorization, Content-Type, Accept, etc.)
- Credentials support enabled for authentication

## Security Scanning

Run regular security scans:
```bash
# Python dependencies
pip install safety
safety check

# npm dependencies  
npm audit

# OWASP dependency check
dependency-check --project "Opportunity Radar" --scan .
```
