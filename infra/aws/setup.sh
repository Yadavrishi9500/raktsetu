#!/usr/bin/env bash
# One script, four steps, run in order:
#   ./infra/aws/setup.sh core       # ECR, SNS, SQS, RDS, IAM            (CloudFormation, ~10 min)
#   ./infra/aws/setup.sh envs       # Beanstalk app + web/worker envs    (~8 min)
#   (build + push the image and deploy: run raktsetu-deploy on the Chef CI node, or ./deploy/deploy.sh)
#   ./infra/aws/setup.sh cdn        # S3 + CloudFront, links PUBLIC_BASE_URL into both envs
#   ./infra/aws/setup.sh frontend   # builds React, uploads to S3, invalidates CloudFront
#   ./infra/aws/setup.sh outputs    # prints the values the Chef node attributes need
#
# Required env: AWS_REGION, ADMIN_EMAIL, DB_PASSWORD (12+ letters/digits), ADMIN_PASSWORD
set -euo pipefail

REGION=${AWS_REGION:?set AWS_REGION, e.g. ap-south-1}
APP=${APP:-raktsetu}
CORE_STACK=${CORE_STACK:-$APP-core}
CDN_STACK=${CDN_STACK:-$APP-cdn}
WEB_ENV=${WEB_ENV:-$APP-web}
WORKER_ENV=${WORKER_ENV:-$APP-worker}
INSTANCE_TYPE=${INSTANCE_TYPE:-t3.small}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
export AWS_PAGER=""

out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$1" \
          --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text; }
log() { printf '\n==> %s\n' "$*"; }

step_core() {
  : "${ADMIN_EMAIL:?set ADMIN_EMAIL}" "${DB_PASSWORD:?set DB_PASSWORD}"
  log "Deploying $CORE_STACK (RDS takes ~10 minutes)"
  aws cloudformation deploy --region "$REGION" --stack-name "$CORE_STACK" \
    --template-file "$ROOT/infra/aws/core.yaml" --capabilities CAPABILITY_IAM \
    --parameter-overrides AppName="$APP" AdminEmail="$ADMIN_EMAIL" DbPassword="$DB_PASSWORD"
  log "Done. Confirm the SNS subscription email sent to $ADMIN_EMAIL."
}

env_settings() { # role -> JSON option settings
  local role=$1
  local db_host; db_host=$(out "$CORE_STACK" DatabaseEndpoint)
  local seed=false; [ "$role" = web ] && seed=${SEED_DEMO:-true}
  cat <<JSON
[
  {"Namespace":"aws:autoscaling:launchconfiguration","OptionName":"IamInstanceProfile","Value":"$(out "$CORE_STACK" InstanceProfileName)"},
  {"Namespace":"aws:autoscaling:launchconfiguration","OptionName":"SecurityGroups","Value":"$(out "$CORE_STACK" AppSecurityGroupId)"},
  {"Namespace":"aws:ec2:instances","OptionName":"InstanceTypes","Value":"$INSTANCE_TYPE"},
  {"Namespace":"aws:elasticbeanstalk:environment","OptionName":"EnvironmentType","Value":"SingleInstance"},
  {"Namespace":"aws:elasticbeanstalk:environment","OptionName":"ServiceRole","Value":"$(out "$CORE_STACK" ServiceRoleArn)"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"NODE_ENV","Value":"production"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"DATABASE_URL","Value":"postgres://$APP:$DB_PASSWORD@$db_host:5432/$APP"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"DB_SSL","Value":"verify"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"JWT_SECRET","Value":"$JWT_SECRET"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"NOTIFY_MODE","Value":"sns"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"AWS_REGION","Value":"$REGION"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"SNS_EVENTS_TOPIC_ARN","Value":"$(out "$CORE_STACK" EventsTopicArn)"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"SNS_DONOR_EMAIL_TOPIC_ARN","Value":"$(out "$CORE_STACK" DonorEmailTopicArn)"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"SNS_ADMIN_TOPIC_ARN","Value":"$(out "$CORE_STACK" AdminTopicArn)"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"PUBLIC_BASE_URL","Value":"http://localhost:8080"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"ADMIN_EMAIL","Value":"$ADMIN_EMAIL"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"ADMIN_PASSWORD","Value":"$ADMIN_PASSWORD"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"SEED_DEMO","Value":"$seed"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"SMS_SENDER_ID","Value":"${SMS_SENDER_ID:-}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"SMS_DLT_ENTITY_ID","Value":"${SMS_DLT_ENTITY_ID:-}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"SMS_DLT_TEMPLATE_ID","Value":"${SMS_DLT_TEMPLATE_ID:-}"}
  $( [ "$role" = worker ] && echo ",{\"Namespace\":\"aws:elasticbeanstalk:sqsd\",\"OptionName\":\"WorkerQueueURL\",\"Value\":\"$(out "$CORE_STACK" WorkerQueueUrl)\"}" )
]
JSON
}

