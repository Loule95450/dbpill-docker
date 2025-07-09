#!/usr/bin/env bash
# Make executables for macOS (arm64 + x64), Linux (arm64 + x64) and Windows (arm64 + x64)
# Requires: curl, tar, unzip, postject, codesign (macOS), Node.js >= v22 with SEA enabled.
# Optional: set NODE_VERSION env var to override Node version.

set -euo pipefail

# Function to show usage
show_usage() {
  echo "Usage: $0 [mac|win|linux|all]"
  echo ""
  echo "Arguments:"
  echo "  mac     Build only macOS executables (arm64 + x64)"
  echo "  win     Build only Windows executables (arm64 + x64)"  
  echo "  linux   Build only Linux executables (arm64 + x64)"
  echo "  all     Build for all platforms (default)"
  echo ""
  echo "Note: macOS builds require notarization setup if MAC_NOTARIZE_PROFILE is set"
  exit 1
}

# Parse command line arguments
PLATFORM="${1:-all}"
case "$PLATFORM" in
  mac|win|linux|all)
    ;;
  -h|--help)
    show_usage
    ;;
  *)
    echo "Error: Invalid platform '$PLATFORM'"
    show_usage
    ;;
esac

# Load environment variables from .env if present so that AWS/Apple credentials & config are available
if [[ -f ".env" ]]; then
  echo "Loading variables from .env"
  set -o allexport
  # shellcheck disable=SC1091
  source .env
  set +o allexport
fi

NODE_VERSION="${NODE_VERSION:-24.3.0}"

# Define all possible targets
ALL_TARGETS=(
  "darwin arm64"
  "darwin x64"
  "linux arm64"
  "linux x64"
  "win arm64"
  "win x64"
)

# Select targets based on platform argument
case "$PLATFORM" in
  mac)
    TARGETS=(
      "darwin arm64"
      "darwin x64"
    )
    ;;
  win)
    TARGETS=(
      "win arm64"
      "win x64"
    )
    ;;
  linux)
    TARGETS=(
      "linux arm64"
      "linux x64"
    )
    ;;
  all)
    TARGETS=("${ALL_TARGETS[@]}")
    ;;
esac

echo "Building for platform(s): $PLATFORM"
echo "Selected targets: ${TARGETS[*]}"

# Check macOS notarization setup when building for mac
if [[ "$PLATFORM" == "mac" || "$PLATFORM" == "all" ]]; then
  if [[ -z "${MAC_NOTARIZE_PROFILE:-}" ]]; then
    echo "Warning: MAC_NOTARIZE_PROFILE not set. macOS binaries will be built but not notarized."
    echo "To enable notarization, set up a keychain profile and export MAC_NOTARIZE_PROFILE."
  else
    echo "macOS notarization enabled with profile: $MAC_NOTARIZE_PROFILE"
  fi
fi

# Sentinel copied from existing make_executable.sh
SENTINEL="NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
APP_NAME="dbpill"
APP_VERSION=$(node -p "require('./package.json').version")
BUILD_DIR="build"
CACHE_DIR="cache"
ENTITLEMENTS="sea.entitlements"

# Create necessary directories
mkdir -p "$BUILD_DIR" "$CACHE_DIR"

###############################################################################
# Step 1: Build the project and create the SEA payload (platform-agnostic).
###############################################################################

echo "[1/4] Building project and SEA blob"

npm run build

npx esbuild run_executable.ts \
       --bundle --platform=node --format=cjs \
       --outfile=server.bundle.cjs

node --experimental-sea-config sea-config.json  # produces sea-prep.blob

echo "SEA blob generated (sea-prep.blob)"

###############################################################################
# Step 2: Iterate over targets and patch the correct Node runtime.
###############################################################################

echo "[2/4] Building executables for all platforms"

