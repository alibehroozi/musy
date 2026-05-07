# Deploy

Operational guide for getting the app live and keeping it deployed. For the architectural shape, see [ARCHITECTURE.md § Deployment](ARCHITECTURE.md).

## Day-to-day: just push to main

```bash
git push origin main
```

If `npm run verify` is green in CI, the API container is built, pushed to Google Artifact Registry, and rolled out as a new Cloud Run revision; the web bundle is built and uploaded to Cloudflare Pages. The two deploy jobs are independent — one can succeed while the other fails.

### Rollback

- **API** — Cloud Run keeps every revision:
  ```bash
  gcloud run services update-traffic moc-api \
    --to-revisions=<previous-revision>=100 \
    --region=<region>
  ```
- **Web** — Cloudflare Pages dashboard → Deployments → "Rollback to this deployment".

Neither path requires touching the repo.

---

## One-time bootstrap

Estimated 30–60 min of clicking + waiting. Steps depend on output from earlier ones; do them in order.

### 1. Create accounts

| Service       | URL                                          | Free tier                                  |
| ------------- | -------------------------------------------- | ------------------------------------------ |
| MongoDB Atlas | https://www.mongodb.com/cloud/atlas/register | M0 cluster, no card required               |
| Google Cloud  | https://console.cloud.google.com/freetrial   | $300 new-account credit + always-free tier |
| Cloudflare    | https://dash.cloudflare.com/sign-up          | Pages + R2 free tiers                      |

For Google Cloud you must add a payment method to enable Cloud Run. **Cloud Run scales to zero and the always-free monthly grant covers low-traffic apps fully — set a billing budget alert at a low threshold (e.g. $1) so you're notified instantly if usage spikes.**

### 2. MongoDB Atlas — create the cluster

1. Create a project (e.g. `moc`).
2. **Build a Database** → **M0 (Free)** → pick a region close to your Cloud Run region (`us-central1` ↔ N. Virginia or Iowa).
3. **Database Access** → add a database user with a strong random password. Save the password — Atlas will not show it again.
4. **Network Access** → add `0.0.0.0/0`. Cloud Run egress IPs are dynamic; security relies on the strong password + database user permissions, not IP allowlisting.
5. **Connect** → **Drivers** → copy the connection string. Replace `<password>` and append the database name: `mongodb+srv://<user>:<password>@<host>/moc?retryWrites=true&w=majority`. **Save this — it is your `MONGO_URI`.**

### 3. Google Cloud — set up Cloud Run

Install gcloud first: https://cloud.google.com/sdk/docs/install.

```bash
gcloud auth login
gcloud projects create moc-prod --name=moc
gcloud config set project moc-prod

# Link a billing account (required to enable Cloud Run)
gcloud beta billing projects link moc-prod \
  --billing-account=<your-billing-account-id>

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com

gcloud artifacts repositories create moc \
  --repository-format=docker \
  --location=us-central1 \
  --description="moc API container images"
```

Create a deploy service account and JSON key:

```bash
gcloud iam service-accounts create moc-deployer \
  --display-name="moc deploy from GitHub Actions"

PROJECT_ID=$(gcloud config get-value project)
SA_EMAIL="moc-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

for role in run.admin artifactregistry.writer iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/$role"
done

gcloud iam service-accounts keys create gcp-key.json \
  --iam-account="$SA_EMAIL"
```

**Open `gcp-key.json`, copy the entire JSON content, then `rm gcp-key.json`.** That JSON is your `GCP_SERVICE_ACCOUNT_KEY` — it is a long-lived credential and must never be committed.

Save: `GCP_PROJECT_ID` (`moc-prod`) and `GCP_REGION` (`us-central1`).

### 4. Cloudflare — set up Pages

1. **Workers & Pages** → **Create application** → **Pages** → **Create using direct upload**. Name the project `moc`. Do not connect the Git integration — it would create a parallel deploy path that ignores `npm run verify`.
2. From any dashboard page sidebar, copy your **Account ID** — this is `CLOUDFLARE_ACCOUNT_ID`.
3. **My Profile** → **API Tokens** → **Create Token** → **Custom token**:
   - Permission: `Account` → `Cloudflare Pages` → `Edit`
   - Account Resources: include your account
   - Save the token — this is `CLOUDFLARE_API_TOKEN`.

The default production URL is `https://moc.pages.dev`. **This is your `WEB_ORIGIN` value.**

### 5. Set GitHub Actions secrets

