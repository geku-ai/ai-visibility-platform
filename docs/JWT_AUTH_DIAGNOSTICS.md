# JWT Authentication Diagnostics Guide

## Problem: 401 Unauthorized Errors

When you see `401 (Unauthorized)` errors for `/v1/auth/profile`, it means JWT token validation is failing.

---

## Step 1: Check Railway Logs

After deploying, check the API service logs in Railway. You should now see detailed JWT validation logs:

### Expected Logs (Success):
```
[JWT Auth] Validating token for GET /v1/auth/profile (token length: 500)
[JWT Strategy] Validating payload: sub=user_xxx, email=user@example.com, issuer=https://xxx.clerk.accounts.dev, audience=xxx
[JWT Strategy] Mapped user: {"sub":"user_xxx","email":"user@ex..."}
```

### Expected Logs (Failure):
```
[JWT Auth] Authentication failed for GET /v1/auth/profile
error: "TokenExpiredError" or "JsonWebTokenError" or "Invalid issuer"
info: "jwt expired" or "invalid signature" or "invalid issuer"
```

---

## Step 2: Verify Environment Variables

In Railway, check that these environment variables are set correctly for **Clerk**:

### Required for Clerk:
```bash
AUTH_JWT_ISSUER=https://[your-clerk-domain].clerk.accounts.dev
AUTH_JWT_AUDIENCE=your-clerk-audience-or-publishable-key
AUTH_JWT_JWKS_URL=https://[your-clerk-domain].clerk.accounts.dev/.well-known/jwks.json
```

### How to Find Your Clerk Values:

1. **Go to Clerk Dashboard**: https://dashboard.clerk.com
2. **Select your application**
3. **Go to "JWT Templates"** or **"API Keys"**
4. **Find your JWT configuration**:
   - **Issuer**: Usually `https://[your-app].clerk.accounts.dev`
   - **JWKS URL**: `https://[your-app].clerk.accounts.dev/.well-known/jwks.json`
   - **Audience**: Check your JWT template settings or use your publishable key

### Example (Replace with your actual values):
```bash
AUTH_JWT_ISSUER=https://your-app.clerk.accounts.dev
AUTH_JWT_AUDIENCE=your-publishable-key-or-custom-audience
AUTH_JWT_JWKS_URL=https://your-app.clerk.accounts.dev/.well-known/jwks.json
```

---

## Step 3: Common Issues & Fixes

### Issue 1: Wrong Issuer
**Symptom**: Logs show "invalid issuer" or "issuer mismatch"

**Fix**: 
- Check that `AUTH_JWT_ISSUER` matches exactly what Clerk sends in the token
- Clerk tokens usually have issuer: `https://[domain].clerk.accounts.dev`
- Make sure there's no trailing slash

### Issue 2: Wrong Audience
**Symptom**: Logs show "invalid audience" or "audience mismatch"

**Fix**:
- Check your Clerk JWT template settings
- If using default Clerk tokens, audience might be your publishable key
- If using custom JWT template, use the audience you configured

### Issue 3: JWKS URL Not Accessible
**Symptom**: Logs show "JWKS initialization failed" or "Failed to fetch JWKS"

**Fix**:
- Verify the JWKS URL is accessible: `curl https://[your-domain].clerk.accounts.dev/.well-known/jwks.json`
- Should return a JSON object with `keys` array
- Make sure Railway can reach Clerk's servers (no firewall blocking)

### Issue 4: Token Not Being Sent
**Symptom**: Logs show "No authorization header found"

**Fix**:
- This is a **frontend issue** - the frontend isn't sending the token
- Check that Clerk token is being retrieved and added to `Authorization: Bearer <token>` header
- This is NOT a backend issue

### Issue 5: Token Expired
**Symptom**: Logs show "TokenExpiredError" or "jwt expired"

**Fix**:
- This is normal - tokens expire after a certain time
- Frontend should refresh the token or sign in again
- Check Clerk token expiration settings

---

## Step 4: Test JWT Validation

### Manual Test (using curl):
```bash
# Get a token from Clerk (use your frontend to sign in, then copy token from browser DevTools)
TOKEN="your-jwt-token-here"
API_URL="https://your-api.railway.app"

# Test the profile endpoint
curl -H "Authorization: Bearer $TOKEN" $API_URL/v1/auth/profile
```

### Expected Response (Success):
```json
{
  "user": {
    "id": "user_xxx",
    "email": "user@example.com",
    ...
  },
  "workspaces": [...]
}
```

### Expected Response (Failure):
```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required. Please provide a valid JWT token.",
  "details": {
    "info": "jwt expired" // or other error message
  }
}
```

---

## Step 5: Enable Debug Mode (Development Only)

**⚠️ WARNING: Only use in development, never in production!**

If you need to bypass JWT validation temporarily for testing:

```bash
DEBUG_JWT_MODE=true
NODE_ENV=development  # Must NOT be production
```

This will:
- Allow requests without JWT tokens
- Inject a debug user automatically
- **Disable real authentication**

---

## Step 6: Check Frontend Token Sending

The backend logs will show if the token is being sent. Look for:

```
[JWT Auth] Validating token for GET /v1/auth/profile (token length: 500)
```

If you see `token length: 0` or `No authorization header found`, the **frontend isn't sending the token**.

**This is a frontend issue** - check:
1. Is Clerk token being retrieved? (`useAuth()` hook)
2. Is token being added to API requests? (`apiClient.ts`)
3. Is token still valid? (not expired)

---

## Quick Checklist

- [ ] Railway environment variables set correctly
- [ ] `AUTH_JWT_ISSUER` matches Clerk issuer
- [ ] `AUTH_JWT_JWKS_URL` is accessible (test with curl)
- [ ] `AUTH_JWT_AUDIENCE` matches Clerk audience
- [ ] Railway logs show JWT validation attempts
- [ ] Frontend is sending `Authorization: Bearer <token>` header
- [ ] Token is not expired (check Clerk dashboard)

---

## Still Having Issues?

1. **Check Railway logs** for the detailed error messages (now included)
2. **Verify Clerk JWT template** settings match backend config
3. **Test JWKS URL** manually: `curl https://[your-domain].clerk.accounts.dev/.well-known/jwks.json`
4. **Check token in browser DevTools** - is it being sent in the request headers?

The enhanced logging will now show exactly what's failing in the JWT validation process.

