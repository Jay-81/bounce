# BOUNCE — Endless Climb Arcade

A polished, neon-themed 2D vertical endless-climbing arcade game built with vanilla **HTML5 Canvas**, **CSS3**, and **JavaScript**.

![BOUNCE Preview](https://img.shields.io/badge/Version-2.0.0-00f0ff.svg)
![Theme](https://img.shields.io/badge/Style-Neon%20Arcade-a855f7.svg)
![Dependencies](https://img.shields.io/badge/Dependencies-Zero-success.svg)

---

## 🎮 How to Play & Launch

### Quick Launch

No compilation or npm packages required! Simply:

1. Double-click `index.html` or open it in any modern web browser (Chrome, Edge, Firefox, Safari).
2. Alternatively, serve with any local HTTP server (e.g. `npx serve .` or VS Code Live Server).

### 🕹️ Controls (WASD & Arrow Keys)

| Action                       | Keyboard                             | Touch / Mobile (Single Bottom Row) |
| :--------------------------- | :----------------------------------- | :--------------------------------- |
| **Move Left**                | <kbd>&larr;</kbd> or <kbd>A</kbd>    | Bottom Row: **LEFT** (Far Left)    |
| **Dive (Fast Fall)**         | <kbd>&darr;</kbd> or <kbd>S</kbd>    | Bottom Row: **DIVE** (Mid Left)    |
| **Air Jump (1x per bounce)** | <kbd>&uarr;</kbd> or <kbd>W</kbd>    | Bottom Row: **JUMP** (Mid Right)   |
| **Move Right**               | <kbd>&rarr;</kbd> or <kbd>D</kbd>    | Bottom Row: **RIGHT** (Far Right)  |
| **Toggle Mute Sound**        | <kbd>M</kbd>                         | Top-right Sound Icon               |
| **Pause / Resume**           | <kbd>Esc</kbd> or <kbd>P</kbd>       | Top-right Pause Icon               |
| **Start / Restart**          | <kbd>Enter</kbd> or <kbd>Space</kbd> | "CLIMB" / "CLIMB AGAIN" Button     |

---

## 🚀 What's New in BOUNCE v2

### 1. Endless Vertical Climb & Smooth Follow Camera

- **Endless Procedural Generation**: Platforms are generated continuously ahead of the player as they climb higher, with fair, bounded spacing (124px - 152px) so every platform is reachable.
- **Vertical-Follow Camera**: The camera smoothly tracks the player upwards while keeping the ball comfortably centered in the upper-mid screen.
- **Memory Recycling**: Platforms far below the screen are automatically culled to guarantee zero memory leaks and sustained 60 FPS performance.
- **World vs. Screen Separation**: Physics and collision calculations run purely in world space, eliminating camera jitter and tunneling.

### 2. Level-Based Color Themes & Visual Identity

- **Expanded 16-Theme Palette Collection**:
  - **Level 1**: Icy Cyan & Glacial Blue (`#00f0ff` / `#0077ff`)
  - **Level 2**: Magenta & Coral (`#ff2a85` / `#ff7043`)
  - **Level 3**: Acid Lime & Toxic Neon (`#baff29` / `#22c55e`)
  - **Level 4**: Ultraviolet & Deep Violet (`#a855f7` / `#7e22ce`)
  - **Level 5**: Electric Orange & Solar Flare (`#ff6b00` / `#ffb703`)
  - **Level 6**: Turquoise & Aquamarine (`#14f1be` / `#06b6d4`)
  - **Level 7**: Crimson & Ember (`#ff264f` / `#ff5722`)
  - **Level 8**: Emerald & Gold (`#10e080` / `#facc15`)
  - **Level 9**: Sunset Amber & Rose (`#f59e0b` / `#f43f5e`)
  - **Level 10**: Chrome Silver & Platinum (`#e2e8f0` / `#ffffff`)
  - **Level 11**: Cyberpunk Yellow & Cobalt (`#ffe135` / `#2563eb`)
  - **Level 12**: Neon Rose & Ruby (`#f43f5e` / `#be123c`)
  - **Level 13**: Hyper Mint & Jade (`#2df5af` / `#059669`)
  - **Level 14**: Amethyst & Orchid (`#d946ef` / `#8b5cf6`)
  - **Level 15**: Solar Plasma & Tangerine (`#ff8a00` / `#ea580c`)
  - **Level 16**: Synthwave Azure & Indigo (`#38bdf8` / `#6366f1`)
  - **Level 17+**: Predictably and smoothly cycles across all themes with zero repetition between consecutive levels.
- **Coherent Atmospheric Environment**: Each theme controls a full, unified palette including deep backdrop gradients, ambient upper aura, scrolling cyber grid lines, platform body gradients and neon borders, impact rails, ball aura resonance, and bounce spark particle bursts.
- **Smooth Real-Time Transitions**: Reaching a new level triggers an automated, smooth delta-time RGB interpolation across all 7 channels that blends the background, grid, platforms, ball aura, and HUD elements in real time.
- **Strict Gameplay Readability**: Hazard spikes retain their distinct razor geometry, incandescent white-hot apexes, caution yellow baseline (`#ffcc00`), and crimson red danger core, ensuring 100% visibility and distinction from safe platforms across all themes.
- **Clean Platforms**: All platform text labels (`START BASE`, `TIER 1`, `TIER 2`) have been removed for a clean, sleek arcade aesthetic with glowing borders and impact rails.

### 3. Progressive Obstacles & Fair Challenge

- **Introductory Climb (Level 1)**: 100% free of hazards, ensuring new players comfortably master bouncing and air-jump timing.
- **Gentle Introduction (Level 2)**: Introduces razor spikes at an 18% rate on stationary platforms only, with generous safe landing zones.
- **Progressive Ramp-Up (Level 3+)**: Spike probability scales smoothly (Level 3: 24%, Level 4: 28%, Level 5+: capped at 32%).
- **High-Contrast Hazard Design**: Spikes feature a caution baseline (`#ffcc00`), white-hot glowing tips, crimson danger fill, and distinct triangular teeth so they remain clearly distinguishable from platforms across all level color themes.

### 4. Platform Movement Variety

- **Intentional Mix**: Guaranteed mixture of stationary platforms and horizontally moving patrol platforms (~50/50 balance) throughout the endless ascent.
- **Steady Launch**: The starting base and safe tiers provide immediate stability before moving platforms challenge the climb.

### 5. Interactive Web Audio Synthesizer

- **Native Synthesized Arcade Audio**:
  - **Bounce**: Soft, punchy electronic pop upon landing.
  - **Level Completion**: Rising cheerful synth arpeggio chord upon unlocking a milestone.
  - **Hazard Collision**: Crunchy impact crunch upon hitting a spike.
  - **Game Over**: Descending electronic tone when falling or shattered.
  - **Air Jump & Head Bump**: Synth whoosh on air jump and metallic thud on underside bumps.
  - **Collectible Chimes & Fanfare**: Crystal chime on orb collection, celestial arpeggio on special stars, and chord fanfares on the results board.
- **Mute Toggle**: Quick sound toggle icon in the top corner (or press <kbd>M</kbd>), with preferences persisted in `localStorage`.

### 6. Preserved Core Physics & Controls

- **Automatic Platform Bouncing**: Automatic launch on descending onto safe platform surfaces.
- **Single Edge-Triggered Air Jump**: One optional air jump per bounce; holding Up does not permit infinite flight.
- **Consistent 2-Way Collisions**: Landing on top surfaces triggers bounces; hitting undersides stops the ball and deflects it downward without glitching.
- **Moving Platforms**: Deterministic horizontal patrol with moving platform inertia transfer during landing frames.

### 7. Collectible Energy Orbs & Special Stars

- **Glowing Energy Orbs**:
  - Small, bright cyan orbs with subtle floating and pulsing animations.
  - Procedurally spawned throughout the world near platforms, between platforms, and in aerial gaps.
  - Fair placement: never generated inside spikes or hazardous platform zones.
  - Touch collection awards run orbs (displayed in the top HUD) and plays a crisp synth pop chime.
  - Persistent total orbs accumulated across runs in `localStorage` (`bounce_arcade_total_orbs`).
- **Special Star Collectibles**:
  - Rare, glowing golden 5-point stars rotating smoothly with a radiant celestial aura.
  - Placed at selected milestones and challenging platform layouts (spaced at least 700px apart).
  - Collecting awards run stars and plays a radiant celestial arpeggio with golden spark bursts.
  - Persistent total collectible stars stored in `localStorage` (`bounce_arcade_total_stars`).
  - Strict separation: collectible stars are separate from performance rating stars.

### 8. Three-Star Performance Rating & Dedicated Results Screen

- **Configurable Performance Rating Formula** (`PERFORMANCE_RATING_CONFIG`):
  - **1 Star**: Minimum height milestone reached ($\ge 300\text{m}$).
  - **2 Stars**: Higher altitude ($\ge 750\text{m}$) AND energy orb requirement ($\ge 5\text{ orbs}$).
  - **3 Stars**: Target altitude ($\ge 1400\text{m}$) AND demanding collectible challenge ($\ge 12\text{ orbs}$ OR $\ge 1\text{ special star}$).
- **Dedicated Results Overlay**:
  - Triggered at the end of each run upon falling into the void or colliding with a hazard.
  - Displays exactly three large rating stars: earned stars shine with bright glowing gold and pop animation, while unearned stars remain dim.
  - Clear verdict banner: e.g. `2 STARS EARNED` or `3 STARS EARNED! PERFECT CLIMB`.
  - Comprehensive run and lifetime stats grid: Altitude, Level Reached, Run Orbs, Run Stars, Record Altitude, Max Level, Total Orbs, and Total Stars.
  - Guaranteed single-award lifecycle prevents duplicate awards on death.
  - Action buttons: "CLIMB AGAIN" for an immediate fresh run and "MAIN MENU" to return to the title screen.
- **Persistent Level Milestone Achievements**:
  - Tracks every level milestone reached and preserves the player's personal best star rating per level in `localStorage` (`bounce_arcade_level_ratings`).

### 9. World & Portal-Based Level Selection System
- **Expandable World Structure**: Progression is organized into worlds containing exactly 12 consecutive levels (World 1: Levels 1–12, World 2: Levels 13–24, World 3: Levels 25–36, and continuing indefinitely via dynamic calculations).
- **Futuristic Dimensional Gateways**: Each world features an animated neon portal entry card at the end of its 12-level grid. Unlocked portals feature swirling vortex auras and direct warp actions; locked portals are sealed with energy barriers and clear milestone unlock requirements.
- **Milestone-Based Portal Unlocking**: Reaching the final level of a world (e.g., Level 12 for World 1, Level 24 for World 2) unlocks the portal to the next world without requiring perfect 3-star ratings or score thresholds.
- **World Navigation**: Responsive previous and next world controls with live world indicator and level range headers ("WORLD 1 • LEVELS 1–12"). Unlocked worlds remain permanently accessible for replaying.
- **Cross-World CONTINUE Action**: A prominent CONTINUE button resumes the player's last-played level directly, even when browsing different worlds.
- **Balanced Interface Spacing & Mobile Ergonomics**: Generous, balanced spacing between Results screen actions (`CLIMB AGAIN`, `LEVELS`, `MAIN MENU`), comfortable card and button padding, and full mobile safe-area inset support (`env(safe-area-inset-bottom)`) ensuring controls are never clipped by device gestures or navigation bars.
- **Safe Persistence & Progression Integrity**: Maintains separate records for `highestUnlockedLevel` and `lastPlayedLevel` in `localStorage` (`bounce_arcade_highest_level` & `bounce_arcade_last_played_level`), safely sanitized so progression is never corrupted, relocked, or reset across sessions.

---

## 📁 Project Structure

```
bounce/
├── index.html                    # Layout, HUD, Mobile Controls, Level Select, and Results Screen
├── style.css                     # Midnight navy & cyber neon aesthetic, responsive layout, animations
├── game.js                       # Core engine: Physics, Camera, Platforms, Audio, Progression, Level Select
├── scripts/
│   └── copy-assets.js            # Build script syncing root files to www/ for Capacitor bundling
├── tests/
│   ├── results_screen.test.js    # Automated tests for run results screen
│   ├── mobile_controls.test.js   # Automated tests for mobile floating touch controls
│   └── level_progression.test.js # Automated tests for level progression, unlocking & resume
└── README.md                     # Game documentation, controls, and architecture reference
```