for tuple in "${TARGETS[@]}"; do
  read -r OS ARCH <<<"$tuple"
  echo "\n=== Building for $OS-$ARCH ==="

  case "$OS" in
    win)
      EXT="zip"
      OUT_EXT=".exe"
      BIN_PATH="node.exe"
      README_EXT=".txt"
      ;;
    *)
      EXT="tar.gz"
      OUT_EXT=""
      BIN_PATH="bin/node"
      README_EXT=""
      ;;
  esac

  PKG="node-v${NODE_VERSION}-${OS}-${ARCH}.${EXT}"
  URL="https://nodejs.org/dist/v${NODE_VERSION}/${PKG}"
  CACHED_PKG="${CACHE_DIR}/${PKG}"

  WORKDIR="${BUILD_DIR}/${OS}-${ARCH}"
  rm -rf "$WORKDIR" && mkdir -p "$WORKDIR"

  # Download Node archive if not cached
  if [[ ! -f "$CACHED_PKG" ]]; then
    echo "Downloading $PKG to cache..."
    curl -L --progress-bar -o "$CACHED_PKG" "$URL"
  else
    echo "Using cached $PKG"
  fi

  # Extract archive
  case "$EXT" in
    zip)
      unzip -qo "$CACHED_PKG" -d "$WORKDIR" ;;
    tar.gz)
      tar -xzf "$CACHED_PKG" -C "$WORKDIR" ;;
    tar.xz)
      tar -xf "$CACHED_PKG" -C "$WORKDIR" ;;
  esac

  # Locate the node binary that was extracted and copy to top-level WORKDIR
  BIN_SRC=$(find "$WORKDIR" -type f -path "*/${BIN_PATH}" | head -n 1)
  if [[ -z "$BIN_SRC" ]]; then
    echo "Error: could not locate Node binary in $WORKDIR" >&2
    exit 1
  fi
  cp "$BIN_SRC" "$WORKDIR/${APP_NAME}${OUT_EXT}"

  # Clean up extracted Node folder (keep only our executable)
  find "$WORKDIR" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +

  # Inject the SEA blob
  npx postject "$WORKDIR/${APP_NAME}${OUT_EXT}" NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse "$SENTINEL" \
    --macho-segment-name NODE_SEA

  # Codesign macOS binaries so they can be executed locally
  if [[ "$OS" == "darwin" ]]; then
    codesign --remove-signature "$WORKDIR/${APP_NAME}${OUT_EXT}"
    if [[ -n "${MAC_CODESIGN_IDENTITY:-}" ]]; then
      echo "Signing with identity: $MAC_CODESIGN_IDENTITY (hardened runtime, JIT entitlement)"
      codesign --sign "$MAC_CODESIGN_IDENTITY" \
              --options runtime \
              --entitlements "$ENTITLEMENTS" \
              --timestamp "$WORKDIR/${APP_NAME}${OUT_EXT}"
    else
      echo "Signing with ad-hoc identity (hardened runtime, JIT entitlement)"
      codesign --sign - \
              --options runtime \
              --entitlements "$ENTITLEMENTS" \
              "$WORKDIR/${APP_NAME}${OUT_EXT}"
    fi
  fi

  echo "Built: $WORKDIR/${APP_NAME}${OUT_EXT}"
done

###############################################################################
# Step 3: Create README files and archives (zip for macOS, tar.gz otherwise)
###############################################################################

echo "[3/4] Creating archives with README files"

for tuple in "${TARGETS[@]}"; do
  read -r OS ARCH <<<"$tuple"
  
  case "$OS" in
    win)
      OUT_EXT=".exe"
      README_EXT=".txt"
      ;;
    *)
      OUT_EXT=""
      README_EXT=""
      ;;
  esac

  WORKDIR="${BUILD_DIR}/${OS}-${ARCH}"
  README_FILE="${WORKDIR}/README${README_EXT}"
  
  # Create README file
  cat > "$README_FILE" << EOF
dbpill
======

dbpill is a database optimization tool that runs a PostgreSQL proxy that intercepts all queries your app makes, provides detailed query analyses, and proposes AI suggested optimizations that you can instantly apply & measure (and revert if needed) in one click.

Run dbpill from your terminal with:

./dbpill postgres://username:password@host:port/database

This will run the proxy & interface, all you need to do is point your application's database to the proxy's address, noted in the command output. The web interface will be available at http://localhost:3000/ where you can view all queries and apply optimizations.

If you need help, run:
./dbpill --help

If it doesn't work and you'd like to send us your output as a bug report, run:
./dbpill --verbose

If you'd like to export the query logs & detailed analyses, they will be saved to a sqlite file in the same directory as the executable called dbpill.sqlite.db

For more information and documentation, visit:
https://dbpill.com

For help, email help@dbpill.com

