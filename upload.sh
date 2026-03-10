#!/usr/bin/env bash
set -euo pipefail

IMAGE="ghcr.io/the12forest/standuptracker"
TAG="${1:-latest}"

echo "==> Building ${IMAGE}:${TAG}..."
if ! docker build -t "${IMAGE}:${TAG}" .; then
  echo "ERROR: Docker build failed."
  exit 1
fi

# Also tag as latest if a version tag was provided
if [ "${TAG}" != "latest" ]; then
  docker tag "${IMAGE}:${TAG}" "${IMAGE}:latest"
fi

echo "==> Pushing ${IMAGE}:${TAG}..."
if ! docker push "${IMAGE}:${TAG}"; then
  echo "ERROR: Docker push failed for ${IMAGE}:${TAG}."
  echo "Make sure you are logged in: docker login ghcr.io"
  exit 1
fi

if [ "${TAG}" != "latest" ]; then
  echo "==> Pushing ${IMAGE}:latest..."
  if ! docker push "${IMAGE}:latest"; then
    echo "ERROR: Docker push failed for ${IMAGE}:latest."
    exit 1
  fi
fi

echo ""
echo "Done. Published:"
echo "  ${IMAGE}:${TAG}"
if [ "${TAG}" != "latest" ]; then
  echo "  ${IMAGE}:latest"
fi
