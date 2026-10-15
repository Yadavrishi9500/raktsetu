#!/bin/bash
# Logs the instance's Docker daemon into ECR before Beanstalk pulls the image.
# Uses the instance profile (needs ecr:GetAuthorizationToken + read on the repo).
set -euo pipefail
IMAGE=$(awk '/image:/ {print $2; exit}' docker-compose.yml)
REGISTRY=${IMAGE%%/*}
REGION=$(echo "$REGISTRY" | cut -d. -f4)
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
