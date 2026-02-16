# Authentication Setup with Reverse Proxy

## Overview

This application uses NextAuth.js v4 with Authentik as an OAuth2/OpenID Connect provider. When running behind a reverse
proxy (like Nginx, Traefik, or Caddy), additional configuration is required.

## Environment Variables

### Required Variables

```env
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="https://your-public-domain.com"
AUTH_AUTHENTIK_ISSUER="https://authentik.example.com/application/o/stream-recorder/"
AUTH_AUTHENTIK_CLIENT_ID="your-client-id"
AUTH_AUTHENTIK_CLIENT_SECRET="your-client-secret"
```

### Optional Variables

```env
# Set to "true" to disable authentication
AUTH_DISABLED="false"

# Internal URL for callbacks (optional, defaults to NEXTAUTH_URL)
NEXTAUTH_URL_INTERNAL="http://localhost:3000"
```

## Reverse Proxy Configuration

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name streamrec.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # Required headers for NextAuth
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # WebSocket support (if needed)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Traefik (docker-compose.yml)

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.streamrec.rule=Host(`streamrec.example.com`)"
  - "traefik.http.routers.streamrec.entrypoints=websecure"
  - "traefik.http.routers.streamrec.tls=true"
  - "traefik.http.services.streamrec.loadbalancer.server.port=3000"
  # Important: Pass forwarded headers
  - "traefik.http.middlewares.streamrec-headers.headers.customrequestheaders.X-Forwarded-Proto=https"
```

### Caddy

```caddyfile
streamrec.example.com {
    reverse_proxy localhost:3000 {
        # Headers are automatically set by Caddy
    }
}
```

## Authentik Configuration

1. **Create OAuth2/OpenID Provider:**
    - Go to Authentik Admin → Applications → Providers
    - Click "Create" → "OAuth2/OpenID Provider"
    - Set the following:
        - **Name**: Stream Recorder
        - **Authorization flow**: default-authentication-flow (or your custom flow)
        - **Client type**: Confidential
        - **Redirect URIs**: `https://your-domain.com/api/auth/callback/authentik`
        - **Signing Key**: Select an RSA key or leave empty for HS256

2. **Create Application:**
    - Go to Applications → Applications
    - Click "Create"
    - Set:
        - **Name**: Stream Recorder
        - **Slug**: stream-recorder
        - **Provider**: Select the provider created above

3. **Get Credentials:**
    - Open the provider
    - Copy the **Client ID** and **Client Secret**
    - The issuer URL is: `https://your-authentik-domain/application/o/stream-recorder/`

## Troubleshooting

### User Profile Not Showing After Login

**Symptoms:** Login works, but the user profile doesn't appear in the sidebar.

**Common Causes:**

1. **Cookie Issues:**
    - Check browser DevTools → Application → Cookies
    - Look for `next-auth.session-token` (dev) or `__Secure-next-auth.session-token` (prod)
    - If cookie is missing or not being sent, check:
        - `NEXTAUTH_URL` matches your public domain exactly (including https://)
        - Reverse proxy is forwarding headers correctly
        - SameSite cookie settings

2. **Environment Variable Mismatch:**
   ```bash
   # Check your running container
   docker exec <container-name> printenv | grep NEXTAUTH
   docker exec <container-name> printenv | grep AUTH_
   ```

3. **Console Errors:**
    - Open browser DevTools → Console
    - Look for `[UserProfile]` debug logs:
      ```
      [UserProfile] Auth status: authenticated
      [UserProfile] Session: {user: {...}}
      ```
    - If status is "unauthenticated", session is not persisting

4. **Network Requests:**
    - Check DevTools → Network
    - Look for `/api/auth/session` request
    - Should return `{user: {...}}`, not `{}`

### Session Not Persisting

**Solutions:**

1. **Verify NEXTAUTH_URL:**
   ```env
   # Must match your public domain EXACTLY
   NEXTAUTH_URL="https://streamrec.example.com"
   # NOT http://
   # NOT localhost
   # NOT IP address (unless testing locally)
   ```

2. **Check Reverse Proxy Headers:**
   ```bash
   # Test if headers are being forwarded
   curl -H "Host: streamrec.example.com" http://localhost:3000/api/auth/csrf
   ```

3. **Verify Authentik Redirect URI:**
    - Must be: `https://your-domain.com/api/auth/callback/authentik`
    - NOT `http://`
    - NOT localhost

4. **Cookie Domain Issues:**
    - If using subdomain, ensure cookies can be set
    - Check for browser extensions blocking cookies
    - Test in incognito mode

### OAuth Callback Errors

**Error:** `failed to decode JWT (TypeError: encrypted JWTs cannot be decoded)`

**Solution:**

- In Authentik provider settings, remove the encryption key
- Only signing key should be set

### Debug Mode

Enable debug logging by setting:

```env
NODE_ENV=development
```

Or check NextAuth logs in your container:

```bash
docker logs -f <container-name>
```

Look for `[next-auth]` prefixed messages.

## Testing Locally

1. **Generate secret:**
   ```bash
   openssl rand -base64 32
   ```

2. **Create `.env.local`:**
   ```env
   NEXTAUTH_SECRET="your-generated-secret"
   NEXTAUTH_URL="http://localhost:3000"
   AUTH_AUTHENTIK_ISSUER="https://authentik.example.com/application/o/stream-recorder/"
   AUTH_AUTHENTIK_CLIENT_ID="your-client-id"
   AUTH_AUTHENTIK_CLIENT_SECRET="your-client-secret"
   ```

3. **Run development server:**
   ```bash
   yarn dev
   ```

4. **Test login:**
    - Navigate to http://localhost:3000
    - Should redirect to /login
    - Click "Sign in with Authentik"
    - After auth, should redirect back and show user profile

## Disabling Authentication

For testing or local development:

```env
AUTH_DISABLED="true"
```

This completely disables authentication. All routes become accessible without login.

## Common Production Issues

1. **Mixed Content (HTTP/HTTPS):**
    - Ensure `NEXTAUTH_URL` uses `https://`
    - Reverse proxy must set `X-Forwarded-Proto: https`

2. **CORS Issues:**
    - Not typically an issue with NextAuth
    - If seeing CORS errors, check Authentik CORS settings

3. **Session Timeout:**
    - Default: 30 days
    - Configure in `auth.ts` if needed

4. **Multiple Domains:**
    - If app accessible from multiple domains, pick one for `NEXTAUTH_URL`
    - Others should redirect to the canonical domain

