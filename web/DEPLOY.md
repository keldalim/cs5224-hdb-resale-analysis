# Deploying the web client to AWS

The React client is a static site: a private S3 bucket holds the built files, and CloudFront
serves them over HTTPS. It calls the team's estimate API:

```
Browser ──HTTPS──▶ CloudFront ──▶ private S3            ← this guide
   │
   └──POST /estimate──▶ API Gateway (a34gvnw0hg, ap-southeast-1) ──▶ Lambda hdb-resale-api
                                                                     ├─▶ DynamoDB hdb-resale-app-cs5224
                                                                     └─▶ XGBoost model + calibration
```

There are two ways to host it:

- **Route A (recommended): replace the interim frontend on the team's existing site**
  (`https://d2d7utcbwtyp5z.cloudfront.net`). The API's CORS settings already allow that
  domain, so nothing on the backend changes and the team keeps one URL.
- **Route B: a separate site** from `infra/frontend.yaml`. This gives a second URL, and the
  backend owner must add it to the API's CORS settings.

Either route works from AWS CloudShell, which already has the AWS CLI, Node.js and git.

---

## Before you start

- **Where to run commands.** Either use **AWS CloudShell** (the `>_` icon in the console's
  top bar; already signed in, with the AWS CLI and Node) or your own terminal with
  AWS CLI v2 and `aws configure`. Set the region to **ap-southeast-1**.
- **Get the code there and build it.**
  ```bash
  git clone https://github.com/keldalim/cs5224-hdb-resale-analysis.git
  cd cs5224-hdb-resale-analysis/web
  npm ci && npm run build          # dist/ now calls the live /estimate API
  ```
  (Or **Actions → Upload file** a zip of the repo in CloudShell and `unzip` it.)
- **Permissions.** Your IAM user needs S3 and CloudFront access (plus CloudFormation for
  route B). If a command says *AccessDenied*, ask whoever owns the account, or have them run it.

---

## Route A: deploy onto the team's existing site

### A1. Find the bucket and distribution behind the current site

```bash
aws cloudfront list-distributions --output table --query \
 "DistributionList.Items[?DomainName=='d2d7utcbwtyp5z.cloudfront.net'].{Id:Id,Origin:Origins.Items[0].DomainName}"
```

The origin looks like `<bucket-name>.s3.ap-southeast-1.amazonaws.com`. The bucket name is
the part before `.s3`.

```bash
DISTRIBUTION_ID=E1234567890ABC          # from the table
BUCKET=<bucket-name>                    # from the table
```

### A2. Back up the current frontend

```bash
aws s3 sync "s3://$BUCKET" ./interim-frontend-backup
ls interim-frontend-backup             # index.html, app.js, style.css
```

### A3. Upload this build

```bash
BUCKET=$BUCKET DISTRIBUTION_ID=$DISTRIBUTION_ID SKIP_BUILD=1 bash scripts/deploy.sh
```

