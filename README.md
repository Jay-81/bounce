# BOUNCE — Neon Arcade Game (Version 1.2)

A sleek, playable 2D vertical bouncing-ball arcade game built with vanilla **HTML5 Canvas**, **CSS3**, and **JavaScript**, featuring **deterministic moving platforms, 2-way platform collision physics, and an edge-triggered air jump**.

![BOUNCE Preview](https://img.shields.io/badge/Version-1.2.0-00f0ff.svg)
![Tech Stack](https://img.shields.io/badge/Vanilla-HTML%20%7C%20CSS%20%7C%20JS-a855f7.svg)
![Dependencies](https://img.shields.io/badge/Dependencies-Zero-success.svg)

---

## 🎮 How to Play & Launch

### Quick Launch
No build steps or npm packages required! Simply:
1. Double-click `index.html` or open it in any modern web browser (Chrome, Edge, Firefox, Safari).
2. Alternatively, serve with any local HTTP server (e.g. `npx serve .` or VS Code Live Server).

### 🕹️ Controls (WASD & Arrow Keys)

| Action | Keyboard | Touch / Mobile |
| :--- | :--- | :--- |
| **Air Jump (1x per bounce)** | <kbd>&uarr;</kbd> or <kbd>W</kbd> | On-screen Up Arrow (D-Pad) |
| **Steer Left** | <kbd>&larr;</kbd> or <kbd>A</kbd> | On-screen Left Arrow (D-Pad) |
| **Steer Right** | <kbd>&rarr;</kbd> or <kbd>D</kbd> | On-screen Right Arrow (D-Pad) |
| **Dive (Fast Fall)** | <kbd>&darr;</kbd> or <kbd>S</kbd> | On-screen Down Arrow (D-Pad) |
| **Start / Restart** | <kbd>Enter</kbd> or <kbd>Space</kbd> | Tap "PLAY GAME" / "PLAY AGAIN" |
| **Pause / Resume** | <kbd>Esc</kbd> or <kbd>P</kbd> | Top-right Pause icon |

---

## 🚀 Physics & Gameplay Mechanics

- **Automatic Platform Bouncing**: The ball automatically bounces whenever it lands on a platform from above.
- **Single Edge-Triggered Air Jump**: Pressing <kbd>W</kbd> or <kbd>&uarr;</kbd> grants exactly one air jump per bounce. Holding the key does not continuously accelerate the ball or allow infinite flight. Repeated key events are suppressed. Air jump resets only when landing on a platform.
- **Consistent 2-Way Platform Collisions**:
  - **Descending**: Landing on a platform top surface positions the ball on the platform and triggers an automatic upward bounce.
  - **Ascending**: Hitting a platform from below detects the underside, stops the ball, and deflects it downward without triggering a landing bounce or resetting air jump.
- **Horizontal Moving Platforms**:
  - **Start Base**: Wide (240px), slow moving (45 px/s), providing a fair starting platform.
  - **Tier 1 & Tier 2**: Moderate speeds (80 px/s and 70 px/s) patrolling within predictable horizontal bounds.
  - Ball tracks moving platform horizontal deltas during landing frames.
- **Anti-Tunneling Sub-Stepped Physics**: Physics simulation uses high-frequency sub-stepping (max 7ms per step) ensuring collision detection remains robust even during frame delays or fast dives.
- **Altitude-Based Scoring**: Points awarded strictly upon reaching new maximum heights.
- **Persistent High Scores**: Best altitude saved locally via `localStorage`.
- **Zero-Dependency Neon Sound Synthesizer**: Web Audio API retro synthesizer with distinct sounds for landing bounces, air jumps, head bumps, wall bounces, game over, and high scores.

---

## 📁 Project Structure

```
bounce/
├── index.html      # Game layout, HUD, overlays, 4-directional touch D-pad, and canvas viewport
├── style.css       # Neon cyber design tokens, responsive layout, touch controls styling
├── game.js         # Modular game engine, 2-way collision, moving platforms, and Web Audio synth
└── README.md       # Documentation and launch instructions
```
