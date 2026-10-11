# Lily Hop design

## Overview

Lily Hop is a single-player browser arcade game for Pepe2Pepe. The implemented direction pairs a quiet cream interface with an original illustrated teal pond, bright green frog, lily pads, gold coins, and coral beetles. The pond is the main visual surface; the surrounding interface keeps the title, score, timer, lives, and next action easy to find.

The title screen uses one filled primary action, **Play Lily Hop**. The same action position becomes **Resume game** and **Play again**. Gameplay replaces the title illustration with a clearly spaced 7×6 pad grid. The implementation is native HTML, CSS, TypeScript, and Canvas 2D, not a component-library theme. Canonical interface styles and tokens live in `src/styles.css`; original drawing primitives and colors live in `src/renderer.ts`.

## Colors

CSS uses a small hex palette with primitive values mapped to semantic roles. Reuse the semantic tokens for interface work.

| Token | Implemented value | Role |
| --- | --- | --- |
| `--color-page` | `--cream-100`, `#f5f1e6` | Page and inset keyboard/touch controls |
| `--color-surface` | `--cream-50`, `#fbf9f3` | Game frame, dialog, best-score panel |
| `--color-border` | `--cream-200`, `#e7e3d7` | Quiet separators and control outlines |
| `--color-text` | `--green-950`, `#173c35` | Body, headings, primary-action labels |
| `--color-muted` | `--green-600`, `#58715f` | Descriptions, captions, statistic labels |
| `--color-accent` | `--green-300`, `#bde477` | Primary action fill |
| `--color-accent-hover` | `--green-400`, `#abd55f` | Primary hover fill |
| `--color-soft` | `--green-200`, `#dce8c7` | Tutorial tip and secondary hover fill |
| `--color-pond` | `#173e39` | Pond fallback surface |
| `--color-on-pond` | `#f8f6e8` | Overlay headings and primary focus ring |
| `--color-pond-muted` | `#c2d5c6` | Overlay descriptions and hints |
| `--color-danger` | `#a74433` | Final-ten-seconds timer and heart-rule icon |
| `--color-heart` | `#bf5948` | Remaining heart icons |
| `--color-coin` | `#826018` | Trophy/coin interface icons |
| `--color-focus` | `#173c35` | Focus on cream surfaces |

The static rule icons use pale gold `#f1e6c5` and pale coral `#f0dfd6` to associate their shapes with coins and lives. `--green-800`, `#315b4c`, supplies dark foliage accents. Meaning is also expressed by icons, labels, counts, and shapes; color is not the only cue.

Canvas illustration colors are owned by `PALETTE` and drawing functions in `renderer.ts`. These are art colors, not alternate interface tokens. The title overlay has a directional scrim on desktop, a stronger teal scrim on mobile, and a near-opaque `#123931eb` background for pause/results. Measured foreground/backdrop combinations and the mobile contrast correction are recorded in `artifacts/validation.md` and `artifacts/visual-evidence.json`.

There is one light interface with a dark pond, not a dark-mode variant. Forced-colors support preserves system button borders and focus colors; canvas gameplay still requires visual recognition.

## Typography

No font downloads are required. The interface requests `"Trebuchet MS", system-ui, -apple-system, sans-serif`. Headings request `Georgia, "Times New Roman", serif`. Actual font availability is platform-dependent; browser screenshots establish the tested appearance, not identical metrics across every operating system.

The CSS has six semantic sizes:

| Token | Size at 16px root | Usage |
| --- | --- | --- |
| `--text-caption` | 13px / `.8125rem` | Small labels, hints, keyboard symbols, footer |
| `--text-small` | 14px / `.875rem` | Secondary controls, supporting copy, rule rows |
| `--text-body` | 16px / `1rem` | Main description, primary buttons, tutorial steps |
| `--text-title` | 24px / `1.5rem` | HUD numbers, dialog heading, compact result headings |
| `--text-heading` | 44px / `2.75rem` | Product heading and compact pond heading |
| `--text-display` | 64px / `4rem` | Desktop pond title and final score |

Body line height is 1.5; overlay descriptions use 1.65 desktop and 1.5 mobile. The product heading uses 1.1 and `-.055em` tracking; the pond heading uses 1.04 and `-.045em`. Headings balance, short prose uses pretty wrapping, and overlay copy is capped at 35 characters. Normal UI weights are 400 and 700; small text is never a light weight. The six-size system applies to HTML interface text; the canvas’s short `+10` effect is drawn at intrinsic scene coordinates and scales with the artwork.

Score, timer, best score, and result digits use `font-variant-numeric: tabular-nums`. No critical content is truncated. Root font smoothing is applied once. Useful prose remains selectable; only controls and game gestures suppress incidental selection.

## Layout

The page uses `.site-wrap`, a centered 1200px maximum including its padding, with 32px desktop gutters and safe-area-aware mobile gutters. Header, title row, game frame, quick rules, and footer share those alignment edges. The spacing tokens are 4, 8, 12, 16, 24, 32, and 48px. Related labels sit closer together than independent controls or content groups.

The game frame contains a wrapping HUD, a `.pond-stage`, and a wrapping controls row. The stage has a viewport-aware desktop minimum height; the title/paused/result overlay participates in normal layout, so enlarged or wrapped text can grow the stage. The canvas fills that stage. The renderer fits its 900×620 illustration with one uniform scale, fills spare space with pond water, and keeps all playable cells visible without stretching the frog or coins. Device pixel ratio is capped at 2 to keep the canvas economical.

Implemented breakpoints:

