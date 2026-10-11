# Lily Hop

A small, self-contained arcade game for the Pepe2Pepe game launchpad. Hop between lily pads, collect coins, and avoid the moving red beetles. Three lives, 60 seconds, and one more try.

The complete static release is in **`dist/`**. It includes `index.html`, relative local assets, the original 1200×630 `cover.svg`, favicon, and the exact requested `pepe-game.json`. The source uses TypeScript and Canvas 2D; there are no runtime packages, CDN assets, server APIs, wallets, tokens, accounts, or paid prizes.

## Install, run, and rebuild

Use Node.js **24 or newer** and npm. Build/test packages are development dependencies only.

```sh
npm ci
npm run typecheck
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/`. To choose another port:

```sh
npm run preview -- --port 8080
```

Edit `src/` or `public/`, run `npm run build` again, then reload the preview. The production build typechecks, bundles one classic browser script with esbuild, and copies only runtime files to `dist/`. Classic script loading deliberately supports opaque-origin iframes without requiring CORS headers on static hosting. No build process runs on the publishing server.

The finished export also works when opened as a local `dist/index.html` file in a modern browser; an HTTP preview is recommended for testing hosting and iframe behavior. A complete first load requires the local files, after which the game needs no network connection. No service worker or offline cache is installed.

## How to play

- Select **Play Lily Hop**. Arrow keys or WASD hop one space at a time. Touch players use the four on-screen arrow buttons.
- Land on green lily pads. Gold coins earn **10 points** each and respawn elsewhere in the pond.
- Water gaps or moving beetles cost one life. You return to the bottom-center starting pad with a **1.6-second protective ring against beetles**; water still costs a life.
- Both the top and bottom rows are beetle-free. Hops take 0.16 seconds; a new hop starts after the current hop lands.
- The round ends at **60 seconds** or **zero lives**. There is no survival bonus. **Play again** starts a fresh round.
- **P**, **Esc**, or the pause button pauses. **P**, **Esc**, or **Resume game** resumes. Opening the guide or hiding the browser tab pauses; returning does not automatically resume.
- Sound starts muted. The sound control enables soft synthesized effects after a gesture. No audio is downloaded.

Only a new personal best is stored, under `lily-hop.best.v1`. Reads and writes are guarded, including `SecurityError` and quota failures. If storage is unavailable, the best remains in memory for the visit and is labeled **Best this visit**. No other game state or preference is persisted.

## Optional launchpad bridge

The game works without a parent integration. In an iframe, the parent can initialize it with:

```js
frame.contentWindow.postMessage({
  protocol: 'pepe-game/1',
  type: 'init',
  channel: yourSessionChannel,
}, '*');
```

`yourSessionChannel` is a string chosen by the embedding page, not a credential. The reply is `{protocol:'pepe-game/1', type:'ready', channel}`. The game then accepts `pause` and `resume` messages only when `event.source === window.parent` and both the protocol and saved channel match. A new valid `init` replaces the previous channel. Resume does not start a round from the title or bypass an open tutorial or hidden tab.

At game over, the parent receives `{protocol:'pepe-game/1', type:'score', channel, score}` once, with a nonnegative integer score. Replies use `targetOrigin: '*'` because the embed may have an opaque origin. No credentials, wallet messages, token transfers, registration, or administrative APIs are involved. Scores are local arcade results, not trusted or authenticated competition results.

## Tests

Install the development browser once, then run:

```sh
npx playwright install chromium
npm run build
npm test
npm run test:a11y
```

`npm test` runs 21 engine/bridge/storage tests and ten production browser checks. Tests own an ephemeral local preview at a gateway-like subpath and close the preview and browser when finished. Browser clocks advance full rounds without a real 60-second wait. The accessibility check writes `artifacts/accessibility.json`.

For this contributor run, dependencies and browser binaries were installed **outside the repository** under `/tmp`; no repository `node_modules/`, cache, vendored registry, archive, ignore-file edit, or submodule was created. The equivalent actual commands used were:

