# Connect Logto

Use the existing Boring Things Logto Cloud tenant as the identity source for local development and production. No second identity database or self-hosted Logto instance is needed.

## Console setup

1. In **Applications**, create a **Single-page application** named **Boring Things**. If choosing an integration, use Angular or Vanilla JS. An existing SPA application can be reused.
2. In that application's settings, add:
   - Redirect URI: `http://localhost:4200/callback`
   - Post sign-out redirect URI: `http://localhost:4200/`
   - Allowed origin, if shown: `http://localhost:4200`
3. In **API resources**, create **Boring Things API**, with identifier `https://api.boring-things.local`. This is an audience identifier, not an address that needs DNS or a running website. No custom scopes or roles are required for the owner-only scaffold.
4. In the tenant sidebar, open **Sign-in & account → Sign-up and sign-in**. Choose the sign-up identifier and sign-in method there. For a first smoke check, use **Username** with **Password**. Under **Advanced options**, leave **Enable user registration** on (the default). These are tenant settings. Email verification methods need their associated email setup.
5. Copy the **Logto endpoint** and **App ID** from the application settings into the repository's ignored `.env`:

```dotenv
LOGTO_ENDPOINT=https://YOUR-TENANT.logto.app
LOGTO_APP_ID=YOUR-SPA-APP-ID
LOGTO_API_RESOURCE=https://api.boring-things.local
```

Use the base endpoint, without `/oidc`. No client secret is needed for a SPA. The endpoint and app ID are public configuration and may be supplied in chat; keep secrets out of chat and version control.

Restart `pnpm dev` after changing `.env`. Open **http://localhost:4200**, using `localhost` consistently with the registered URIs.

## Phone testing

`pnpm dev:lan` serves the app at `https://<computer-LAN-IP>:4200`, for example `https://192.168.1.62:4200`. Sign-in needs HTTPS, so the dev server uses a self-signed certificate; the phone shows a certificate warning to accept once.

Add the LAN origin to the SPA application alongside the localhost entries:

- Redirect URI: `https://<computer-LAN-IP>:4200/callback`
- Post sign-out redirect URI: `https://<computer-LAN-IP>:4200/`
- Allowed origin, if shown: `https://<computer-LAN-IP>:4200`

The LAN IP can change when the computer rejoins the network; update the entries when it does. `pnpm dev:lan` exposes the dev server to the whole network, so stop it after testing.

## Verification

- Sign in or register; verify the dashboard loads.
- Create a Thing, edit fields and attach a file.
- Reload; the Thing and file should remain.
- Sign out and register/sign in as a second user; the first user's Things must not appear.
- Sign back in as the first user and verify the records remain.

The application validates bearer access tokens against the tenant's public keys, issuer and API audience. An ID token is not an API credential. Supabase Auth is not used by the app.

For production, retain this tenant. Add the deployed HTTPS callback/logout URLs to the SPA application when the domain is known. If separate application registrations become useful later, both can use this tenant's users.

References: [Sign-up settings](https://docs.logto.io/end-user-flows/sign-up-and-sign-in/sign-up), [Registration switch](https://docs.logto.io/end-user-flows/sign-up-and-sign-in/disable-user-registration), [Logto SPA setup](https://docs.logto.io/quick-starts/angular), [API resources](https://docs.logto.io/authorization/global-api-resources), [Fastify token verification](https://docs.logto.io/api-protection/nodejs/fastify).
