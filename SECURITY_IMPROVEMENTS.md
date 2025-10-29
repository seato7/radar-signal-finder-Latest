# Security Improvements - January 2025

This document explains all security improvements made to Opportunity Radar after the comprehensive security review.

## Critical Issues Fixed

### 1. ✅ Authenticated Data Ingestion Edge Functions

**Problem**: All 11 data ingestion edge functions could be called by anyone without authentication, allowing attackers to:
- Trigger expensive API calls (Perplexity, Reddit, Adzuna)
- Exhaust rate limits
- Spam endpoints with malicious requests

**Solution**: Added JWT authentication to all ingestion functions:
- `ingest-stocktwits`
- `ingest-reddit-sentiment`
- `ingest-congressional-trades`
- `ingest-breaking-news`
- `ingest-google-trends`
- `ingest-patents`
- `ingest-short-interest`
- `ingest-earnings`
- `ingest-options-flow`
- `ingest-job-postings`
- `ingest-supply-chain`

All functions now:
1. Check for Authorization header
2. Verify JWT token with Supabase
3. Only proceed if user is authenticated
4. Log user ID for audit trails

**Impact on Usage**: Users must now be logged in to trigger data ingestion. The "Run Ingestion" button in the Data Sources page will only work for authenticated users.

---

### 2. ✅ Secure User Roles Architecture

**Problem**: User roles were stored directly in the MongoDB users collection and included in JWT tokens, creating privilege escalation risks.

**Solution**: Implemented industry-standard role separation in Supabase:

#### New Database Structure
```sql
-- Created app_role enum
CREATE TYPE public.app_role AS ENUM ('free', 'lite', 'pro', 'admin');

-- Created separate user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    role app_role NOT NULL DEFAULT 'free',
    granted_at TIMESTAMPTZ DEFAULT now(),
    granted_by UUID REFERENCES auth.users(id)
);

-- Security definer function prevents RLS recursion
CREATE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
-- Checks role without triggering infinite RLS loops

-- Function to get user's highest role
CREATE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
-- Returns admin > pro > lite > free (highest priority)
```

#### Row-Level Security Policies
- Users can view their own roles
- Only admins can modify roles
- Automatic 'free' role assignment on signup
- Security definer functions prevent RLS recursion

**Impact on Usage**: 
- New users automatically get 'free' role
- No visible changes to user experience
- Admins can now safely upgrade user roles without privilege escalation risk
- Future: Can easily add subscription tier changes

---

### 3. ✅ Public Data Access Documented

**Problem**: All market data tables used `USING (true)` RLS policies, making everything public without documentation.

**Solution**: Added SQL comments to all 10 data table policies explaining this is intentional:

```sql
COMMENT ON POLICY "Allow public read access to social signals" 
ON public.social_signals IS 
'INTENTIONAL: Market data is public for free tier. Premium features will be rate-limiting and advanced analytics.';
```

Tables documented:
- social_signals
- congressional_trades
- breaking_news
- earnings_sentiment
- job_postings
- options_flow
- patent_filings
- search_trends
- short_interest
- supply_chain_signals

**Impact on Usage**: No changes. Data remains publicly readable. Documented for future premium feature implementation.

---

## User Experience Changes

### For Regular Users
**Before**: Could trigger data ingestion without logging in
**After**: Must be logged in to run ingestion

**Action Required**: 
- If you see "Run Ingestion" button, you must log in first
- Once logged in, functionality works exactly the same

### For Admins
**Before**: User roles stored in MongoDB, harder to manage securely
**After**: Roles stored in Supabase with proper security

**Action Required**:
- You can now safely manage user roles via backend
- Use the `user_roles` table to upgrade/downgrade users
- Check user roles with: `SELECT * FROM user_roles WHERE user_id = '<uuid>';`

### For Developers
**New Functions Available**:
```sql
-- Check if user has specific role
SELECT public.has_role(auth.uid(), 'admin');

-- Get user's highest role
SELECT public.get_user_role(auth.uid());
```

---

## Implementation Details

### Edge Function Authentication Pattern

All ingestion functions now follow this pattern:

```typescript
serve(async (req) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 2. Check Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Create authenticated Supabase client
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    // 4. Verify user
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Log for audit trail
    console.log(`Starting ingestion for user ${user.id}...`);

    // 6. Continue with ingestion logic...
  }
});
```

---

## Still Recommended (Not Critical)

### Input Validation (Medium Priority)
**Status**: Identified but not implemented yet

**Recommendation**: Add Zod validation to edge functions that process external API responses:
```typescript
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const StockTwitsResponseSchema = z.object({
  messages: z.array(z.object({
    id: z.number(),
    body: z.string().max(5000),
    // ... more validation
  })).max(100),
});

// Validate before processing
const validated = StockTwitsResponseSchema.parse(apiResponse);
```

**Why Not Critical**: Current implementation has basic error handling and MongoDB/Supabase provide some type safety. This is a "defense in depth" improvement.

---

### JWT Token Storage (Production Consideration)
**Status**: Acknowledged, documented in SECURITY_NOTES.md

**Current**: JWT tokens stored in localStorage (XSS vulnerable)
**Mitigations**: 7-day expiration, strict CORS, no inline scripts
**Recommendation**: Migrate to HttpOnly cookies when handling real money in production

---

## Testing the Changes

### Test Authentication Protection
```bash
# Should fail (no auth)
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/ingest-stocktwits

# Should succeed (with auth)
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/ingest-stocktwits \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test Role System
```sql
-- Check your role
SELECT * FROM user_roles WHERE user_id = auth.uid();

-- Check if you have admin role
SELECT public.has_role(auth.uid(), 'admin');

-- Get your highest role
SELECT public.get_user_role(auth.uid());
```

---

## Security Best Practices Going Forward

1. **Never disable authentication** on edge functions that trigger external API calls
2. **Always use RLS policies** for user-specific data
3. **Document intentional public access** with SQL comments
4. **Separate roles from user identities** - never put roles in JWT claims
5. **Use security definer functions** to prevent RLS recursion
6. **Audit log sensitive operations** - we now log user IDs in edge functions
7. **Validate external API responses** before storing in database (recommended for future)

---

## Questions & Support

**Q: Can I still access the data without logging in?**
A: Yes! All market data is still publicly readable. Only the ingestion triggers require authentication.

**Q: How do I upgrade a user to pro?**
A: As an admin, insert/update their role in the `user_roles` table.

**Q: What if an ingestion function returns 401?**
A: Check that the user is logged in and their session hasn't expired.

**Q: Is the MongoDB backend affected?**
A: No, the MongoDB backend (Railway) remains unchanged. These fixes are all in Supabase/Lovable Cloud.

---

## Change Summary

✅ **11 edge functions** now require authentication
✅ **Secure role system** implemented with RLS
✅ **Public data access** documented as intentional design
✅ **Zero breaking changes** for viewing data
✅ **Minimal impact** for authenticated users running ingestion

**Deployment**: All changes are deployed automatically via Lovable Cloud.
