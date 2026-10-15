#!/usr/bin/env bash
# Builds the backend image, pushes it to ECR and rolls it out to both Beanstalk environments.
# Run by the Chef-managed CI node (raktsetu-deploy), or by hand from any machine with Docker + AWS CLI.
#
#   AWS_REGION=ap-south-1 ECR_REPO_URI=<acct>.dkr.ecr.ap-south-1.amazonaws.com/raktsetu \
#   EB_WEB_ENV=raktsetu-web EB_WORKER_ENV=raktsetu-worker ./deploy/deploy.sh
set -euo pipefail

: "${AWS_REGION:?set AWS_REGION}"
: "${ECR_REPO_URI:?set ECR_REPO_URI}"
: "${EB_WEB_ENV:?set EB_WEB_ENV}"
: "${EB_WORKER_ENV:?set EB_WORKER_ENV}"
EB_APP=${EB_APP:-raktsetu}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TAG=${TAG:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}
IMAGE="$ECR_REPO_URI:$TAG"
REGISTRY=${ECR_REPO_URI%%/*}
STAMP=$(date +%Y%m%d-%H%M%S)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

log "Logging in to ECR $REGISTRY"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

log "Building $IMAGE"
docker build --pull -t "$IMAGE" "$ROOT/backend"
docker tag "$IMAGE" "$ECR_REPO_URI:latest"

log "Pushing $IMAGE"
docker push "$IMAGE"
docker push "$ECR_REPO_URI:latest"

BUCKET=$(aws elasticbeanstalk create-storage-location --region "$AWS_REGION" --query S3Bucket --output text)

bundle() { # role -> zip path
  local role=$1 dir="$WORK/$1"
  mkdir -p "$dir"
  cp -R "$ROOT/deploy/common/." "$dir/"
  cp -R "$ROOT/deploy/$role/." "$dir/"
  sed "s|__IMAGE__|$IMAGE|" "$dir/docker-compose.yml.tpl" > "$dir/docker-compose.yml"
  rm "$dir/docker-compose.yml.tpl"
  chmod +x "$dir"/.platform/*/prebuild/*.sh
  (cd "$dir" && zip -qr "$WORK/$role.zip" .)
  echo "$WORK/$role.zip"
}

release() { # role env
  local role=$1 env=$2 label="$TAG-$role-$STAMP"
  local zip key="raktsetu/$label.zip"
  zip=$(bundle "$role")
  log "Uploading $role bundle -> s3://$BUCKET/$key"
  aws s3 cp --region "$AWS_REGION" "$zip" "s3://$BUCKET/$key" --only-show-errors
  aws elasticbeanstalk create-application-version --region "$AWS_REGION" \
    --application-name "$EB_APP" --version-label "$label" \
    --source-bundle "S3Bucket=$BUCKET,S3Key=$key" --process --no-cli-pager >/dev/null
  for _ in $(seq 1 30); do
    local status
    status=$(aws elasticbeanstalk describe-application-versions --region "$AWS_REGION" \
      --application-name "$EB_APP" --version-labels "$label" --query 'ApplicationVersions[0].Status' --output text)
    [ "$status" = "PROCESSED" ] && break
    [ "$status" = "FAILED" ] && { echo "Version $label failed to process" >&2; exit 1; }
    sleep 4
  done
  log "Deploying $label to $env"
  aws elasticbeanstalk update-environment --region "$AWS_REGION" \
    --environment-name "$env" --version-label "$label" --no-cli-pager >/dev/null
}

release web "$EB_WEB_ENV"
release worker "$EB_WORKER_ENV"

log "Waiting for environments to finish updating"
aws elasticbeanstalk wait environment-updated --region "$AWS_REGION" --environment-names "$EB_WEB_ENV" "$EB_WORKER_ENV"
aws elasticbeanstalk describe-environments --region "$AWS_REGION" --environment-names "$EB_WEB_ENV" "$EB_WORKER_ENV" \
  --query 'Environments[].[EnvironmentName,Health,VersionLabel]' --output table
log "Deployed $IMAGE"
