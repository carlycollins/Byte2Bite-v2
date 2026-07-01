# Square OAuth setup

1. Run `migrations/20260617_add_square_oauth_tokens.sql` in the Supabase SQL editor.
2. In the Square Developer Console, open the application OAuth settings and register the exact backend callback URL.
3. Configure the backend with environment variables or .NET user secrets:

```text
Square__Environment=sandbox
Square__ApplicationId=<application id>
Square__ApplicationSecret=<application secret>
Square__OAuthRedirectUri=https://your-api.example.com/api/square/oauth/callback
Square__FrontendReturnUrl=https://your-app.example.com/square-setup
```

For local development, the non-secret URLs are already present in
`appsettings.Development.json`. Add the Sandbox application ID and secret with
.NET user secrets:

```bash
dotnet user-secrets set "Square:ApplicationId" "<sandbox application id>"
dotnet user-secrets set "Square:ApplicationSecret" "<sandbox application secret>"
```

The redirect URI configured in Square must exactly match `Square:OAuthRedirectUri`.
Square requires HTTPS callbacks, so local testing may require a trusted local
certificate or an HTTPS tunnel.

The application requests `ITEMS_READ`, `ORDERS_READ`, and
`MERCHANT_PROFILE_READ`. Access and refresh tokens are only returned to and
stored by the backend; restaurant API responses expose only connection status.
