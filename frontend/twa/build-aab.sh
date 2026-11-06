#!/usr/bin/env bash
# Builds the signed Android App Bundle (.aab) for Google Play from the LIVE site
# using Bubblewrap (Trusted Web Activity). Run on your own machine — it needs
# internet access to the Vercel deployment, Google's Android SDK downloads, and
# your private signing keystore. Requires Node 18+.
#
#   ./twa/build-aab.sh
#
# Output: twa/build/app-release-bundle.aab  (Bubblewrap's file name; rename to
# app-release.aab if you like — Play Console accepts any name).
set -euo pipefail

SITE="https://active-reel.vercel.app"
cd "$(dirname "$0")"
mkdir -p build && cd build

echo "▸ Checking the deployed manifest is reachable…"
curl -fsS "$SITE/manifest.json" -o /dev/null \
  || { echo "✗ $SITE/manifest.json not reachable. Deploy the latest frontend first."; exit 1; }

echo "▸ Bubblewrap doctor (finds/installs JDK + Android SDK)…"
npx --yes @bubblewrap/cli doctor

if [ ! -f twa-manifest.json ]; then
  echo "▸ Init — when prompted:"
  echo "    • Application ID: pick a permanent reverse-domain id (it can never change on Play)."
  echo "    • Key store: create a NEW keystore and BACK IT UP. Losing it = losing the upload key."
  npx @bubblewrap/cli init --manifest="$SITE/manifest.json"
fi

echo "▸ Building signed bundle…"
npx @bubblewrap/cli build

echo
echo "▸ Digital Asset Links (needed so the app opens full-screen without a URL bar):"
echo "  1. Get the SHA-256 fingerprint:"
echo "       keytool -list -v -keystore android.keystore -alias <alias>   # your upload key"
echo "     If you enrol in Play App Signing (default), ALSO add the app-signing key's SHA-256"
echo "     from Play Console → Setup → App signing."
echo "  2. Publish it at  $SITE/.well-known/assetlinks.json  (put the file in frontend/public/.well-known/):"
cat <<'JSON'
     [{
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "<YOUR_APPLICATION_ID>",
         "sha256_cert_fingerprints": ["<SHA256_FINGERPRINT>"]
       }
     }]
JSON
