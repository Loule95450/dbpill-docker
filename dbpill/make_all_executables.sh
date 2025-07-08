#!/usr/bin/env bash
# Make executables for macOS (arm64 + x64), Linux (arm64 + x64) and Windows (arm64 + x64)
# Requires: curl, tar, unzip, postject, codesign (macOS), Node.js >= v22 with SEA enabled.
# Optional: set NODE_VERSION env var to override Node version.

set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.2.0}"
# Tuple list: "os arch"
TARGETS=(
  "darwin arm64"
  "darwin x64"
  "linux arm64"
  "linux x64"
  "win arm64"
  "win x64"
)

# Sentinel copied from existing make_executable.sh
SENTINEL="NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
APP_NAME="dbpill"
BUILD_DIR="build"

###############################################################################
# Step 1: Build the project and create the SEA payload (platform-agnostic).
###############################################################################

echo "[1/3] Building project and SEA blob"

npm run build

npx esbuild run_executable.ts \
       --bundle --platform=node --format=cjs \
       --outfile=server.bundle.cjs

node --experimental-sea-config sea-config.json  # produces sea-prep.blob

echo "SEA blob generated (sea-prep.blob)"

###############################################################################
# Step 2: Iterate over targets and patch the correct Node runtime.
###############################################################################

for tuple in "${TARGETS[@]}"; do
  read -r OS ARCH <<<"$tuple"
  echo "\n=== Building for $OS-$ARCH ==="

  case "$OS" in
    win)
      EXT="zip"
      OUT_EXT=".exe"
      BIN_PATH="node.exe"
      ;;
    *)
      EXT="tar.xz"
      OUT_EXT=""
      BIN_PATH="bin/node"
      ;;
  esac

  PKG="node-v${NODE_VERSION}-${OS}-${ARCH}.${EXT}"
  URL="https://nodejs.org/dist/v${NODE_VERSION}/${PKG}"

  WORKDIR="${BUILD_DIR}/${OS}-${ARCH}"
  rm -rf "$WORKDIR" && mkdir -p "$WORKDIR"

  # Download Node archive if not cached
  if [[ ! -f "$PKG" ]]; then
    echo "Downloading $PKG ..."
    curl -L --progress-bar -o "$PKG" "$URL"
  else
    echo "Using cached $PKG"
  fi

  # Extract archive
  case "$EXT" in
    zip)
      unzip -qo "$PKG" -d "$WORKDIR" ;;
    tar.xz)
      tar -xf "$PKG" -C "$WORKDIR" ;;
  esac

  # Locate the node binary that was extracted and copy to top-level WORKDIR
  BIN_SRC=$(find "$WORKDIR" -type f -path "*/${BIN_PATH}" | head -n 1)
  if [[ -z "$BIN_SRC" ]]; then
    echo "Error: could not locate Node binary in $WORKDIR" >&2
    exit 1
  fi
  cp "$BIN_SRC" "$WORKDIR/${APP_NAME}${OUT_EXT}"

  # Inject the SEA blob
  npx postject "$WORKDIR/${APP_NAME}${OUT_EXT}" NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse "$SENTINEL" \
    --macho-segment-name NODE_SEA

  # Codesign macOS binaries so they can be executed locally
  if [[ "$OS" == "darwin" ]]; then
    codesign --remove-signature "$WORKDIR/${APP_NAME}"
    codesign --sign - "$WORKDIR/${APP_NAME}"
  fi

  echo "Built: $WORKDIR/${APP_NAME}${OUT_EXT}"
done

echo "\n[3/3] All executables are located under ./${BUILD_DIR}/" 