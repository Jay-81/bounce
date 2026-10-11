# BOUNCE v2 — Endless Climb Arcade

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

| Action | Keyboard | Touch / Mobile |
| :--- | :--- | :--- |
| **Move Left** | <kbd>&larr;</kbd> or <kbd>A</kbd> | On-screen Left Arrow (D-Pad) |
| **Move Right** | <kbd>&rarr;</kbd> or <kbd>D</kbd> | On-screen Right Arrow (D-Pad) |
| **Air Jump (1x per bounce)** | <kbd>&uarr;</kbd> or <kbd>W</kbd> | On-screen Up Arrow (D-Pad) |
| **Dive (Fast Fall)** | <kbd>&darr;</kbd> or <kbd>S</kbd> | On-screen Down Arrow (D-Pad) |
| **Toggle Mute Sound** | <kbd>M</kbd> | Top-right Sound Icon |
| **Pause / Resume** | <kbd>Esc</kbd> or <kbd>P</kbd> | Top-right Pause Icon |
| **Start / Restart** | <kbd>Enter</kbd> or <kbd>Space</kbd> | "START CLIMB" / "CLIMB AGAIN" Button |

---

## 🚀 What's New in BOUNCE v2

### 1. Endless Vertical Climb & Smooth Follow Camera
- **Endless Procedural Generation**: Platforms are generated continuously ahead of the player as they climb higher, with fair, bounded spacing (124px - 152px) so every platform is reachable.
- **Vertical-Follow Camera**: The camera smoothly tracks the player upwards while keeping the ball comfortably centered in the upper-mid screen.
- **Memory Recycling**: Platforms far below the screen are automatically culled to guarantee zero memory leaks and sustained 60 FPS performance.
- **World vs. Screen Separation**: Physics and collision calculations run purely in world space, eliminating camera jitter and tunneling.

### 2. Level-Based Color Themes & Visual Identity
- **Distinct Neon Palettes**:
  - **Level 1**: Cyan & Electric Blue (`#00f0ff` / `#0077ff`)
  - **Level 2**: Purple & Magenta (`#a855f7` / `#d946ef`)
  - **Level 3**: Neon Green & Lime (`#2eea70` / `#a3e635`)
  - **Level 4**: Orange & Gold (`#ff8800` / `#ffd700`)
  - **Level 5**: Pink & Hot Magenta (`#f43f5e` / `#ff007f`)
  - **Level 6+**: Predictably cycles through the themes.
- **Smooth Real-Time Transitions**: Reaching a new level triggers an automated, smooth delta-time RGB interpolation that morphs all platforms (existing and new), the ball trail accent, and HUD elements in real time.
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
- **Mute Toggle**: Quick sound toggle icon in the top corner (or press <kbd>M</kbd>), with preferences persisted in `localStorage`.

### 6. Preserved Core Physics & Controls
- **Automatic Platform Bouncing**: Automatic launch on descending onto safe platform surfaces.
- **Single Edge-Triggered Air Jump**: One optional air jump per bounce; holding Up does not permit infinite flight.
- **Consistent 2-Way Collisions**: Landing on top surfaces triggers bounces; hitting undersides stops the ball and deflects it downward without glitching.
- **Moving Platforms**: Deterministic horizontal patrol with moving platform inertia transfer during landing frames.

---

## 📁 Project Structure

```
bounce/
├── index.html      # Game layout, Level Progression HUD, Sound toggle, Canvas
├── style.css       # Dark navy & neon aesthetic, responsive layout, glassmorphism UI
├── game.js         # Modular engine: Camera, Procedural Platforms, Hazards, Web Audio
└── README.md       # Documentation and launch instructions
```
