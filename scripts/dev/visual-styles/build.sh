#!/bin/sh
# Bundles the scene, the core, the kit, the styles and the driver into one classic script: window.CWTViz.
set -e
cd "$(dirname "$0")"
mkdir -p dist
{
  echo '/* Climbing World Traveler: visual-style mockups. One simulated attempt sequence drawn ten ways. */'
  echo '(function () {'
  printf 'var SCENE = '; cat scene.json; echo ';'
  echo 'var STYLES = {};'
  cat src/core.js src/kit.js
  for f in src/s*.js; do cat "$f"; done
  cat src/mount.js
  echo 'window.CWTViz = makeViz(SCENE, STYLES);'
  echo '})();'
} > dist/cwt-viz.js
node --check dist/cwt-viz.js
wc -c dist/cwt-viz.js
