#!/usr/bin/env bash
# Build the web client and publish it to S3 + CloudFront.
#
# Into the team's existing site (DEPLOY.md route A):
#   BUCKET=<bucket> DISTRIBUTION_ID=<id> bash scripts/deploy.sh
# Into the stack from infra/frontend.yaml (route B):
#   bash scripts/deploy.sh
#
# Env vars:
#   VITE_ESTIMATE_URL  API to build against (default: the team API in src/config.ts)
#   BUCKET, DISTRIBUTION_ID  Target an existing bucket/distribution instead of the stack
#   STACK_NAME   CloudFormation stack name        (default: hdb-resale-frontend)
#   AWS_REGION   Region                           (default: ap-southeast-1)
#   SKIP_BUILD=1 Upload the existing dist/ without rebuilding
set -euo pipefail

STACK_NAME="${STACK_NAME:-hdb-resale-frontend}"
export AWS_REGION="${AWS_REGION:-ap-southeast-1}"
cd "$(dirname "$0")/.."

command -v aws >/dev/null || { echo "AWS CLI not found. Install it: https://aws.amazon.com/cli/"; exit 1; }
aws sts get-caller-identity --query Account --output text >/dev/null \
  || { echo "AWS credentials are missing or expired. Run 'aws configure' or refresh your session."; exit 1; }

output() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

if [[ -n "${BUCKET:-}" && -n "${DISTRIBUTION_ID:-}" ]]; then
  DIST_ID="$DISTRIBUTION_ID"
  SITE_URL="https://$(aws cloudfront get-distribution --id "$DIST_ID" --query Distribution.DomainName --output text)"
else
  BUCKET="$(output BucketName)"
  DIST_ID="$(output DistributionId)"
  SITE_URL="$(output SiteUrl)"
  if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
    echo "Stack '$STACK_NAME' not found in $AWS_REGION. Create it (DEPLOY.md route B) or set BUCKET and DISTRIBUTION_ID (route A)."
    exit 1
  fi
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "Building against: ${VITE_ESTIMATE_URL-the team API (default in src/config.ts)}"
  npm ci
  npm run check
  npm run build
fi

echo "Uploading hashed assets (cached for a year)…"
# No --delete here: browsers that still have the previous index.html must be able
# to fetch the previous bundle and fonts. Hashed files are small and never clash.
aws s3 sync dist/assets "s3://$BUCKET/assets" \
  --cache-control "public, max-age=31536000, immutable"

echo "Uploading index.html and other root files (always revalidated)…"
aws s3 sync dist "s3://$BUCKET" --delete --exclude "assets/*" \
  --cache-control "no-cache"

echo "Invalidating CloudFront cache for index.html…"
INV_ID="$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
  --paths "/" "/index.html" --query Invalidation.Id --output text)"
echo "Invalidation $INV_ID started (usually under a minute)."

echo
echo "Deployed: $SITE_URL"
