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

### 2. Level Progression System & HUD
- **Compact HUD**: Top-left corner displays the current level (`LVL 1`, `LVL 2`, etc.) and a neon progress bar tracking height progress toward the next milestone.
- **Level Milestones**: Reaching height targets (Level 1: 500, Level 2: 1200, Level 3: 2100...) triggers a celebratory banner notification (`LEVEL 2 REACHED!`) and a cheerful electronic chime.
- **Persistent Progress**: Best altitude score and highest completed level are automatically saved in `localStorage`.

### 3. Progressive Hazard Spikes
- **Safe Opening (Level 1)**: The initial climb is completely free of hazards, allowing players to find their rhythm.
- **Neon Spikes (Level 2+)**: Distinct crimson glowing spike strips appear on select platforms. Landing directly on a spike shatters the orb and ends the run, while the remainder of the platform remains safe to land on.

### 4. Interactive Web Audio Synthesizer
- **Native Synthesized Arcade Audio**:
  - **Bounce**: Soft, punchy electronic pop upon landing.
  - **Level Completion**: Rising cheerful synth arpeggio chord upon unlocking a milestone.
  - **Hazard Collision**: Crunchy impact crunch upon hitting a spike.
  - **Game Over**: Descending electronic tone when falling or shattered.
  - **Air Jump & Head Bump**: Synth whoosh on air jump and metallic thud on underside bumps.
- **Mute Toggle**: Quick sound toggle icon in the top corner (or press <kbd>M</kbd>), with preferences persisted in `localStorage`.

### 5. Preserved Core Physics & Controls
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
