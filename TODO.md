# TODO

## Deployment

- [ ] Add `https://emberlist.dev/api/auth/google/callback` to the Google web OAuth client's authorized redirect URIs.
- [ ] Set Vercel environment variables for backend authentication: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `EMBERLIST_AUTH_SECRET`.

## Android Release

- [ ] Repair ambiguous Compose selectors and activity startup handling so `connectedAndroidTest` passes reliably on physical devices.
- [ ] Migrate Android Drive authorization from legacy `GoogleSignIn` APIs to Google's newer authorization stack before Play Store submission.
