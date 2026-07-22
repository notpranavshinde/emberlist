# TODO

## Deployment

- [ ] Add `https://emberlist.dev/api/auth/google/callback` to the Google web OAuth client's authorized redirect URIs.
- [ ] Set Vercel environment variables for backend authentication: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `EMBERLIST_AUTH_SECRET`.
- [ ] Add `https://emberlist.dev/api/admin/auth/google/callback` to the Google web OAuth client's authorized redirect URIs.
- [ ] Set `ANALYTICS_ID_SECRET`, `EMBERLIST_ADMIN_AUTH_SECRET`, and `EMBERLIST_ANALYTICS_ADMIN_EMAILS=notpranavshinde@gmail.com` in Vercel before enabling schema-v2 clients.

## Android Release

- [ ] Repair ambiguous Compose selectors and activity startup handling so `connectedAndroidTest` passes reliably on physical devices.
- [ ] Migrate Android Drive authorization from legacy `GoogleSignIn` APIs to Google's newer authorization stack before Play Store submission.
- [ ] Update the Play Store Data Safety declaration for resettable anonymous product analytics before the next Android release.
