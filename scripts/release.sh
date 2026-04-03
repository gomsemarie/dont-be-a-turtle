#!/bin/bash
set -e

# Usage: ./scripts/release.sh 1.3.1
#        ./scripts/release.sh patch   (1.2.0 → 1.2.1)
#        ./scripts/release.sh minor   (1.2.0 → 1.3.0)
#        ./scripts/release.sh major   (1.2.0 → 2.0.0)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Read current version from config.json
CURRENT=$(grep -o '"version": "[^"]*"' config.json | head -1 | cut -d'"' -f4)
echo "현재 버전: v$CURRENT"

# Determine new version
if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW="$1"
elif [[ "$1" == "patch" || "$1" == "minor" || "$1" == "major" ]]; then
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$1" in
    patch) PATCH=$((PATCH + 1)) ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  esac
  NEW="$MAJOR.$MINOR.$PATCH"
else
  echo "사용법: $0 <patch|minor|major|X.Y.Z>"
  echo "  예시: $0 patch       → $CURRENT 의 패치 버전 올림"
  echo "  예시: $0 1.4.0       → 직접 지정"
  exit 1
fi

echo "새 버전:  v$NEW"
echo ""

# Update version in all files
FILES=(
  "package.json"
  "apps/desktop/package.json"
  "packages/ui/package.json"
  "config.json"
)

for f in "${FILES[@]}"; do
  sed -i.bak "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" "$f"
  rm -f "$f.bak"
  echo "  ✓ $f"
done

# macOS .icns rebuild (if iconutil available)
if command -v iconutil &> /dev/null && [ -d "resources/icon.iconset" ]; then
  iconutil -c icns resources/icon.iconset -o resources/icon.icns
  echo "  ✓ icon.icns 재생성"
fi

echo ""

# Git commit, tag, push
git add -A
git commit -m "v$NEW"
git tag "v$NEW"
git push origin main --tags

echo ""
echo "v$NEW 배포 시작! GitHub Actions에서 빌드 진행 중..."
echo "https://github.com/gomsemarie/dont-be-a-turtle/actions"
