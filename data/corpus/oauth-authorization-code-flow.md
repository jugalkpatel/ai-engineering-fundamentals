# OAuth 2.0 Authorization Code Flow with PKCE

The standard OAuth flow for native and single-page applications. Replaces the implicit flow, which is deprecated. PKCE (Proof Key for Code Exchange) protects against authorization code interception.

## Participants

- **User** — the human pressing buttons in the client app
- **Client App** — the application requesting access (browser SPA, mobile app, native desktop app)
- **Authorization Server** — the IdP (Auth0, Okta, Google, your own OAuth server)
- **Resource Server** — the API the client wants to call after authorization

## The sequence

1. **Client generates a code verifier and code challenge.** The verifier is a random 43–128 character string. The challenge is `BASE64URL(SHA256(verifier))`. The client stores the verifier locally.

2. **Client → User: redirect to authorize endpoint.** The client sends the user to `GET /authorize` on the authorization server with: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state` (CSRF token), `code_challenge`, `code_challenge_method=S256`.

3. **User → Authorization Server: login.** The user authenticates on the authorization server's login page. The server may also show a consent screen ("Client X wants access to your email").

4. **Authorization Server → Client: redirect with code.** The auth server redirects the user back to the client's `redirect_uri` with `?code=AUTH_CODE&state=STATE`. The client verifies `state` matches what it sent in step 2 (CSRF check).

5. **Client → Authorization Server: exchange code for token.** The client makes a `POST /token` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, and the original `code_verifier`. The server hashes the verifier, compares it to the stored challenge from step 2, and only issues tokens if they match.

6. **Authorization Server → Client: tokens.** The server returns `{ access_token, refresh_token, id_token, expires_in, token_type: "Bearer" }`.

7. **Client → Resource Server: API call with access token.** The client calls the resource server with `Authorization: Bearer ACCESS_TOKEN`. The resource server validates the token (signature check for JWTs, introspection endpoint for opaque tokens) and serves the response.

8. **Token refresh (when access token expires).** Client → Auth Server `POST /token` with `grant_type=refresh_token, refresh_token=...`. Returns a new access token (and optionally a new refresh token).

## Common mistakes when drawing this

- Putting the user inside the client box. The user is a separate participant — the entire point of OAuth is that the user authenticates *outside* the client.
- Skipping the redirect hops. The redirects in steps 2 and 4 actually pass through the user's browser. Don't draw a direct arrow from client to auth server.
- Drawing PKCE as a separate phase. The verifier/challenge are part of the same flow, not a side ritual.