This uploads `dist/` with the right cache headers, removes the old `frontend/` files from the
bucket (they're in your backup), and refreshes CloudFront. It takes about a minute.

### A4. Check it

Open `https://d2d7utcbwtyp5z.cloudfront.net` and hard-refresh. Then:

1. There's no yellow "Demo mode" banner.
2. **Or try an example → 3-room in Ang Mo Kio** returns an estimate and five comparables.
3. DevTools → Network shows `POST …/estimate` returning 200 with no CORS errors.

### Roll back

```bash
aws s3 sync ./interim-frontend-backup "s3://$BUCKET" --delete
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
```

---

## Route B: a separate site with its own URL

### B1. Create the hosting stack (5–10 minutes)

```bash
aws cloudformation deploy --template-file infra/frontend.yaml --stack-name hdb-resale-frontend
```

The stack creates:

| Resource | Purpose |
|---|---|
| S3 bucket `hdb-resale-web-<account>-<region>` | Private, encrypted, versioned. Old versions expire after 30 days |
| CloudFront Origin Access Control | Only CloudFront can read the bucket |
| CloudFront distribution | HTTPS, HTTP/2+3, compression, AWS security headers, Asia edge locations |
| Bucket policy | Read access for this distribution only; non-TLS requests denied |

### B2. Upload

```bash
SKIP_BUILD=1 bash scripts/deploy.sh
```

The last line printed is the new site URL.

### B3. Allow the new URL to call the API

The backend owner adds the new origin to the API's CORS settings; the command is in
`docs/API.md`. Until then, the site loads but every check fails with "Couldn't reach the
price service".

---

## Rebuilding after code changes

```bash
cd web
# route A:  BUCKET=… DISTRIBUTION_ID=… bash scripts/deploy.sh
# route B:  bash scripts/deploy.sh
```

Builds call the team API by default (`src/config.ts`). To point at a different API, set
`VITE_ESTIMATE_URL` when building; Vite fixes it into the bundle at build time. `scripts/deploy.sh` will:

1. check your AWS credentials and find the bucket and distribution,
2. run `npm ci && npm run build` (unless `SKIP_BUILD=1`),
3. upload `assets/*` with a one-year immutable cache (file names are content-hashed),
4. upload `index.html` with `no-cache`, so browsers pick up new builds immediately,
5. invalidate `/` and `/index.html` on CloudFront.

**Local development against the live API:** `npm run dev:live` (see `README.md`). It uses a
local proxy, so the API's CORS settings don't need to change.

**Automatic deploys.** `.github/workflows/deploy-web.yml` (at the repo root) deploys on every
push to `main` that changes `web/`, once the secrets and variables listed at its top are set.

---

## Monitoring and cost evidence for the report

- **CloudFront → Monitoring** shows requests, bytes transferred and 4xx/5xx rates.
- **API Gateway / Lambda → Monitoring** shows `/estimate` latency and errors. Cold starts load
  the model, so the frontend waits up to 20 s before showing a timeout.
- For the cost comparison, price S3 and CloudFront for your 1k / 50k / 500k monthly request
  scenarios in the [AWS Pricing Calculator](https://calculator.aws/) (Asia Pacific
  (Singapore)). The site is about 0.4 MB, so static hosting will be a small share next to
  Lambda, API Gateway and DynamoDB.

---

## Tearing down after grading (route B only)

The bucket is versioned, so empty every version before deleting the stack:

```bash
BUCKET=$(aws cloudformation describe-stacks --stack-name hdb-resale-frontend \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
aws s3api delete-objects --bucket "$BUCKET" --delete "$(aws s3api list-object-versions \
  --bucket "$BUCKET" --output json \
  --query '{Objects: [Versions, DeleteMarkers][][].{Key: Key, VersionId: VersionId}}')"
aws cloudformation delete-stack --stack-name hdb-resale-frontend
```

Keep everything up until marks are released.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Yellow demo banner after deploying | The build was made with `VITE_ESTIMATE_URL` set to empty (check `.env*` files and CI variables), or `dist/` came from `npm run dev` settings. Rebuild with `npm run build`. |
| "Couldn't reach the price service" and a CORS error in the console | The site's domain isn't in the API's CORS allow-list. Use route A, or add the domain (`docs/API.md`). |
| "Took longer than 20 seconds" | Lambda cold start or a slow DynamoDB query. Try again; check Lambda duration in CloudWatch. |
| Every check says "Not enough similar sales" | Usually the street. Same-street matches carry 15 of 100 points, and the rule needs two of the top five to score 75+, which is only possible with a street match. Use HDB's spelling (e.g. `ANG MO KIO AVE 10`). |
| `AccessDenied` XML page | Files missing from the bucket, or (route B) the bucket policy is missing. Check with `aws s3 ls s3://$BUCKET`. |
| Old version still showing | Hard-refresh. If it persists: `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"`. |

---

## Appendix: console-only route B (no CloudFormation)

1. **S3 → Create bucket** in ap-southeast-1. Keep *Block all public access* on. Enable
   versioning and default encryption.
2. Upload the **contents** of `dist/` (not the folder) to the bucket root.
3. **CloudFront → Create distribution**. Origin: the bucket (not the website endpoint). Origin
   access: **Origin access control settings** → create a new OAC. Viewer protocol: *Redirect
   HTTP to HTTPS*. Cache policy: *CachingOptimized*. Response headers:
   *SecurityHeadersPolicy*. Default root object: `index.html`.
4. Copy the bucket policy CloudFront offers into S3 → bucket → *Permissions → Bucket policy*.
5. Add the distribution's domain to the API's CORS settings (`docs/API.md`).