Platform: ${OS}-${ARCH}
Version: ${APP_VERSION}
Build Date: $(date)
Author: Murat Ayfer (https://x.com/mayfer)
EOF

  # Determine archive extension (.zip for macOS as required for notarization, .tar.gz for other platforms)
  if [[ "$OS" == "darwin" || "$OS" == "win" ]]; then
    ARCHIVE_EXT="zip"
  else
    ARCHIVE_EXT="tar.gz"
  fi
  ARCHIVE_NAME="${APP_NAME}-${APP_VERSION}-${OS}-${ARCH}.${ARCHIVE_EXT}"
  ARCHIVE_BASE="${APP_NAME}-${APP_VERSION}-${OS}-${ARCH}"
  ARCHIVE_DIR="${BUILD_DIR}/${ARCHIVE_BASE}"
  echo "Creating archive: $ARCHIVE_NAME"
  
  # Create a directory with the desired archive name and copy contents
  rm -rf "$ARCHIVE_DIR" && mkdir -p "$ARCHIVE_DIR"
  cp -R "$WORKDIR"/* "$ARCHIVE_DIR/"
  
  # Create archive from the properly named directory
  if [[ "$ARCHIVE_EXT" == "zip" ]]; then
    # Use ditto to preserve permissions and extended attributes (including notarization tickets)
    ditto -c -k --keepParent --sequesterRsrc --rsrc "$ARCHIVE_DIR" "${BUILD_DIR}/$ARCHIVE_NAME"
  else
    tar -czf "${BUILD_DIR}/$ARCHIVE_NAME" -C "$BUILD_DIR" "$ARCHIVE_BASE"
  fi
  
  # Clean up the temporary archive directory
  rm -rf "$ARCHIVE_DIR"

  echo "Archive created: $ARCHIVE_NAME"

  # Optionally notarize macOS archives (requires a configured notarytool keychain profile)
  if [[ "$OS" == "darwin" && -n "${MAC_NOTARIZE_PROFILE:-}" ]]; then
    echo "Submitting $ARCHIVE_NAME for notarization (profile: $MAC_NOTARIZE_PROFILE) ..."
    xcrun notarytool submit "${BUILD_DIR}/$ARCHIVE_NAME" --keychain-profile "$MAC_NOTARIZE_PROFILE" --wait
    
    # After successful notarization, staple the executable inside the workdir
    echo "Stapling notarization ticket to executable..."
    if xcrun stapler staple "$WORKDIR/${APP_NAME}${OUT_EXT}"; then
      echo "Successfully stapled ticket to executable"
      # Recreate the archive with the stapled executable
      echo "Recreating archive with stapled executable..."
      # Recreate the properly named directory and copy contents
      rm -rf "$ARCHIVE_DIR" && mkdir -p "$ARCHIVE_DIR"
      cp -R "$WORKDIR"/* "$ARCHIVE_DIR/"
      if [[ "$ARCHIVE_EXT" == "zip" ]]; then
        ditto -c -k --keepParent --sequesterRsrc --rsrc "$ARCHIVE_DIR" "${BUILD_DIR}/$ARCHIVE_NAME"
      else
        tar -czf "${BUILD_DIR}/$ARCHIVE_NAME" -C "$BUILD_DIR" "$ARCHIVE_BASE"
      fi
      # Clean up the temporary archive directory
      rm -rf "$ARCHIVE_DIR"
    else
      echo "Warning: Failed to staple ticket to executable. Archive notarization may still work."
    fi
    
    # 'stapler' cannot operate on .zip archives. It works with .app, .pkg, or .dmg bundles.
    if [[ "$ARCHIVE_EXT" != "zip" ]]; then
      echo "Stapling notarization ticket to archive"
      xcrun stapler staple "${BUILD_DIR}/$ARCHIVE_NAME"
    else
      echo "Note: .zip archives cannot be stapled, but executable inside is stapled."
    fi
  fi

  # Optionally upload the archive to S3 when S3_BUCKET is defined (requires AWS CLI)
  if [[ -n "${S3_BUCKET:-}" ]]; then
    echo "Uploading $ARCHIVE_NAME to s3://$S3_BUCKET/"
    aws s3 cp "${BUILD_DIR}/$ARCHIVE_NAME" "s3://${S3_BUCKET}/${ARCHIVE_NAME}" --acl public-read
    echo "✓ Upload complete. Download URL: https://${S3_BUCKET}.s3.amazonaws.com/${ARCHIVE_NAME}"
  fi
done

###############################################################################
# Step 4: Cleanup and summary
###############################################################################

echo "[4/4] Cleanup and summary"

# Clean up temporary files
rm -f sea-prep.blob server.bundle.cjs

echo "\nBuild complete for platform(s): $PLATFORM!"
echo "Archives created:"
for tuple in "${TARGETS[@]}"; do
  read -r OS ARCH <<<"$tuple"
  if [[ "$OS" == "darwin" || "$OS" == "win" ]]; then
    ARCHIVE_EXT="zip"
  else
    ARCHIVE_EXT="tar.gz"
  fi
  echo "  ${APP_NAME}-${APP_VERSION}-${OS}-${ARCH}.${ARCHIVE_EXT}"
done

echo "\nExecutables are also available in ./${BUILD_DIR}/ for testing"
echo "Downloaded Node.js archives are cached in ./${CACHE_DIR}/" 