Repository **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret                    | Value                                                         | From    |
| ------------------------- | ------------------------------------------------------------- | ------- |
| `GCP_SERVICE_ACCOUNT_KEY` | full JSON contents of `gcp-key.json`                          | step 3  |
| `GCP_PROJECT_ID`          | e.g. `moc-prod`                                               | step 3  |
| `GCP_REGION`              | e.g. `us-central1`                                            | step 3  |
| `CLOUDFLARE_API_TOKEN`    | from API Tokens                                               | step 4  |
| `CLOUDFLARE_ACCOUNT_ID`   | from sidebar                                                  | step 4  |
| `VITE_API_URL`            | **leave blank for now** — set in step 7 once API URL is known | (later) |

### 6. First API deploy

```bash
git push origin main
```

In the **Actions** tab, the `deploy-api` job builds the container and rolls it out. When it succeeds, the job log includes the Cloud Run service URL — looks like `https://moc-api-xxxxxxx-uc.a.run.app`. Copy this — it is your `API_URL`.

The `deploy-web` job will fail at this point because `VITE_API_URL` is unset. Expected; resolved in step 8.

### 7. Configure runtime env on Cloud Run

```bash
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")

gcloud run services update moc-api --region=us-central1 \
  --set-env-vars="^@^WEB_ORIGIN=https://moc.pages.dev@API_PORT=8080@GOOGLE_REDIRECT_URI=<API_URL>/api/auth/google/callback"
```

Sensitive values are best stored in **Google Secret Manager** and referenced from the Cloud Run service:

```bash
echo -n "<your MONGO_URI>" | gcloud secrets create moc-mongo-uri --data-file=-
echo -n "$SESSION_SECRET"  | gcloud secrets create moc-session-secret --data-file=-
echo -n "<google client id>"     | gcloud secrets create moc-google-client-id --data-file=-
echo -n "<google client secret>" | gcloud secrets create moc-google-client-secret --data-file=-

# Grant the Cloud Run runtime service account access to these secrets
RUNTIME_SA="$(gcloud projects describe moc-prod --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for secret in moc-mongo-uri moc-session-secret moc-google-client-id moc-google-client-secret; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="roles/secretmanager.secretAccessor"
done

gcloud run services update moc-api --region=us-central1 \
  --update-secrets="MONGO_URI=moc-mongo-uri:latest,SESSION_SECRET=moc-session-secret:latest,GOOGLE_CLIENT_ID=moc-google-client-id:latest,GOOGLE_CLIENT_SECRET=moc-google-client-secret:latest"
```

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` come from your OAuth 2.0 client at https://console.cloud.google.com/apis/credentials. Add `<API_URL>/api/auth/google/callback` to **Authorized redirect URIs** in that screen.

### 8. Re-trigger the web deploy

In GitHub **Settings → Secrets**, set `VITE_API_URL` to `<API_URL>`. Then in the **Actions** tab → "Verification Pipeline" → most recent main run → "Re-run failed jobs". The `deploy-web` job rebuilds with `VITE_API_URL` baked in and uploads to Pages.

### 9. Verify end-to-end

- `https://moc.pages.dev` — SPA loads
- `<API_URL>/health` — returns 200
- Sign-in flow — Google OAuth redirects through API back to web

---

## Updating env vars after bootstrap

| What changed                                       | Where to update                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Runtime API config (e.g. rotated `SESSION_SECRET`) | `gcloud secrets versions add ...` then `gcloud run services update --update-secrets=...` (no rebuild needed) |
| `VITE_API_URL` (e.g. moved to a custom API domain) | GitHub secret + push a commit (web rebuild)                                                                  |
| New `VITE_*` value to inline into the web bundle   | Add to `.github/workflows/verify.yml` `deploy-web` job env, then set the secret                              |
| New plain (non-secret) Cloud Run env var           | `gcloud run services update --set-env-vars=...`                                                              |

## Custom domains (later)

- **Web**: Pages → Custom domains → add e.g. `moc.example.com`. Cloudflare provisions the cert. Update `WEB_ORIGIN` on Cloud Run to the new domain.
- **API**: Cloud Run → service → "Manage Custom Domains" → add e.g. `api.moc.example.com`. Update `VITE_API_URL` (GitHub secret) and `GOOGLE_REDIRECT_URI` (Cloud Run env) accordingly, plus the OAuth client's authorized redirect URIs.

## Hard rules

- **Never commit `gcp-key.json`** or any populated `.env` file. `.gitignore` and gitleaks already enforce this — don't disable either.
- **No secrets in `apps/web/.env*`.** Vite inlines `VITE_*` values into the public bundle that ships to every browser.
- **Don't bypass verify.** The deploy jobs `needs: [gitleaks, layer-1-build, layer-2-invariants]` — never remove those `needs`. A red verify must mean no deploy.
- **Don't add the Cloudflare Pages Git integration.** It creates a parallel deploy path that ignores `npm run verify`. Direct upload from GitHub Actions is the only deploy path.