step_envs() {
  : "${ADMIN_EMAIL:?}" "${DB_PASSWORD:?}" "${ADMIN_PASSWORD:?set ADMIN_PASSWORD (first admin login)}"
  JWT_SECRET=${JWT_SECRET:-$(openssl rand -hex 32)}
  local stack
  stack=$(aws elasticbeanstalk list-available-solution-stacks --region "$REGION" \
    --query "SolutionStacks[?contains(@, 'Amazon Linux 2023') && ends_with(@, 'running Docker')] | [0]" --output text)
  log "Platform: $stack"
  aws elasticbeanstalk describe-applications --region "$REGION" --application-names "$APP" \
    --query 'Applications[0].ApplicationName' --output text | grep -q "$APP" \
    || aws elasticbeanstalk create-application --region "$REGION" --application-name "$APP" >/dev/null

  for role in web worker; do
    local env=$WEB_ENV tier=()
    [ "$role" = worker ] && env=$WORKER_ENV && tier=(--tier Name=Worker,Type=SQS,Version=1.0)
    if aws elasticbeanstalk describe-environments --region "$REGION" --environment-names "$env" \
         --query 'Environments[?Status!=`Terminated`].EnvironmentName' --output text | grep -q "$env"; then
      log "$env already exists, skipping"
      continue
    fi
    log "Creating $env"
    env_settings "$role" > "/tmp/$env-options.json"
    local cname=()
    [ "$role" = web ] && cname=(--cname-prefix "${CNAME_PREFIX:-$APP-$(openssl rand -hex 3)}")
    aws elasticbeanstalk create-environment --region "$REGION" --application-name "$APP" \
      --environment-name "$env" --solution-stack-name "$stack" "${tier[@]}" "${cname[@]}" \
      --option-settings "file:///tmp/$env-options.json" >/dev/null
    rm -f "/tmp/$env-options.json"
  done
  log "Waiting for environments to launch"
  aws elasticbeanstalk wait environment-exists --region "$REGION" --environment-names "$WEB_ENV" "$WORKER_ENV"
  log "Ready. Web env CNAME: $(aws elasticbeanstalk describe-environments --region "$REGION" --environment-names "$WEB_ENV" --query 'Environments[0].CNAME' --output text)"
  log "Next: deploy the backend image (Chef CI node: sudo -u deploy raktsetu-deploy --force)"
}

step_cdn() {
  local cname
  cname=$(aws elasticbeanstalk describe-environments --region "$REGION" --environment-names "$WEB_ENV" --query 'Environments[0].CNAME' --output text)
  log "Deploying $CDN_STACK in front of $cname"
  aws cloudformation deploy --region "$REGION" --stack-name "$CDN_STACK" \
    --template-file "$ROOT/infra/aws/cdn.yaml" --parameter-overrides AppName="$APP" WebEnvDomain="$cname"
  local domain; domain=$(out "$CDN_STACK" DistributionDomain)
  log "Setting PUBLIC_BASE_URL=https://$domain on both environments"
  for env in "$WEB_ENV" "$WORKER_ENV"; do
    aws elasticbeanstalk update-environment --region "$REGION" --environment-name "$env" \
      --option-settings "Namespace=aws:elasticbeanstalk:application:environment,OptionName=PUBLIC_BASE_URL,Value=https://$domain" >/dev/null
  done
  aws elasticbeanstalk wait environment-updated --region "$REGION" --environment-names "$WEB_ENV" "$WORKER_ENV"
  log "RaktSetu will be live at https://$domain after: ./infra/aws/setup.sh frontend"
}

step_frontend() {
  local bucket dist
  bucket=$(out "$CDN_STACK" FrontendBucketName)
  dist=$(out "$CDN_STACK" DistributionId)
  log "Building frontend"
  (cd "$ROOT/frontend" && npm ci && npm run build)
  log "Uploading to s3://$bucket"
  aws s3 sync "$ROOT/frontend/dist/assets" "s3://$bucket/assets" --region "$REGION" --delete \
    --cache-control "public, max-age=31536000, immutable" --only-show-errors
  aws s3 sync "$ROOT/frontend/dist" "s3://$bucket" --region "$REGION" --delete --exclude "assets/*" \
    --cache-control "no-cache" --only-show-errors
  aws cloudfront create-invalidation --distribution-id "$dist" --paths "/index.html" "/" >/dev/null
  log "Live at https://$(out "$CDN_STACK" DistributionDomain)"
}

step_outputs() {
  echo "ecr_repo_uri  = $(out "$CORE_STACK" EcrRepositoryUri)"
  echo "ci_profile    = $(out "$CORE_STACK" CiInstanceProfileName)"
  echo "worker_dlq    = $(out "$CORE_STACK" WorkerDeadLetterQueueUrl)"
  echo "db_endpoint   = $(out "$CORE_STACK" DatabaseEndpoint)"
}

case "${1:-}" in
  core) step_core ;;
  envs) step_envs ;;
  cdn) step_cdn ;;
  frontend) step_frontend ;;
  outputs) step_outputs ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