```sh
PATH=/tmp/lily-hop-toolchain/node_modules/.bin:$PATH npm run typecheck
PATH=/tmp/lily-hop-toolchain/node_modules/.bin:$PATH npm run build
npm run test:engine
PLAYWRIGHT_BROWSERS_PATH=/tmp/lily-hop-browsers \
  LILY_PLAYWRIGHT_MODULE=file:///tmp/lily-hop-toolchain/node_modules/playwright/index.mjs \
  npm run test:browser
PLAYWRIGHT_BROWSERS_PATH=/tmp/lily-hop-browsers \
  LILY_PLAYWRIGHT_MODULE=file:///tmp/lily-hop-toolchain/node_modules/playwright/index.mjs \
  LILY_AXE_MODULE=file:///tmp/lily-hop-toolchain/node_modules/@axe-core/playwright/dist/index.mjs \
  npm run test:a11y
```

Actual outcomes, visual evidence, fixes, measured contrast, and remaining limitations are recorded in [`artifacts/validation.md`](artifacts/validation.md). The checks are worker-side evidence, not independent certification. Design tokens and component behavior are documented in [`DESIGN.md`](DESIGN.md).

### Gameplay test checklist

- [x] First screen at 390px shows Lily Hop and its primary play action; 320px has no horizontal overflow.
- [x] Open/close tutorial using keyboard; verify focus return.
- [x] Start; hop with arrows and WASD; collect a coin and see 10 points.
- [x] Hit water and beetles; lose lives; finish at three lost lives (engine tests).
- [x] Pause with P/button; confirm timer and hazards freeze; resume.
- [x] Finish a full round, see the score, and restart with 60 seconds and three lives.
- [x] Use emulated touch arrow buttons; verify target sizes and reduced-motion mode.
- [x] Toggle optional sound after a gesture; mute again.
- [x] Complete gameplay offline after the initial static load.
- [x] Play in an `allow-scripts`-only iframe with blocked storage; verify ready/score replies and message-source/channel/protocol rejection.
- [x] Confirm only the local best-score key is written when storage works; storage denial does not stop play.
- [ ] Test on physical iOS/Android devices, Safari, and Firefox; listen to synthesized sound on those devices.
- [ ] Conduct a native screen-reader session and browser-native 200% zoom check. The automated checks cover names, focus, reflow, and 200% text enlargement; canvas play remains visually guided.

## Publish

For this IdentityMD assignment, **`dist/` is the release directory for the requested IPFS/ENS hosting flag**. Submit the complete source, lockfile, documentation, and export; the hosting stage pins that export and supplies the release CID and ENS URL after submission. The worker has no hosting-flag API, ENS name, owner credentials, or publication receipt. No pin or ENS update is claimed here, and no Pepe2Pepe registration or admin API was called.

For a separate owner-managed deployment using an already configured IPFS node:

```sh
npm ci
npm run build
ipfs add --recursive --pin=true --cid-version=1 dist
```

Retain the final directory CID and arrange durable pinning with your chosen provider. Set the content hash of **an ENS name you control** to `ipfs://<the returned directory CID>` using your existing ENS management workflow. Replace the bracketed text with the actual result; there is no hard-coded CID, domain, recipient, or private key in this repository. ENS ownership and transaction signing happen outside this game. Verify the resulting gateway subpath and ENS site load `index.html`, `cover.svg`, and `pepe-game.json`, then submit that pinned release for review yourself.

## Files and attribution

- `src/game.ts`: deterministic game rules; `renderer.ts`: original vector pond art and animation.
- `src/main.ts`: interface and lifecycle; `audio.ts`, `storage.ts`, `bridge.ts`: optional browser integrations.
- `src/styles.css`, `public/`: interface tokens, semantic HTML, local SVG assets, and exact release manifest.
- `scripts/`: clean production build and dependency-free static preview.
- `test/`: delivered rule, integration, browser, and accessibility checks. `test/scratch/` is disposable and is not required to build or run anything.
- `artifacts/`: final visual evidence and validation documentation.

The six-domain design review follows the pinned Better Interface guidance by Jakub Krehel (MIT); design documentation follows the pinned Impeccable method by Paul Bakaus (Apache-2.0). Source attribution and the supplied licenses are preserved in `artifacts/design-guidance-NOTICE.txt` and `artifacts/design-guidance-LICENSE.txt`. Game art, icons, audio synthesis, and implementation were created for this assignment.
