#!/usr/bin/env bash
# ============================================================
# membran — macOS native project setup
#
# Run this script ONCE on your Mac after cloning the repo.
# It generates the macos/ Xcode project and installs CocoaPods.
#
# Requirements:
#   • macOS 12 (Monterey) or newer
#   • Xcode 15 or newer (with Command Line Tools: xcode-select --install)
#   • Node 22 LTS (brew install nvm && nvm install 22)
#   • Ruby 3.3 via rbenv (brew install rbenv && rbenv install 3.3.6)
#   • CocoaPods via Homebrew: brew install cocoapods
#     ⚠️  Do NOT use "sudo gem install cocoapods" on Apple Silicon —
#          it installs an x86 build that breaks on arm64.
#   • Watchman: brew install watchman
# ============================================================

set -euo pipefail

echo "── membran macOS setup ──────────────────────────────────"

# 1. Confirm we're on macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo "Error: this script must be run on macOS." >&2
  exit 1
fi

# 2. Install JS dependencies
echo "→ Installing JS dependencies..."
npm install

# 3. Generate the macos/ Xcode project via react-native-macos-init
#    Version must match react-native-macos in package.json (0.81.x)
echo "→ Running react-native-macos-init..."
npx react-native-macos-init@0.81 --overwrite

# 4. Install CocoaPods dependencies
echo "→ Installing CocoaPods..."
cd macos
pod install
cd ..

echo ""
echo "✓ Setup complete!"
echo ""
echo "To run the app:"
echo "  Terminal 1: npm run start:macos"
echo "  Terminal 2: npx react-native run-macos --scheme membran"
echo ""
echo "  Or open macos/membran.xcworkspace in Xcode and press Run."