- At **60rem**, secondary pond status disappears, HUD gaps tighten, the pond title uses the 44px size, and decorative round metadata is removed.
- At **45rem**, gutters become 20px, header action text is hidden while accessible names remain, the intro and HUD compress, the title stage becomes taller relative to its width, the quick rules stack, and gameplay uses a 900:760 stage ratio. Overlays can expand with text. Mobile header/actions wrap when space requires it. The touch arrows stay beside a flexible, wrapping instruction column.
- At **23rem**, gutters become 12px, some decorative details disappear, and controls retain their 44px minimum width.
- A **coarse pointer** or width below 45rem exposes the four directional buttons. Desktop keyboard hints and touch hints share the same controls region.

At 390px the product and primary action are in the first viewport. 320, 390, 768, and 1280px reflow and text enlargement were tested; screenshots and exact coverage are in the validation record. Text enlargement uses a 32px root and allows vertical scrolling rather than clipping content. This is distinct from native browser zoom. No translated locale or alternate reading direction is shipped.

## Elevation & Depth

The game frame uses two restrained green-tinted shadows (`0 8px 24px #173c3507`, `0 2px 4px #173c3505`) and a structural 1px border. The primary button has a 3px lower shadow, echoing a tactile arcade control. The tutorial uses a stronger modal shadow (`0 24px 80px #102c3538`), a translucent backdrop, and 4px backdrop blur.

The pond’s depth comes from layered vector water shapes, pad shadows, small ripples, and reeds. Pause/results darken that same pond instead of navigating away. Feedback chips sit inside the stage and do not intercept pointer events. No loading animation or network-dependent empty state exists.

## Shapes

`--radius-small` is 12px for primary buttons, tips, and compact panels. `--radius-panel` is 24px for the game frame. The pond is inset 10px desktop/6px mobile with a 16px/18px inner radius. Secondary toolbar controls and rule icons use circular or pill shapes. Touch arrows use 10px radii and a thicker lower border. Small keyboard hints use a 4px radius. The illustration repeats organic oval pads and round frog eyes; water gaps remain visibly empty cells.

## Components

These are reusable native-HTML patterns, not a separate component library.

| Pattern | Source | Behavior and states |
| --- | --- | --- |
| `.primary-button` | `public/index.html`, `src/styles.css` | One dominant action per visible game state. Filled lime, darker hover, 3px focus perimeter. Labels change with the game state. |
| `.quiet-button`, `.icon-button` | Same | Outlined secondary controls, hover fill, native disabled state, explicit accessible names for icon-only mobile controls. |
| `.stats`, `.stat`, `.hearts` | Same; `src/main.ts:updateHud` | Score/timer/lives update without digit-width shifts. Missing hearts become outlined. Lives also have a numeric accessible label. HUD wraps for larger text. |
| `#game-canvas` / `PondRenderer` | `src/renderer.ts`, `src/main.ts` | Custom frog, pad, coin, beetle, ripple, and particle drawing. Canvas receives focus on start/resume and updates its accessible position/score label. Hidden from the accessibility tree while an overlay is active. |
| `.game-overlay` | HTML/CSS; `syncPhase` | Title, pause, and result presentation. Content-driven size. Pause/results focus the primary action; other page controls remain available. This in-frame panel is not a modal dialog. |
| `.touch-controls` | HTML/CSS; direction event handlers | Four labeled native buttons, each at least 44×44px, disabled outside a running round. Keyboard and touch use the same engine movement method. |
| `#help-dialog` | HTML; `src/main.ts` | Native modal with focus containment, Escape close, visible close button, scrollable content, and focus return to How to play. Opening it pauses gameplay. |
| `#sound-button` / `PondAudio` | `src/audio.ts`, `src/main.ts` | Starts off; toggles only after a gesture; aria-pressed and visible/accessibility labels agree. Failure is announced without blocking play. |
| `BestScore` | `src/storage.ts` | Validates saved integers, catches read/write failures, keeps an in-memory best, and labels it as visit-only when persistence is unavailable. |
| `#announcer` | HTML; `src/main.ts` | Stable polite live region for round state, coins, and life loss. Timer ticks do not continuously interrupt assistive technology. |

Hover styles are gated by `hover: hover`. Button feedback transitions only background color and transform for 150ms with `cubic-bezier(.2,0,0,1)`; press scale is `.96`. Those transitions only run under `prefers-reduced-motion: no-preference`. Reduced motion also removes pad/coin bobbing, frog hop arcs, and decorative particles. Essential beetle movement continues because it is a game mechanic. There is no title-screen autoplay. Pausing freezes simulation and drawing; starting a round clears previous effects.

## Do’s and Don’ts

- Start related interface work with the existing `.site-wrap`, semantic tokens, type scale, and native buttons.
- Keep the main action visible near the game; reuse the existing primary style instead of adding a competing filled action.
- Add new game artwork through `PondRenderer` drawing primitives so it follows the same uniform scene transform and reduced-motion handling.
- Preserve the HUD’s wrapping behavior and the overlay’s content-driven height. Do not reintroduce fixed text-container heights.
- Keep motion incidental and optional; communicate important outcomes through score, lives, and text as well.
- Keep all runtime assets local and relative. Any additional static page should reuse the same header, typography, and controls, with normal links and an explicit exported HTML file; no server route fallback exists.
- Do not imply the visual arcade game is fully playable without sight. Automated semantics, keyboard, and reflow checks supplement physical-device and screen-reader review; they do not replace it.

The applied guidance and documentation method are attributed in `artifacts/design-guidance-NOTICE.txt`, with the supplied license texts alongside it.
