/**
 * ============================================================================
 * BOUNCE v2 — Endless Climb Arcade
 * Features:
 * - Truly endless procedural vertical climb with dynamic follow camera
 * - Separation of World Coordinates and Screen Coordinates
 * - Bounded, playable procedural platform generation and recycling
 * - Neon hazard spike obstacles appearing progressively from Level 2+
 * - Compact Level Progression HUD with milestone progress bar & animated banner
 * - Synthesized Web Audio arcade sound effects (bounce, level, hazard, game over)
 * - Mute sound toggle with localStorage persistence
 * - Edge-triggered single air jump & 2-way vertical collision handling
 * - Moving platforms with deterministic patrol bounds
 * ============================================================================
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const CANVAS_WIDTH = 480;
  let CANVAS_HEIGHT = 700;
  const STORAGE_KEY_BEST = 'bounce_arcade_best_score';
  const STORAGE_KEY_LEVEL = 'bounce_arcade_highest_level';
  const STORAGE_KEY_SOUND = 'bounce_arcade_sound_enabled';
  const STORAGE_KEY_TOTAL_ORBS = 'bounce_arcade_total_orbs';
  const STORAGE_KEY_TOTAL_STARS = 'bounce_arcade_total_stars';
  const STORAGE_KEY_LEVEL_RATINGS = 'bounce_arcade_level_ratings';
  const STORAGE_KEY_LAST_PLAYED = 'bounce_arcade_last_played_level';
  const STORAGE_KEY_BLUES = 'bounce_arcade_blues';
  const STORAGE_KEY_KEYS = 'bounce_arcade_keys';

  // Currency, Lives, and Continue Configuration (Configurable in one centralized place)
  const CURRENCY_CONFIG = {
    bluesPerOrb: 5,
    bluesPerStar: 25,
    initialLives: 3,
    respawnCountdownSeconds: 5,
    invulnerabilityDurationSeconds: 2.0,
    keyBundles: [
      { keys: 1, price: 100 },
      { keys: 3, price: 270, savings: 30, featured: true },
      { keys: 5, price: 425, savings: 75, bestValue: true },
    ],
  };

  // Three-Star Performance Rating Thresholds (Configurable in one place)
  const PERFORMANCE_RATING_CONFIG = {
    star1: {
      minHeight: 300,
      minAltitude: 300,
    },
    star2: {
      minHeight: 750,
      minAltitude: 750,
      minOrbs: 5,
    },
    star3: {
      minHeight: 1400,
      minAltitude: 1400,
      minOrbs: 12,
      minSpecialStars: 1,
      orSpecialStars: 1,
    },
    get STAR_1() { return this.star1; },
    get STAR_2() { return this.star2; },
    get STAR_3() { return this.star3; },
  };

  // Physics Parameters (World space)
  const GRAVITY = 980;              // Base downward acceleration (px/s^2)
  const BOUNCE_VELOCITY = -660;      // Automatic upward launch on platform landing (px/s)
  const AIR_JUMP_IMPULSE = -580;     // Single fixed air-jump upward impulse (px/s)
  const MOVE_ACCEL_X = 2200;        // Horizontal steering acceleration (px/s^2)
  const MOVE_BRAKE_ACCEL_X = 3600;  // Active counter-steering braking acceleration for crisp direction turnaround (px/s^2)
  const MOVE_DECEL_X = 1800;        // Horizontal friction/deceleration (px/s^2)
  const MAX_SPEED_X = 340;          // Terminal horizontal speed (px/s)
  const STEER_ACCEL_DOWN = 1600;    // Downward dive acceleration on holding Down/S (px/s^2)
  const MAX_FALL_SPEED = 880;       // Terminal downward vertical speed (px/s)

  const BASE_ALTITUDE_Y = 620;      // Baseline world Y coordinate for altitude scoring

  // Level Milestones Formula (O(1) closed-form calculation: 100 * lvl^2 + 400 * lvl)
  // Mathematically equivalent to sum_{i=1}^{lvl} (500 + (i - 1) * 200)
  // Safely handles non-positive, non-integer, and non-numeric inputs
  function getLevelMilestone(lvl) {
    const n = Math.floor(Number(lvl));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return 100 * n * n + 400 * n;
  }

  // Expose on global window object if available
  if (typeof window !== 'undefined') {
    window.getLevelMilestone = getLevelMilestone;
  }

  // Helper for responsive, non-blocking button taps on desktop & mobile
  // Listens to touchend (preventing 300ms delays and synthetic click suppression under touch-action)
  // Debounces duplicate execution from subsequent synthetic clicks with 350ms window
  function bindButtonAction(btn, action) {
    if (!btn) return;
    let lastActionTime = -1000;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMovedTooFar = false;

    btn.addEventListener('touchstart', (e) => {
      if (e && e.changedTouches && e.changedTouches[0]) {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
        touchMovedTooFar = false;
      }
    }, { passive: true });

    btn.addEventListener('touchmove', (e) => {
      if (e && e.changedTouches && e.changedTouches[0]) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (dx * dx + dy * dy > 16 * 16) {
          touchMovedTooFar = true;
        }
      }
    }, { passive: true });

    btn.addEventListener('touchend', (e) => {
      if (touchMovedTooFar) return;
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - lastActionTime < 350) return;
      lastActionTime = now;
      if (e && e.cancelable) e.preventDefault();
      action(e);
    }, { passive: false });

    btn.addEventListener('click', (e) => {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - lastActionTime < 350) return;
      lastActionTime = now;
      action(e);
    });
  }

  // --- Level Neon Color Themes ---
  // Comprehensive collection of 16 coordinated, high-contrast neon arcade themes.
  // Each theme provides a full atmospheric palette:
  // - primary: Vibrant, saturated neon for borders, HUD, particle bursts, and primary accents
  // - secondary: Complementary/analogous neon accent for progress bars, secondary particles, and gradients
  // - rail: High-luminescence top impact rail for crisp bounce visibility
  // - bodyTop / bodyBottom: Geometric platform gradient backing with visible theme tinting
  // - bgTop / bgMid / bgBottom: Atmospheric cosmic backdrop tailored to the theme's color family
  // - grid: Ambient cyber grid lines scrolling with camera
  // - ambientAura: Upper atmospheric backdrop glow radiating from top of the screen
  const LEVEL_THEMES = [
    {
      name: 'Icy Cyan & Glacial Blue',
      primary: [0, 240, 255],       // #00f0ff - electric cyan
      secondary: [0, 119, 255],     // #0077ff - deep electric blue
      rail: [90, 215, 255],         // #5ad7ff - bright glacial rail
      bodyTop: [10, 32, 56],        // rich deep navy cyan
      bodyBottom: [4, 15, 30],
      bgTop: [3, 8, 20],            // deep cyber navy
      bgMid: [5, 18, 38],           // electric cyan-tinted atmospheric depth
      bgBottom: [2, 6, 16],
      grid: [0, 240, 255],
      ambientAura: [0, 180, 255],
    },
    {
      name: 'Magenta & Coral',
      primary: [255, 35, 145],      // #ff2391 - hot neon magenta
      secondary: [255, 105, 55],    // #ff6937 - vivid glowing coral
      rail: [255, 160, 185],        // #ffa0b9 - bright coral highlight
      bodyTop: [52, 12, 32],        // rich dark velvet magenta
      bodyBottom: [24, 5, 16],
      bgTop: [18, 4, 12],           // deep plum cosmos
      bgMid: [36, 8, 24],           // rich magenta ambient depth
      bgBottom: [12, 3, 8],
      grid: [255, 42, 145],
      ambientAura: [255, 35, 145],
    },
    {
      name: 'Acid Lime & Toxic Neon',
      primary: [175, 255, 20],      // #afff14 - intense radioactive acid lime
      secondary: [20, 220, 90],     // #14dc5a - vibrant toxic emerald
      rail: [220, 255, 140],        // #dcff8c - high-voltage lime rail
      bodyTop: [24, 48, 12],        // rich dark toxic green
      bodyBottom: [10, 22, 6],
      bgTop: [6, 16, 6],            // deep bio-hazard abyss
      bgMid: [14, 34, 12],          // vivid acid-lime ambient depth
      bgBottom: [4, 10, 4],
      grid: [175, 255, 20],
      ambientAura: [175, 255, 20],
    },
    {
      name: 'Ultraviolet & Deep Violet',
      primary: [170, 70, 255],      // #aa46ff - electric neon violet
      secondary: [220, 40, 255],    // #dc28ff - bright electric purple
      rail: [225, 175, 255],        // #e1afff - glowing ultraviolet rail
      bodyTop: [36, 14, 62],        // rich dark royal violet
      bodyBottom: [18, 6, 30],
      bgTop: [14, 4, 24],           // deep cosmic violet abyss
      bgMid: [28, 8, 48],           // rich ultraviolet atmospheric depth
      bgBottom: [10, 2, 16],
      grid: [170, 70, 255],
      ambientAura: [170, 70, 255],
    },
    {
      name: 'Electric Orange & Solar Flare',
      primary: [255, 95, 0],        // #ff5f00 - searing electric orange
      secondary: [255, 195, 0],     // #ffc300 - radiant solar gold
      rail: [255, 210, 130],        // #ffd282 - incandescent solar rail
      bodyTop: [54, 22, 6],         // rich dark burnt amber
      bodyBottom: [26, 9, 2],
      bgTop: [18, 7, 2],            // deep solar flare void
      bgMid: [36, 14, 4],           // rich electric orange atmospheric depth
      bgBottom: [12, 4, 1],
      grid: [255, 110, 10],
      ambientAura: [255, 95, 0],
    },
    {
      name: 'Turquoise & Aquamarine',
      primary: [0, 245, 185],       // #00f5b9 - vivid cyber turquoise
      secondary: [0, 175, 235],     // #00afeb - bright aquamarine
      rail: [140, 255, 230],        // #8cffe6 - luminous seafoam rail
      bodyTop: [8, 46, 42],         // rich dark oceanic teal
      bodyBottom: [4, 22, 20],
      bgTop: [2, 14, 16],           // deep abyss oceanic cosmos
      bgMid: [4, 30, 32],           // rich turquoise atmospheric depth
      bgBottom: [2, 8, 10],
      grid: [0, 245, 185],
      ambientAura: [0, 245, 185],
    },
    {
      name: 'Crimson & Ember',
      primary: [255, 25, 65],       // #ff1941 - laser neon crimson
      secondary: [255, 110, 25],    // #ff6e19 - glowing molten ember
      rail: [255, 165, 175],        // #ffa5af - bright crimson rail
      bodyTop: [56, 10, 18],        // rich dark volcanic obsidian
      bodyBottom: [26, 4, 8],
      bgTop: [18, 3, 6],            // deep volcanic crimson void
      bgMid: [36, 6, 12],           // rich neon crimson atmospheric depth
      bgBottom: [12, 2, 4],
      grid: [255, 45, 75],
      ambientAura: [255, 25, 65],
    },
    {
      name: 'Emerald & Gold',
      primary: [0, 230, 115],       // #00e673 - radiant emerald green
      secondary: [255, 215, 0],     // #ffd700 - cyber gold
      rail: [170, 255, 205],        // #aaffcd - lustrous jade rail
      bodyTop: [12, 50, 28],        // rich dark imperial malachite
      bodyBottom: [5, 24, 13],
      bgTop: [3, 16, 10],           // deep malachite cosmos
      bgMid: [6, 34, 20],           // rich emerald atmospheric depth
      bgBottom: [2, 10, 6],
      grid: [0, 230, 115],
      ambientAura: [0, 230, 115],
    },
    {
      name: 'Sunset Amber & Rose',
      primary: [255, 150, 0],       // #ff9600 - deep radiant amber
      secondary: [255, 45, 110],    // #ff2d6e - twilight rose
      rail: [255, 220, 140],        // #ffdc8c - warm twilight amber rail
      bodyTop: [50, 26, 10],        // rich dark twilight sienna
      bodyBottom: [24, 11, 4],
      bgTop: [16, 7, 3],            // deep sunset dusk cosmos
      bgMid: [34, 14, 6],           // rich amber atmospheric depth
      bgBottom: [10, 4, 2],
      grid: [255, 150, 0],
      ambientAura: [255, 150, 0],
    },
    {
      name: 'Chrome Silver & Platinum',
      primary: [225, 235, 245],     // #e1ebf5 - gleaming chrome silver
      secondary: [130, 160, 195],   // #82a0c3 - cool steel blue
      rail: [255, 255, 255],        // #ffffff - pure platinum white rail
      bodyTop: [32, 38, 50],        // rich metallic dark titanium
      bodyBottom: [14, 17, 24],
      bgTop: [10, 12, 16],          // deep monochrome charcoal void
      bgMid: [20, 24, 32],          // sleek chrome atmospheric depth
      bgBottom: [7, 8, 12],
      grid: [185, 205, 230],
      ambientAura: [210, 225, 245],
    },
    {
      name: 'Cyberpunk Yellow & Cobalt',
      primary: [255, 235, 0],       // #ffeb00 - high-voltage laser yellow
      secondary: [30, 100, 255],    // #1e64ff - deep electric cobalt
      rail: [255, 250, 150],        // #fffa96 - blazing laser rail
      bodyTop: [32, 34, 14],        // rich dark industrial carbon
      bodyBottom: [14, 16, 6],
      bgTop: [8, 10, 18],           // deep tech-noir midnight void
      bgMid: [22, 24, 12],          // laser-yellow ambient aura
      bgBottom: [5, 7, 14],
      grid: [255, 235, 0],
      ambientAura: [255, 235, 0],
    },
    {
      name: 'Neon Rose & Ruby',
      primary: [255, 20, 120],      // #ff1478 - electric hot pink
      secondary: [200, 10, 70],     // #c80a46 - deep ruby red
      rail: [255, 160, 205],        // #ffa0cd - luminous pink rail
      bodyTop: [52, 10, 28],        // rich dark ruby velvet
      bodyBottom: [24, 4, 12],
      bgTop: [18, 3, 10],           // deep noir rose cosmos
      bgMid: [36, 6, 20],           // rich hot pink atmospheric depth
      bgBottom: [10, 2, 6],
      grid: [255, 20, 120],
      ambientAura: [255, 20, 120],
    },
    {
      name: 'Hyper Mint & Jade',
      primary: [30, 255, 170],      // #1effaa - hyper neon mint
      secondary: [0, 180, 115],     // #00b473 - deep forest jade
      rail: [170, 255, 220],        // #aaffdc - crystalline mint rail
      bodyTop: [10, 46, 34],        // rich dark pine mint
      bodyBottom: [4, 22, 16],
      bgTop: [2, 15, 12],           // deep nocturnal mint void
      bgMid: [4, 32, 24],           // rich mint atmospheric depth
      bgBottom: [2, 9, 7],
      grid: [30, 255, 170],
      ambientAura: [30, 255, 170],
    },
    {
      name: 'Amethyst & Orchid',
      primary: [225, 45, 245],      // #e12df5 - vivid neon orchid
      secondary: [130, 50, 255],    // #8232ff - electric amethyst
      rail: [245, 175, 255],        // #f5afff - radiant orchid rail
      bodyTop: [44, 14, 52],        // rich dark royal orchid
      bodyBottom: [20, 5, 24],
      bgTop: [16, 4, 20],           // deep amethyst cosmos
      bgMid: [32, 8, 40],           // rich orchid atmospheric depth
      bgBottom: [10, 2, 12],
      grid: [225, 45, 245],
      ambientAura: [225, 45, 245],
    },
    {
      name: 'Solar Plasma & Tangerine',
      primary: [255, 75, 10],       // #ff4b0a - blazing plasma orange
      secondary: [255, 160, 0],     // #ffa000 - molten solar amber
      rail: [255, 195, 140],        // #ffc38c - white-hot plasma rail
      bodyTop: [54, 18, 6],         // rich dark magma mantle
      bodyBottom: [26, 7, 2],
      bgTop: [18, 5, 2],            // deep cosmic magma void
      bgMid: [38, 10, 4],           // rich fiery orange atmospheric depth
      bgBottom: [12, 3, 1],
      grid: [255, 85, 20],
      ambientAura: [255, 75, 10],
    },
    {
      name: 'Synthwave Azure & Indigo',
      primary: [40, 165, 255],      // #28a5ff - radiant azure sky
      secondary: [115, 65, 255],    // #7341ff - neon synth indigo
      rail: [175, 225, 255],        // #afe1ff - crystal azure rail
      bodyTop: [16, 26, 62],        // rich dark 80s synth indigo
      bodyBottom: [7, 12, 30],
      bgTop: [5, 8, 24],            // deep twilight indigo cosmos
      bgMid: [10, 18, 48],          // rich synthwave azure depth
      bgBottom: [3, 5, 18],
      grid: [40, 165, 255],
      ambientAura: [40, 165, 255],
    },
  ];

  function getThemeIndexForLevel(lvl) {
    const n = Math.floor(Number(lvl));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return ((n - 1) % LEVEL_THEMES.length + LEVEL_THEMES.length) % LEVEL_THEMES.length;
  }

  function getThemeForLevel(lvl) {
    const idx = getThemeIndexForLevel(lvl);
    return LEVEL_THEMES[idx];
  }

  function lerpColor(c1, c2, t) {
    return [
      c1[0] + (c2[0] - c1[0]) * t,
      c1[1] + (c2[1] - c1[1]) * t,
      c1[2] + (c2[2] - c1[2]) * t,
    ];
  }

  function rgbStr(c) {
    return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
  }

  function rgbaStr(c, a) {
    return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
  }

  class ThemeManager {
    constructor() {
      this.currentLevel = 1;
      const t = getThemeForLevel(1);
      this.current = this.cloneTheme(t);
      this.target = this.cloneTheme(t);
    }

    cloneTheme(theme) {
      return {
        name: theme.name,
        primary: [...theme.primary],
        secondary: [...theme.secondary],
        rail: [...theme.rail],
        bodyTop: [...theme.bodyTop],
        bodyBottom: [...theme.bodyBottom],
        bgTop: [...theme.bgTop],
        bgMid: [...theme.bgMid],
        bgBottom: [...theme.bgBottom],
        grid: theme.grid ? [...theme.grid] : [...theme.primary],
        ambientAura: theme.ambientAura ? [...theme.ambientAura] : [...theme.secondary],
      };
    }

    setLevel(lvl, instant = false) {
      this.currentLevel = lvl;
      const t = getThemeForLevel(lvl);
      this.target = this.cloneTheme(t);
      if (instant) {
        this.current = this.cloneTheme(t);
      }
    }

    update(dt) {
      // Smooth interpolation factor (~0.4s to 0.6s full seamless blend)
      const t = Math.min(1, dt * 3.5);
      this.current.primary = lerpColor(this.current.primary, this.target.primary, t);
      this.current.secondary = lerpColor(this.current.secondary, this.target.secondary, t);
      this.current.rail = lerpColor(this.current.rail, this.target.rail, t);
      this.current.bodyTop = lerpColor(this.current.bodyTop, this.target.bodyTop, t);
      this.current.bodyBottom = lerpColor(this.current.bodyBottom, this.target.bodyBottom, t);
      this.current.bgTop = lerpColor(this.current.bgTop, this.target.bgTop, t);
      this.current.bgMid = lerpColor(this.current.bgMid, this.target.bgMid, t);
      this.current.bgBottom = lerpColor(this.current.bgBottom, this.target.bgBottom, t);
      this.current.grid = lerpColor(this.current.grid, this.target.grid, t);
      this.current.ambientAura = lerpColor(this.current.ambientAura, this.target.ambientAura, t);
    }

    getColors() {
      const c = this.current;
      return {
        name: this.target.name,
        primary: rgbStr(c.primary),
        primaryRgb: c.primary,
        primaryAlpha: (a) => rgbaStr(c.primary, a),
        secondary: rgbStr(c.secondary),
        secondaryRgb: c.secondary,
        secondaryAlpha: (a) => rgbaStr(c.secondary, a),
        rail: rgbStr(c.rail),
        railAlpha: (a) => rgbaStr(c.rail, a),
        bodyTop: rgbStr(c.bodyTop),
        bodyBottom: rgbStr(c.bodyBottom),
        bgTop: rgbStr(c.bgTop),
        bgMid: rgbStr(c.bgMid),
        bgBottom: rgbStr(c.bgBottom),
        grid: rgbStr(c.grid),
        gridAlpha: (a) => rgbaStr(c.grid, a),
        ambientAlpha: (a) => rgbaStr(c.ambientAura, a),
      };
    }
  }

  // --- Game States ---
  const STATE = {
    MENU: 'MENU',
    LEVEL_SELECT: 'LEVEL_SELECT',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    CONTINUE: 'CONTINUE',
    SHOP: 'SHOP',
    GAMEOVER: 'GAMEOVER',
  };

  // --- Audio Synthesizer (Web Audio API, Zero External Assets) ---
  class SoundSynth {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SOUND);
        if (saved !== null) {
          this.enabled = saved !== 'false';
        }
      } catch (e) {}
    }

    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    suspend() {
      if (this.ctx && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    setEnabled(val) {
      this.enabled = !!val;
      try {
        localStorage.setItem(STORAGE_KEY_SOUND, this.enabled ? 'true' : 'false');
      } catch (e) {}
    }

    // 1. Bounce: Soft, satisfying electronic pop
    playBounce() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(170, now + 0.08);

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.09);
      } catch (e) {}
    }

    // 2. Level completion: Cheerful electronic chime
    playLevelComplete() {
      if (!this.enabled || !this.ctx) return;
      try {
        const chord = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        chord.forEach((freq, idx) => {
          const now = this.ctx.currentTime + idx * 0.075;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.23);
        });
      } catch (e) {}
    }

    // 3. Hazard collision: Distinct impact sound when player hits a spike
    playHazard() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.22);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.23);
      } catch (e) {}
    }

    // 4. Game over: Short descending electronic tone
    playGameOver() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.42);

        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.43);
      } catch (e) {}
    }

    // Supplemental arcade sounds (Air jump & Head bump)
    playAirJump() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.13);
      } catch (e) {}
    }

    playHeadBump() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.09);
      } catch (e) {}
    }

    playWallBounce() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.07);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);
      } catch (e) {}
    }

    // 5. Energy Orb collection: Quick crystal pop chime
    playOrbCollect() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.09);
      } catch (e) {}
    }

    // 6. Special Star collection: Radiant celestial arpeggio
    playStarCollect() {
      if (!this.enabled || !this.ctx) return;
      try {
        const notes = [1046.50, 1318.51, 1567.98, 2093.00]; // C6, E6, G6, C7
        notes.forEach((freq, idx) => {
          const now = this.ctx.currentTime + idx * 0.05;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.17);
        });
      } catch (e) {}
    }

    // 7. Results Screen Fanfare: Chords reflecting performance rating
    playResultsScreen(rating = 0) {
      if (!this.enabled || !this.ctx) return;
      try {
        if (rating === 0) {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(140, now + 0.35);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.36);
        } else {
          const chord = rating === 3
            ? [523.25, 659.25, 783.99, 1046.50]
            : [440.00, 554.37, 659.25, 880.00];
          chord.forEach((freq, idx) => {
            const now = this.ctx.currentTime + idx * 0.08;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.29);
          });
        }
      } catch (e) {}
    }

    // 8. Life Lost: Low warning pulse
    playLifeLost() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
      } catch (e) {}
    }

    // 9. Countdown Tick: Crisp metronome blip
    playCountdownTick(num = 1) {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        const freq = 440 + Math.max(0, 5 - num) * 80;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      } catch (e) {}
    }

    // 10. Countdown Go: Bright launch chime
    playCountdownGo() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.16);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
      } catch (e) {}
    }

    // 11. Key Use (Continue): Power-up warp chime
    playKeyUse() {
      if (!this.enabled || !this.ctx) return;
      try {
        const chord = [392.00, 523.25, 659.25, 783.99, 1046.50];
        chord.forEach((freq, idx) => {
          const now = this.ctx.currentTime + idx * 0.05;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.21);
        });
      } catch (e) {}
    }

    // 12. Vault Purchase: Satisfying coin/purchase chime
    playPurchase() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        [987.77, 1318.51].forEach((freq, idx) => {
          const t = now + idx * 0.07;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.22, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.16);
        });
      } catch (e) {}
    }

    // 13. Error/Denied: Subtle rejection buzz
    playError() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.setValueAtTime(110, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.19);
      } catch (e) {}
    }
  }

  // --- Collectible Energy Orb Entity (World Space) ---
  class CollectibleOrb {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.radius = 7;
      this.collected = false;
      this.floatPhase = Math.random() * Math.PI * 2;
      this.pulsePhase = Math.random() * Math.PI * 2;
      this.floatSpeed = 2.4;
      this.pulseSpeed = 3.2;
    }

    update(dt) {
      this.floatPhase += this.floatSpeed * dt;
      this.pulsePhase += this.pulseSpeed * dt;
    }

    getVisualY() {
      return this.y + Math.sin(this.floatPhase) * 4.5;
    }

    render(ctx) {
      if (this.collected) return;
      const drawY = this.getVisualY();
      const pulse = (Math.sin(this.pulsePhase) + 1) * 0.5;
      const outerGlowRadius = this.radius * (1.8 + pulse * 0.6);

      ctx.save();
      ctx.translate(this.x, drawY);

      // Outer cyan aura glow
      const glowGrad = ctx.createRadialGradient(0, 0, this.radius * 0.3, 0, 0, outerGlowRadius);
      glowGrad.addColorStop(0, 'rgba(0, 240, 255, 0.85)');
      glowGrad.addColorStop(0.5, 'rgba(0, 180, 255, 0.35)');
      glowGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');

      ctx.beginPath();
      ctx.arc(0, 0, outerGlowRadius, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Energy orb core
      const coreGrad = ctx.createRadialGradient(
        -this.radius * 0.25,
        -this.radius * 0.25,
        this.radius * 0.1,
        0,
        0,
        this.radius
      );
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.4, '#00f0ff');
      coreGrad.addColorStop(0.85, '#0096c7');
      coreGrad.addColorStop(1, '#0077b6');

      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Sharp inner white highlight
      ctx.beginPath();
      ctx.arc(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();

      ctx.restore();
    }
  }

  // --- Collectible Special Star Entity (World Space) ---
  class CollectibleStar {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.radius = 11; // Collision radius
      this.outerRadius = 14;
      this.innerRadius = 6.5;
      this.collected = false;
      this.floatPhase = Math.random() * Math.PI * 2;
      this.floatSpeed = 2.0;
      this.rot = 0;
      this.rotSpeed = 1.3;
    }

    update(dt) {
      this.floatPhase += this.floatSpeed * dt;
      this.rot += this.rotSpeed * dt;
    }

    getVisualY() {
      return this.y + Math.sin(this.floatPhase) * 5.0;
    }

    render(ctx) {
      if (this.collected) return;
      const drawY = this.getVisualY();

      ctx.save();
      ctx.translate(this.x, drawY);

      // Celestial golden glow aura
      const auraGrad = ctx.createRadialGradient(0, 0, this.innerRadius, 0, 0, this.outerRadius * 1.8);
      auraGrad.addColorStop(0, 'rgba(255, 215, 0, 0.7)');
      auraGrad.addColorStop(0.5, 'rgba(255, 170, 0, 0.28)');
      auraGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');

      ctx.beginPath();
      ctx.arc(0, 0, this.outerRadius * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = auraGrad;
      ctx.fill();

      // Rotating 5-point star
      ctx.rotate(this.rot);

      ctx.beginPath();
      const points = 5;
      for (let i = 0; i < points * 2; i++) {
        const r = (i % 2 === 0) ? this.outerRadius : this.innerRadius;
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();

      // Radiant gold gradient
      const starGrad = ctx.createLinearGradient(0, -this.outerRadius, 0, this.outerRadius);
      starGrad.addColorStop(0, '#ffffff');
      starGrad.addColorStop(0.3, '#fff3b0');
      starGrad.addColorStop(0.7, '#ffd700');
      starGrad.addColorStop(1, '#ff9e00');

      ctx.fillStyle = starGrad;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.fill();

      // Sharp golden border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();
    }
  }

  // --- Ball Entity (World Space) ---
  class Ball {
    constructor() {
      this.radius = 14;
      this.reset();
    }

    reset(startX = 240, startY = 590) {
      this.x = startX;
      this.y = startY;
      this.prevX = startX;
      this.prevY = startY;
      this.vx = 0;
      this.vy = 0;
      this.squashX = 1.0;
      this.squashY = 1.0;
      this.hasAirJump = false;
      this.trail = [];
    }

    applyAirJump() {
      if (this.hasAirJump) {
        this.vy = AIR_JUMP_IMPULSE;
        this.hasAirJump = false;
        this.squashX = 0.82;
        this.squashY = 1.25;
        return true;
      }
      return false;
    }

    triggerBounce() {
      // Landing bounce always imparts full upward bounce impulse
      this.vy = BOUNCE_VELOCITY;
      this.squashX = 1.38;
      this.squashY = 0.65;
      this.hasAirJump = true; // Landing resets air jump availability
    }

    updateVisuals(dt) {
      // Dynamic squash & stretch relaxation
      this.squashX += (1.0 - this.squashX) * Math.min(1, dt * 14);
      this.squashY += (1.0 - this.squashY) * Math.min(1, dt * 14);

      // Velocity-based stretching when moving fast in air
      if (Math.abs(this.vy) > 320 && this.squashY === 1.0) {
        this.squashY = 1.15;
        this.squashX = 0.88;
      }

      // Trail update in world coordinates
      this.trail.unshift({ x: this.x, y: this.y, alpha: 0.7 });
      if (this.trail.length > 8) {
        this.trail.pop();
      }
      for (let i = 0; i < this.trail.length; i++) {
        this.trail[i].alpha -= dt * 2.2;
      }
    }

    render(ctx, theme = null) {
      // 1. Render glowing trail with subtle active level theme accent
      for (let i = this.trail.length - 1; i >= 0; i--) {
        const pt = this.trail[i];
        if (pt.alpha <= 0) continue;
        const trailRadius = this.radius * (1 - (i / this.trail.length) * 0.5);

        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, trailRadius, 0, Math.PI * 2);
        ctx.fillStyle = theme
          ? theme.primaryAlpha(Math.max(0, pt.alpha * 0.35))
          : `rgba(0, 240, 255, ${Math.max(0, pt.alpha * 0.35)})`;
        ctx.fill();
        ctx.restore();
      }

      // 2. Render glowing ball with squash & stretch transform
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.squashX, this.squashY);

      // Outer glow aura subtly resonating with active theme
      const glowGrad = ctx.createRadialGradient(0, 0, this.radius * 0.4, 0, 0, this.radius * 2.2);
      if (theme && theme.primaryAlpha) {
        glowGrad.addColorStop(0, theme.primaryAlpha(0.75));
        glowGrad.addColorStop(0.5, theme.secondaryAlpha(0.28));
        glowGrad.addColorStop(1, theme.primaryAlpha(0));
      } else {
        glowGrad.addColorStop(0, 'rgba(0, 240, 255, 0.9)');
        glowGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.35)');
        glowGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
      }

      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Air jump availability halo (subtle bright orbit indicator)
      if (this.hasAirJump) {
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.45, 0, Math.PI * 2);
        ctx.strokeStyle = (theme && theme.primaryAlpha) ? theme.primaryAlpha(0.65) : 'rgba(0, 240, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Respawn invulnerability protection shield aura
      if (this.invulnerable || (typeof window !== 'undefined' && window.bounceGame && window.bounceGame.invulnerableTimer > 0)) {
        ctx.beginPath();
        const pulse = 1.65 + 0.18 * Math.sin(Date.now() * 0.015);
        ctx.arc(0, 0, this.radius * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }

      // Ball body
      const bodyGrad = ctx.createRadialGradient(
        -this.radius * 0.3,
        -this.radius * 0.3,
        this.radius * 0.1,
        0,
        0,
        this.radius
      );
      bodyGrad.addColorStop(0, '#ffffff');
      bodyGrad.addColorStop(0.35, '#00f0ff');
      bodyGrad.addColorStop(0.85, '#0096c7');
      bodyGrad.addColorStop(1, '#005f73');

      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // Inner specular highlight
      ctx.beginPath();
      ctx.arc(-this.radius * 0.35, -this.radius * 0.35, this.radius * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();

      ctx.restore();
    }
  }

  // --- Platform Entity with Moving & Spike Hazard Support ---
  class Platform {
    constructor(x, y, width, height = 16, vx = 0, minX = 0, maxX = CANVAS_WIDTH, spike = null) {
      this.x = x;
      this.y = y;
      this.prevX = x;
      this.width = width;
      this.height = height;
      this.impactPulse = 0;
      this.vx = vx;
      this.minX = minX;
      this.maxX = maxX;
      this.spike = spike; // { width: 32, height: 14, side: 'left'|'right' }
    }

    update(subDt) {
      this.prevX = this.x;

      if (this.vx !== 0) {
        this.x += this.vx * subDt;
        // Deterministic patrol limit reversal
        if (this.x <= this.minX) {
          this.x = this.minX;
          this.vx = Math.abs(this.vx);
        } else if (this.x >= this.maxX) {
          this.x = this.maxX;
          this.vx = -Math.abs(this.vx);
        }
      }
    }

    updateVisuals(dt) {
      if (this.impactPulse > 0) {
        this.impactPulse = Math.max(0, this.impactPulse - dt * 4);
      }
    }

    triggerImpact() {
      this.impactPulse = 1.0;
    }

    render(ctx, theme = null) {
      ctx.save();

      const pulseOffset = Math.sin(this.impactPulse * Math.PI) * 2;
      const drawY = this.y + pulseOffset;

      const bodyTop = theme ? theme.bodyTop : '#0b1a30';
      const bodyBottom = theme ? theme.bodyBottom : '#060d1a';
      const primaryCol = theme ? theme.primary : '#00f0ff';
      const primaryAlpha = theme ? theme.primaryAlpha : (a) => `rgba(0, 240, 255, ${a})`;
      const railCol = theme ? theme.rail : '#38bdf8';

      // 1. Platform body gradient from active level theme
      const bodyGrad = ctx.createLinearGradient(this.x, drawY, this.x, drawY + this.height);
      bodyGrad.addColorStop(0, bodyTop);
      bodyGrad.addColorStop(1, bodyBottom);

      ctx.beginPath();
      ctx.roundRect(this.x, drawY, this.width, this.height, 6);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // 2. Outer neon bloom glow (radiant aura in theme color)
      ctx.beginPath();
      ctx.roundRect(this.x, drawY, this.width, this.height, 6);
      ctx.lineWidth = 5;
      ctx.strokeStyle = this.impactPulse > 0 ? 'rgba(255, 255, 255, 0.65)' : primaryAlpha(0.38);
      ctx.stroke();

      // 3. Crisp inner neon border
      ctx.beginPath();
      ctx.roundRect(this.x, drawY, this.width, this.height, 6);
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.impactPulse > 0 ? '#ffffff' : primaryCol;
      ctx.stroke();

      // 4. Glowing top impact rail
      const railGrad = ctx.createLinearGradient(this.x, drawY, this.x + this.width, drawY);
      if (this.impactPulse > 0) {
        railGrad.addColorStop(0, primaryAlpha(0.75));
        railGrad.addColorStop(0.5, '#ffffff');
        railGrad.addColorStop(1, primaryAlpha(0.75));
      } else {
        railGrad.addColorStop(0, primaryAlpha(0.45));
        railGrad.addColorStop(0.5, railCol);
        railGrad.addColorStop(1, primaryAlpha(0.45));
      }

      ctx.beginPath();
      ctx.moveTo(this.x + 4, drawY + 1);
      ctx.lineTo(this.x + this.width - 4, drawY + 1);
      ctx.strokeStyle = railGrad;
      ctx.lineWidth = 3;
      ctx.stroke();

      // 5. Distinct glowing boundary edge caps for safe landing zone readability
      let safeEdgeL = this.x + 2;
      let safeEdgeR = this.x + this.width - 2;
      if (this.spike) {
        if (this.spike.side === 'left') {
          safeEdgeL = this.x + this.spike.width + 2;
        } else {
          safeEdgeR = this.x + this.width - this.spike.width - 2;
        }
      }

      ctx.beginPath();
      ctx.moveTo(safeEdgeL, drawY - 2);
      ctx.lineTo(safeEdgeL, drawY + 6);
      ctx.moveTo(safeEdgeR, drawY - 2);
      ctx.lineTo(safeEdgeR, drawY + 6);
      ctx.strokeStyle = this.impactPulse > 0 ? '#ffffff' : primaryAlpha(0.9);
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Impact halo when ball lands or bumps
      if (this.impactPulse > 0) {
        ctx.beginPath();
        ctx.roundRect(
          this.x - 4,
          drawY - 3,
          this.width + 8,
          this.height + 6,
          8
        );
        ctx.strokeStyle = primaryAlpha(this.impactPulse * 0.75);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // NOTE: Platform labels (START BASE, TIER 1, TIER 2, etc.) have been completely removed
      // to keep platforms clean visual geometric shapes.

      // Render Spike Hazard (if attached)
      // Designed for high-contrast visibility across ALL themes (including Orange & Hot Magenta)
      if (this.spike) {
        const sX = (this.spike.side === 'left') ? this.x + 4 : this.x + this.width - this.spike.width - 4;
        const sY = drawY;
        const sW = this.spike.width;
        const sH = this.spike.height;

        ctx.save();
        // High-contrast caution baseline (Warning Yellow #ffcc00 + dark backing)
        ctx.fillStyle = '#140004';
        ctx.fillRect(sX, sY, sW, 3);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(sX, sY, sW, 1.5);

        // Glowing razor crimson spikes with incandescent white apex
        const teeth = 3;
        const toothW = sW / teeth;
        for (let i = 0; i < teeth; i++) {
          const tLeft = sX + i * toothW;
          const tMid = tLeft + toothW / 2;
          const tRight = tLeft + toothW;

          ctx.beginPath();
          ctx.moveTo(tLeft, sY);
          ctx.lineTo(tMid, sY - sH);
          ctx.lineTo(tRight, sY);
          ctx.closePath();

          // High-visibility vertical gradient: white-hot apex -> crimson red -> deep hazard red
          const spikeGrad = ctx.createLinearGradient(tMid, sY - sH, tMid, sY);
          spikeGrad.addColorStop(0, '#ffffff');
          spikeGrad.addColorStop(0.22, '#ff1744');
          spikeGrad.addColorStop(1, '#b70020');

          ctx.fillStyle = spikeGrad;
          ctx.shadowColor = '#ff003c';
          ctx.shadowBlur = 10;
          ctx.fill();

          // Crisp white boundary line
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.restore();
    }
  }

  // --- Particle Effects Manager ---
  class ParticleManager {
    constructor() {
      this.particles = [];
      this.maxParticles = 80;
    }

    reset() {
      this.particles = [];
    }

    spawnBounceSparks(x, y, themeColors = null, count = 12) {
      const col1 = themeColors ? themeColors.primary : '#00f0ff';
      const col2 = themeColors ? themeColors.secondary : '#a855f7';
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= this.maxParticles) {
          this.particles.shift();
        }
        const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.8;
        const speed = 70 + Math.random() * 150;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 16,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          radius: 1.5 + Math.random() * 2,
          color: Math.random() > 0.4 ? col1 : col2,
          life: 1.0,
          decay: 2.2 + Math.random() * 1.5,
        });
      }
    }

    spawnHeadBumpSparks(x, y, count = 10) {
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= this.maxParticles) {
          this.particles.shift();
        }
        const angle = (Math.random() - 0.5) * Math.PI * 0.8;
        const speed = 60 + Math.random() * 130;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 14,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + 30,
          radius: 1.4 + Math.random() * 1.8,
          color: '#ff2a6d',
          life: 0.9,
          decay: 2.8 + Math.random() * 1.5,
        });
      }
    }

    spawnAirJumpRing(x, y) {
      for (let i = 0; i < 14; i++) {
        if (this.particles.length >= this.maxParticles) {
          this.particles.shift();
        }
        const angle = (i / 14) * Math.PI * 2;
        const speed = 80 + Math.random() * 40;
        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.5 + 20,
          radius: 1.8 + Math.random() * 1.5,
          color: '#00f0ff',
          life: 1.0,
          decay: 2.8,
        });
      }
    }

    spawnHazardSparks(x, y, count = 16) {
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= this.maxParticles) {
          this.particles.shift();
        }
        const angle = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 180;
        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2 + Math.random() * 2.5,
          color: Math.random() > 0.5 ? '#ff2a6d' : '#ffd166',
          life: 1.0,
          decay: 2.5,
        });
      }
    }

    spawnWallSparks(x, y, isLeft) {
      for (let i = 0; i < 6; i++) {
        if (this.particles.length >= this.maxParticles) {
          this.particles.shift();
        }
        const baseAngle = isLeft ? 0 : Math.PI;
        const angle = baseAngle + (Math.random() - 0.5) * (Math.PI * 0.6);
        const speed = 50 + Math.random() * 110;
        this.particles.push({
          x: x,
          y: y + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1.5 + Math.random() * 1.8,
          color: '#00f0ff',
          life: 1.0,
          decay: 3.0 + Math.random() * 2.0,
        });
      }
    }

    spawnOrbCollectSparks(x, y, count = 12) {
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= this.maxParticles) {
          this.particles.shift();
        }
        const angle = Math.random() * Math.PI * 2;
        const speed = 70 + Math.random() * 120;
        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 20,
          radius: 1.5 + Math.random() * 2,
          color: Math.random() > 0.3 ? '#00f0ff' : '#ffffff',
          life: 0.85,
          decay: 2.6 + Math.random() * 1.2,
        });
      }
    }

    spawnStarCollectBurst(x, y, count = 18) {
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= this.maxParticles) {
          this.particles.shift();
        }
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const speed = 90 + Math.random() * 140;
        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          radius: 2.0 + Math.random() * 2.2,
          color: Math.random() > 0.4 ? '#ffd700' : (Math.random() > 0.5 ? '#fff3b0' : '#ff9e00'),
          life: 1.1,
          decay: 2.2 + Math.random() * 0.9,
        });
      }
    }

    update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 380 * dt; // Gravity on particles
        p.life -= p.decay * dt;

        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    render(ctx) {
      ctx.save();
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.radius * p.life), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- Background Grid & Parallax Neon Ambiance ---
  class Background {
    constructor() {
      this.stars = [];
      this.lastHeight = CANVAS_HEIGHT;
      this.initStars(CANVAS_HEIGHT);
    }

    initStars(height = CANVAS_HEIGHT) {
      this.stars = [];
      for (let i = 0; i < 40; i++) {
        const isCyan = Math.random() > 0.45;
        this.stars.push({
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * height,
          radius: 0.75 + Math.random() * 1.35,
          alpha: 0.2 + Math.random() * 0.6,
          parallax: 0.18 + Math.random() * 0.5,
          colorPrefix: isCyan ? 'rgba(56, 189, 248, ' : 'rgba(192, 132, 252, ',
          useAccent: Math.random() > 0.5,
        });
      }
    }

    updateDimensions(height) {
      if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
        if (Math.abs((this.lastHeight || CANVAS_HEIGHT) - height) > 40) {
          this.lastHeight = height;
          this.initStars(height);
        }
      }
    }

    render(ctx, cameraY, theme = null) {
      ctx.save();
      const currentHeight = (ctx && ctx.canvas && ctx.canvas.height) ? ctx.canvas.height : CANVAS_HEIGHT;

      // Atmospheric cyber backdrop tinted to the active level theme's color family
      const bgGrad = ctx.createLinearGradient(0, 0, 0, currentHeight);
      if (theme && theme.bgTop) {
        bgGrad.addColorStop(0, theme.bgTop);
        bgGrad.addColorStop(0.38, theme.bgMid);
        bgGrad.addColorStop(0.82, theme.bgBottom);
        bgGrad.addColorStop(1, theme.bgTop);
      } else {
        bgGrad.addColorStop(0, '#03050e');
        bgGrad.addColorStop(0.35, theme ? theme.bodyBottom : '#070c22');
        bgGrad.addColorStop(0.75, '#080d26');
        bgGrad.addColorStop(1, '#040612');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, currentHeight);

      // Atmospheric upper ambient radial glow in active theme's signature aura
      const ambientAura = ctx.createRadialGradient(CANVAS_WIDTH * 0.5, 0, 20, CANVAS_WIDTH * 0.5, 0, 380);
      if (theme && theme.ambientAlpha) {
        ambientAura.addColorStop(0, theme.ambientAlpha(0.26));
        ambientAura.addColorStop(0.5, theme.ambientAlpha(0.08));
        ambientAura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        ambientAura.addColorStop(0, 'rgba(124, 58, 237, 0.12)');
        ambientAura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = ambientAura;
      ctx.fillRect(0, 0, CANVAS_WIDTH, 380);

      // Visible cyber grid lines that scroll seamlessly with camera and carry the active theme
      ctx.strokeStyle = theme && theme.gridAlpha ? theme.gridAlpha(0.13) : 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;
      const gridSize = 40;

      // Vertical grid lines
      for (let x = 0; x < CANVAS_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, currentHeight);
        ctx.stroke();
      }

      // Horizontal grid lines offset by camera position
      const gridOffsetY = ((-cameraY) % gridSize + gridSize) % gridSize;
      for (let y = gridOffsetY; y < currentHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // Floating ambient cyber dust & stars with parallax
      for (let i = 0; i < this.stars.length; i++) {
        const star = this.stars[i];
        // Calculate screen Y with parallax wrapping
        const screenStarY = ((star.y - cameraY * star.parallax) % currentHeight + currentHeight) % currentHeight;

        ctx.beginPath();
        ctx.arc(star.x, screenStarY, star.radius, 0, Math.PI * 2);
        if (theme && theme.primaryAlpha) {
          ctx.fillStyle = star.useAccent ? theme.secondaryAlpha(star.alpha * 0.85) : theme.primaryAlpha(star.alpha * 0.85);
        } else {
          ctx.fillStyle = `${star.colorPrefix}${star.alpha})`;
        }
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // --- Main Game Controller ---
  class BounceGame {
    constructor() {
      // DOM Elements
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.container = document.getElementById('gameContainer');

      // Screens & HUD
      this.menuScreen = document.getElementById('menuScreen');
      this.pauseScreen = document.getElementById('pauseScreen');
      this.gameOverScreen = document.getElementById('gameOverScreen');
      this.gameHud = document.getElementById('gameHud');

      // Progression HUD elements
      this.hudLevelText = document.getElementById('hudLevelText');
      this.hudLevelProgress = document.getElementById('hudLevelProgress');
      this.hudScore = document.getElementById('hudScore');
      this.hudBest = document.getElementById('hudBest');
      this.hudRunOrbs = document.getElementById('hudRunOrbs');
      this.hudRunStars = document.getElementById('hudRunStars');

      // Lives & Currency HUD elements
      this.hudLivesGroup = document.getElementById('hudLivesGroup');
      this.lifePip1 = document.getElementById('lifePip1');
      this.lifePip2 = document.getElementById('lifePip2');
      this.lifePip3 = document.getElementById('lifePip3');
      this.hudBlues = document.getElementById('hudBlues');
      this.hudKeys = document.getElementById('hudKeys');

      // 5-Second Respawn Countdown Overlay
      this.respawnCountdownOverlay = document.getElementById('respawnCountdownOverlay');
      this.countdownNumber = document.getElementById('countdownNumber');
      this.countdownTitle = document.getElementById('countdownTitle');
      this.countdownSubtext = document.getElementById('countdownSubtext');

      // Permanent Menu Currency Bar & Vault triggers
      this.menuBluesCount = document.getElementById('menuBluesCount');
      this.menuKeyCount = document.getElementById('menuKeyCount');
      this.menuShopBtn = document.getElementById('menuShopBtn');
      this.menuShopActionBtn = document.getElementById('menuShopActionBtn');
      this.pauseShopBtn = document.getElementById('pauseShopBtn');
      this.resultsShopBtn = document.getElementById('resultsShopBtn');

      // Results screen run & lifetime currency displays
      this.finalRunBlues = document.getElementById('finalRunBlues');
      this.finalTotalBlues = document.getElementById('finalTotalBlues');
      this.finalTotalKeys = document.getElementById('finalTotalKeys');

      // Continue Screen (Dedicated Modal on 3 Lives Lost)
      this.continueScreen = document.getElementById('continueScreen');
      this.continueAltitude = document.getElementById('continueAltitude');
      this.continueKeyCount = document.getElementById('continueKeyCount');
      this.continueBluesCount = document.getElementById('continueBluesCount');
      this.continueWithKeyBtn = document.getElementById('continueWithKeyBtn');
      this.continueOpenShopBtn = document.getElementById('continueOpenShopBtn');
      this.continueSkipBtn = document.getElementById('continueSkipBtn');

      // Key Shop / Neon Vault Modal
      this.keyShopScreen = document.getElementById('keyShopScreen');
      this.shopBluesBalance = document.getElementById('shopBluesBalance');
      this.shopKeysBalance = document.getElementById('shopKeysBalance');
      this.shopBundlesGrid = document.getElementById('shopBundlesGrid');
      this.buyBundleBtn1 = document.getElementById('buyBundleBtn1');
      this.buyBundleBtn3 = document.getElementById('buyBundleBtn3');
      this.buyBundleBtn5 = document.getElementById('buyBundleBtn5');
      this.shopFeedbackMsg = document.getElementById('shopFeedbackMsg');
      this.shopCloseBtn = document.getElementById('shopCloseBtn');

      // Menu stats
      this.menuBestScore = document.getElementById('menuBestScore');
      this.menuHighestLevel = document.getElementById('menuHighestLevel');
      this.menuTotalOrbs = document.getElementById('menuTotalOrbs');
      this.menuTotalStars = document.getElementById('menuTotalStars');

      // Results overlay elements
      this.finalScore = document.getElementById('finalScore');
      this.finalBestScore = document.getElementById('finalBestScore');
      this.finalLevelReached = document.getElementById('finalLevelReached');
      this.finalHighestLevel = document.getElementById('finalHighestLevel');
      this.finalRunOrbs = document.getElementById('finalRunOrbs');
      this.finalRunStars = document.getElementById('finalRunStars');
      this.finalTotalOrbs = document.getElementById('finalTotalOrbs');
      this.finalTotalStars = document.getElementById('finalTotalStars');
      this.starIcon1 = document.getElementById('starIcon1');
      this.starIcon2 = document.getElementById('starIcon2');
      this.starIcon3 = document.getElementById('starIcon3');
      this.ratingVerdictText = document.getElementById('ratingVerdictText');
      this.gameOverSubtext = document.getElementById('gameOverSubtext');
      this.newBestTag = document.getElementById('newBestTag');

      // Level Banner Element
      this.levelBanner = document.getElementById('levelBanner');
      this.levelBannerTitle = document.getElementById('levelBannerTitle');
      this.bannerTimeoutId = null;

      // Level Selection Screen Elements
      this.levelSelectScreen = document.getElementById('levelSelectScreen');
      this.continueLevelBtn = document.getElementById('continueLevelBtn');
      this.continueLevelTitle = document.getElementById('continueLevelTitle');
      this.levelCardsGrid = document.getElementById('levelCardsGrid');
      this.levelGridScroll = document.getElementById('levelGridScroll');
      this.levelSelectBackBtn = document.getElementById('levelSelectBackBtn');
      this.levelSelectProgressSub = document.getElementById('levelSelectProgressSub');
      this.levelsBtn = document.getElementById('levelsBtn');
      this.resultsLevelsBtn = document.getElementById('resultsLevelsBtn');
      this.pauseLevelsBtn = document.getElementById('pauseLevelsBtn');
      this.prevWorldBtn = document.getElementById('prevWorldBtn');
      this.nextWorldBtn = document.getElementById('nextWorldBtn');
      this.worldTitleText = document.getElementById('worldTitleText');
      this.worldRangeText = document.getElementById('worldRangeText');

      // Buttons
      this.playBtn = document.getElementById('playBtn');
      this.resumeBtn = document.getElementById('resumeBtn');
      this.restartBtn = document.getElementById('restartBtn');
      this.restartFromPauseBtn = document.getElementById('restartFromPauseBtn');
      this.pauseBtn = document.getElementById('pauseBtn');
      this.soundBtn = document.getElementById('soundBtn');
      this.menuReturnBtn = document.getElementById('menuReturnBtn');

      // Mobile Floating Controls Elements & Multi-Touch State
      this.touchControls = document.getElementById('touchControls');
      this.touchUp = document.getElementById('touchUp');
      this.touchDown = document.getElementById('touchDown');
      this.touchLeft = document.getElementById('touchLeft');
      this.touchRight = document.getElementById('touchRight');
      this.heldPointers = {
        left: new Set(),
        right: new Set(),
        down: new Set(),
        jump: new Set(),
      };

      // Game Entities & Components
      this.sound = new SoundSynth();
      this.background = new Background();
      this.particles = new ParticleManager();
      this.ball = new Ball();
      this.themeManager = new ThemeManager();

      // Camera Y (world space offset)
      this.cameraY = 0;

      // Platforms array & Procedural Generation Tracker
      this.platforms = [];
      this.highestGeneratedY = 260;

      // Collectibles Arrays (World Space)
      this.collectibles = [];
      this.specialStars = [];
      this.lastStarGeneratedY = 600;

      // Input State
      this.keys = {
        left: false,
        right: false,
        down: false,
      };

      // Game Metrics & Progression State
      this.currentState = STATE.MENU;
      this.score = 0;
      this.maxAltitude = 0;
      this.startAltitude = 0;
      this.level = 1;
      this.highestUnlockedLevel = this.loadHighestUnlockedLevel();
      this.lastPlayedLevel = this.loadLastPlayedLevel();
      this.selectedLevel = this.lastPlayedLevel;
      this.currentWorld = this.getWorldForLevel(this.lastPlayedLevel);
      this.displayedCardsCount = 12;
      this.bestScore = this.loadBestScore();
      this.isNewRecord = false;

      // Collectibles Counters (Run & Persistent)
      this.runOrbs = 0;
      this.runStars = 0;
      this.totalOrbs = this.loadTotalOrbs();
      this.totalStars = this.loadTotalStars();
      this.levelBestRatings = this.loadLevelRatings();
      this.runResultsProcessed = false;

      // Lives, Currency & Continue State
      this.lives = CURRENCY_CONFIG.initialLives;
      this.blues = this.loadBlues();
      this.runBlues = 0;
      this.keysInventory = this.loadKeys();
      this.isRespawning = false;
      this.countdownTimer = 0;
      this.lastCountdownInteger = 0;
      this.invulnerableTimer = 0;
      this.lastSafePlatform = null;
      this.respawnTargetX = 240;
      this.respawnTargetY = 580;
      this.shopPreviousState = STATE.MENU;

      // Loop Timing
      this.lastTime = 0;
      this.animationFrameId = null;

      // Canvas logical dimensions & responsive scaling
      this.canvasHeight = CANVAS_HEIGHT;
      this.updateCanvasDimensions();

      // Initialize
      this.setupEventListeners();
      this.setupMobileControls();
      this.updateSoundButtonUI();
      this.updateLivesDisplay();
      this.updateCurrencyDisplays();
      this.updateScoreDisplays();
      this.setGameState(STATE.MENU);

      // Start Game Loop
      this.loop = this.loop.bind(this);
      this.animationFrameId = requestAnimationFrame(this.loop);
    }

    // --- Dynamic Canvas & Viewport Sizing ---
    updateCanvasDimensions() {
      if (!this.canvas) return;

      let containerW = 0;
      let containerH = 0;

      if (this.container) {
        containerW = this.container.clientWidth;
        containerH = this.container.clientHeight;
        if (!containerW || !containerH) {
          const rect = (typeof this.container.getBoundingClientRect === 'function')
            ? this.container.getBoundingClientRect()
            : null;
          if (rect) {
            containerW = rect.width;
            containerH = rect.height;
          }
        }
      }

      if (!containerW && typeof window !== 'undefined') {
        if (window.visualViewport && window.visualViewport.width > 0) {
          containerW = window.visualViewport.width;
        } else {
          containerW = window.innerWidth || CANVAS_WIDTH;
        }
      }

      if (!containerH && typeof window !== 'undefined') {
        if (window.visualViewport && window.visualViewport.height > 0) {
          containerH = window.visualViewport.height;
        } else {
          containerH = window.innerHeight || 700;
        }
      }

      const clientW = Math.max(1, containerW || CANVAS_WIDTH);
      const clientH = Math.max(1, containerH || 700);

      // Calculate target logical height maintaining fixed CANVAS_WIDTH = 480
      // Clamped to at least 700 to guarantee safe spawn platform at y=620 is comfortably visible
      const aspect = clientH / clientW;
      const targetHeight = Math.max(700, Math.round(CANVAS_WIDTH * aspect));

      CANVAS_HEIGHT = targetHeight;
      this.canvasHeight = targetHeight;

      if (this.canvas.width !== CANVAS_WIDTH) {
        this.canvas.width = CANVAS_WIDTH;
      }
      if (this.canvas.height !== targetHeight) {
        this.canvas.height = targetHeight;
      }

      if (this.background && typeof this.background.updateDimensions === 'function') {
        this.background.updateDimensions(targetHeight);
      }
    }

    // Backward compatibility alias for highestUnlockedLevel
    get highestLevelCompleted() {
      return this.highestUnlockedLevel;
    }
    set highestLevelCompleted(val) {
      this.highestUnlockedLevel = val;
    }

    // --- Persistence ---
    loadBestScore() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_BEST);
        return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
      } catch (e) {
        return 0;
      }
    }

    saveBestScore(val) {
      try {
        localStorage.setItem(STORAGE_KEY_BEST, val.toString());
      } catch (e) {}
    }

    loadHighestUnlockedLevel() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_LEVEL);
        if (!saved) return 1;
        const parsed = parseInt(saved, 10);
        return (Number.isFinite(parsed) && parsed >= 1) ? parsed : 1;
      } catch (e) {
        return 1;
      }
    }

    saveHighestUnlockedLevel(val) {
      try {
        const n = Math.max(1, Math.floor(Number(val) || 1));
        const currentHighest = this.loadHighestUnlockedLevel();
        const toSave = Math.max(currentHighest, n);
        localStorage.setItem(STORAGE_KEY_LEVEL, toSave.toString());
        this.highestUnlockedLevel = toSave;
      } catch (e) {}
    }

    loadHighestLevel() {
      return this.loadHighestUnlockedLevel();
    }

    saveHighestLevel(val) {
      this.saveHighestUnlockedLevel(val);
    }

    loadLastPlayedLevel() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_LAST_PLAYED);
        if (!saved) return 1;
        const parsed = parseInt(saved, 10);
        if (!Number.isFinite(parsed) || parsed < 1) return 1;
        const highest = this.highestUnlockedLevel || this.loadHighestUnlockedLevel();
        return Math.min(parsed, highest);
      } catch (e) {
        return 1;
      }
    }

    saveLastPlayedLevel(val) {
      try {
        const n = Math.max(1, Math.floor(Number(val) || 1));
        const highest = this.highestUnlockedLevel || this.loadHighestUnlockedLevel();
        const clamped = Math.min(n, highest);
        localStorage.setItem(STORAGE_KEY_LAST_PLAYED, clamped.toString());
        this.lastPlayedLevel = clamped;
      } catch (e) {}
    }

    loadTotalOrbs() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_TOTAL_ORBS);
        return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
      } catch (e) {
        return 0;
      }
    }

    saveTotalOrbs(val) {
      try {
        localStorage.setItem(STORAGE_KEY_TOTAL_ORBS, Math.max(0, val).toString());
      } catch (e) {}
    }

    loadTotalStars() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_TOTAL_STARS);
        return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
      } catch (e) {
        return 0;
      }
    }

    saveTotalStars(val) {
      try {
        localStorage.setItem(STORAGE_KEY_TOTAL_STARS, Math.max(0, val).toString());
      } catch (e) {}
    }

    loadLevelRatings() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_LEVEL_RATINGS);
        return saved ? JSON.parse(saved) || {} : {};
      } catch (e) {
        return {};
      }
    }

    saveLevelRatings(data) {
      try {
        localStorage.setItem(STORAGE_KEY_LEVEL_RATINGS, JSON.stringify(data || {}));
      } catch (e) {}
    }

    // --- Currency, Lives & Inventory Management ---
    loadBlues() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_BLUES);
        return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
      } catch (e) {
        return 0;
      }
    }

    saveBlues(val) {
      try {
        const n = Math.max(0, Math.floor(Number(val) || 0));
        localStorage.setItem(STORAGE_KEY_BLUES, n.toString());
        this.blues = n;
      } catch (e) {}
    }

    addBlues(amount, trackRun = true) {
      const qty = Math.max(0, Math.floor(Number(amount) || 0));
      if (qty <= 0) return;
      this.blues = (this.blues || 0) + qty;
      if (trackRun) {
        this.runBlues = (this.runBlues || 0) + qty;
      }
      this.saveBlues(this.blues);
      this.updateCurrencyDisplays();
    }

    spendBlues(amount) {
      const qty = Math.max(0, Math.floor(Number(amount) || 0));
      if (this.blues < qty) return false;
      this.blues -= qty;
      this.saveBlues(this.blues);
      this.updateCurrencyDisplays();
      return true;
    }

    loadKeys() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_KEYS);
        return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
      } catch (e) {
        return 0;
      }
    }

    saveKeys(val) {
      try {
        const n = Math.max(0, Math.floor(Number(val) || 0));
        localStorage.setItem(STORAGE_KEY_KEYS, n.toString());
        this.keysInventory = n;
      } catch (e) {}
    }

    addKeys(amount) {
      const qty = Math.max(0, Math.floor(Number(amount) || 0));
      if (qty <= 0) return;
      this.keysInventory = (this.keysInventory || 0) + qty;
      this.saveKeys(this.keysInventory);
      this.updateCurrencyDisplays();
    }

    useKey() {
      if (this.keysInventory <= 0) return false;
      this.keysInventory--;
      this.saveKeys(this.keysInventory);
      this.updateCurrencyDisplays();
      return true;
    }

    updateLivesDisplay() {
      const pips = [this.lifePip1, this.lifePip2, this.lifePip3];
      pips.forEach((pip, idx) => {
        if (!pip) return;
        if (idx < this.lives) {
          pip.classList.remove('lost');
          pip.classList.add('active');
        } else {
          pip.classList.remove('active');
          pip.classList.add('lost');
        }
      });
    }

    updateCurrencyDisplays() {
      if (this.hudBlues) this.hudBlues.textContent = String(this.blues);
      if (this.hudKeys) this.hudKeys.textContent = String(this.keysInventory);
      if (this.menuBluesCount) this.menuBluesCount.textContent = String(this.blues);
      if (this.menuKeyCount) this.menuKeyCount.textContent = String(this.keysInventory);
      if (this.shopBluesBalance) this.shopBluesBalance.textContent = String(this.blues);
      if (this.shopKeysBalance) this.shopKeysBalance.textContent = String(this.keysInventory);
      if (this.continueKeyCount) this.continueKeyCount.textContent = String(this.keysInventory);
      if (this.continueBluesCount) this.continueBluesCount.textContent = String(this.blues);
      if (this.finalRunBlues) this.finalRunBlues.textContent = `+${this.runBlues || 0}`;
      if (this.finalTotalBlues) this.finalTotalBlues.textContent = String(this.blues);
      if (this.finalTotalKeys) this.finalTotalKeys.textContent = String(this.keysInventory);

      // Update Continue screen button state based on available keys
      if (this.continueWithKeyBtn) {
        const canContinue = (this.keysInventory > 0);
        this.continueWithKeyBtn.disabled = !canContinue;
        this.continueWithKeyBtn.classList.toggle('disabled', !canContinue);
      }

      // Update bundle buttons affordability
      const bundles = CURRENCY_CONFIG.keyBundles || [];
      bundles.forEach((b) => {
        const btn = document.getElementById(`buyBundleBtn${b.keys}`);
        if (btn) {
          const affordable = (this.blues >= b.price);
          btn.disabled = !affordable;
          btn.classList.toggle('insufficient', !affordable);
        }
      });
    }

    // --- Life Loss, Respawn & Continue Management ---
    handlePlayerFall() {
      if (this.isRespawning || this.invulnerableTimer > 0) return;

      if (this.lives > 1) {
        this.lives--;
        this.updateLivesDisplay();
        this.sound.playLifeLost();
        this.startRespawnCountdown();
      } else {
        // Last life lost -> Open Continue modal
        this.lives = 0;
        this.updateLivesDisplay();
        this.sound.playLifeLost();
        this.openContinueScreen();
      }
    }

    startRespawnCountdown() {
      this.isRespawning = true;
      this.countdownTimer = CURRENCY_CONFIG.respawnCountdownSeconds;
      this.lastCountdownInteger = Math.ceil(this.countdownTimer);

      // Find safe platform position
      let targetPlat = this.lastSafePlatform;
      if (!targetPlat || !this.platforms.includes(targetPlat)) {
        targetPlat = this.platforms[0] || null;
      }

      if (targetPlat) {
        let safeLeft = targetPlat.x;
        let safeRight = targetPlat.x + targetPlat.width;
        if (targetPlat.spike) {
          if (targetPlat.spike.side === 'left') {
            safeLeft = targetPlat.x + targetPlat.spike.width + 12;
          } else {
            safeRight = targetPlat.x + targetPlat.width - targetPlat.spike.width - 12;
          }
        }
        this.respawnTargetX = (safeLeft + safeRight) * 0.5;
        this.respawnTargetY = targetPlat.y - this.ball.radius - 2;
      } else {
        this.respawnTargetX = CANVAS_WIDTH * 0.5;
        this.respawnTargetY = this.cameraY + (this.canvasHeight || CANVAS_HEIGHT) * 0.6;
      }

      // Pin ball to safe platform
      this.ball.x = this.respawnTargetX;
      this.ball.y = this.respawnTargetY;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.hasAirJump = true;

      // Adjust camera so safe platform and ball are comfortably visible
      const currentH = this.canvasHeight || CANVAS_HEIGHT;
      const targetOffset = Math.round(currentH * 0.55);
      this.cameraY = this.ball.y - targetOffset;

      // Update overlay UI
      if (this.respawnCountdownOverlay) {
        if (this.countdownTitle) this.countdownTitle.textContent = 'GET READY';
        if (this.countdownNumber) this.countdownNumber.textContent = this.lastCountdownInteger.toString();
        if (this.countdownSubtext) this.countdownSubtext.textContent = `LIVES REMAINING: ${this.lives}`;
        this.respawnCountdownOverlay.classList.remove('hidden');
      }

      this.sound.playCountdownTick(this.lastCountdownInteger);
    }

    finishRespawn() {
      this.isRespawning = false;
      this.invulnerableTimer = CURRENCY_CONFIG.invulnerabilityDurationSeconds;
      this.ball.invulnerable = true;

      if (this.countdownNumber) {
        this.countdownNumber.textContent = 'GO!';
      }
      this.sound.playCountdownGo();

      // Launch upward bounce
      this.ball.triggerBounce();
      this.sound.playBounce();

      setTimeout(() => {
        if (this.respawnCountdownOverlay) {
          this.respawnCountdownOverlay.classList.add('hidden');
        }
      }, 350);
    }

    openContinueScreen() {
      this.resetHeldKeys();
      this.setGameState(STATE.CONTINUE);
      if (this.continueAltitude) this.continueAltitude.textContent = String(this.score);
      if (this.continueKeyCount) this.continueKeyCount.textContent = String(this.keysInventory);
      if (this.continueBluesCount) this.continueBluesCount.textContent = String(this.blues);

      if (this.continueWithKeyBtn) {
        const canContinue = (this.keysInventory > 0);
        this.continueWithKeyBtn.disabled = !canContinue;
        this.continueWithKeyBtn.classList.toggle('disabled', !canContinue);
      }
    }

    continueWithKey() {
      if (this.keysInventory <= 0) return false;
      const used = this.useKey();
      if (!used) return false;

      this.sound.playKeyUse();
      this.lives = CURRENCY_CONFIG.initialLives;
      this.updateLivesDisplay();
      this.setGameState(STATE.PLAYING);
      this.startRespawnCountdown();
      return true;
    }

    skipContinue() {
      this.triggerGameOver('Out of lives');
    }

    // --- Key Shop / Vault Management ---
    openShop(fromState = null) {
      this.shopPreviousState = fromState || this.currentState;
      this.setGameState(STATE.SHOP);
      this.renderShopUI();
    }

    renderShopUI() {
      if (this.shopBluesBalance) this.shopBluesBalance.textContent = String(this.blues);
      if (this.shopKeysBalance) this.shopKeysBalance.textContent = String(this.keysInventory);
      if (this.shopFeedbackMsg) {
        this.shopFeedbackMsg.textContent = '';
        this.shopFeedbackMsg.classList.add('hidden');
        this.shopFeedbackMsg.classList.remove('success', 'error');
      }

      const bundles = CURRENCY_CONFIG.keyBundles || [];
      bundles.forEach((b) => {
        const btn = document.getElementById(`buyBundleBtn${b.keys}`);
        if (btn) {
          const canBuy = (this.blues >= b.price);
          btn.disabled = !canBuy;
          btn.classList.toggle('insufficient', !canBuy);
        }
      });
    }

    buyKeyBundle(keysToAdd, price) {
      if (this.blues < price) {
        if (this.shopFeedbackMsg) {
          this.shopFeedbackMsg.textContent = 'INSUFFICIENT BLUES!';
          this.shopFeedbackMsg.classList.remove('hidden', 'success');
          this.shopFeedbackMsg.classList.add('error');
        }
        this.sound.playError();
        return false;
      }

      const spent = this.spendBlues(price);
      if (!spent) return false;

      this.addKeys(keysToAdd);
      this.sound.playPurchase();

      if (this.shopFeedbackMsg) {
        this.shopFeedbackMsg.textContent = `PURCHASED +${keysToAdd} KEY${keysToAdd > 1 ? 'S' : ''}!`;
        this.shopFeedbackMsg.classList.remove('hidden', 'error');
        this.shopFeedbackMsg.classList.add('success');
      }

      this.renderShopUI();
      return true;
    }

    closeShop() {
      if (this.shopPreviousState === STATE.CONTINUE) {
        this.openContinueScreen();
      } else {
        this.setGameState(this.shopPreviousState || STATE.MENU);
        this.updateScoreDisplays();
      }
    }

    // Three-Star Performance Rating Calculator (Configured via PERFORMANCE_RATING_CONFIG)
    calculatePerformanceRating(score, runOrbs = 0, runStars = 0) {
      try {
        const cfg = PERFORMANCE_RATING_CONFIG || {};
        const s1 = cfg.star1 || cfg.STAR_1 || { minHeight: 300, minAltitude: 300 };
        const s2 = cfg.star2 || cfg.STAR_2 || { minHeight: 750, minAltitude: 750, minOrbs: 5 };
        const s3 = cfg.star3 || cfg.STAR_3 || { minHeight: 1400, minAltitude: 1400, minOrbs: 12, minSpecialStars: 1, orSpecialStars: 1 };

        const s1Alt = s1.minHeight ?? s1.minAltitude ?? 300;
        const s2Alt = s2.minHeight ?? s2.minAltitude ?? 750;
        const s2Orbs = s2.minOrbs ?? 5;
        const s3Alt = s3.minHeight ?? s3.minAltitude ?? 1400;
        const s3Orbs = s3.minOrbs ?? 12;
        const s3Stars = s3.minSpecialStars ?? s3.orSpecialStars ?? 1;

        // Tier 1: Minimum height threshold
        if (score < s1Alt) {
          return 0;
        }

        let stars = 1;

        // Tier 2: Higher height AND orb collection requirement
        if (score >= s2Alt && runOrbs >= s2Orbs) {
          stars = 2;
        } else {
          return stars;
        }

        // Tier 3: Target height AND demanding collectible challenge
        if (
          score >= s3Alt &&
          (runOrbs >= s3Orbs || runStars >= s3Stars)
        ) {
          stars = 3;
        }

        return stars;
      } catch (err) {
        console.error('Error in calculatePerformanceRating:', err);
        return 0;
      }
    }

    toggleSound() {
      this.sound.init();
      this.sound.setEnabled(!this.sound.enabled);
      this.updateSoundButtonUI();
    }

    updateSoundButtonUI() {
      if (!this.soundBtn) return;
      const onIcon = this.soundBtn.querySelector('.sound-on-icon');
      const offIcon = this.soundBtn.querySelector('.sound-off-icon');
      if (this.sound.enabled) {
        if (onIcon) onIcon.classList.remove('hidden');
        if (offIcon) offIcon.classList.add('hidden');
        this.soundBtn.classList.remove('active-muted');
      } else {
        if (onIcon) onIcon.classList.add('hidden');
        if (offIcon) offIcon.classList.remove('hidden');
        this.soundBtn.classList.add('active-muted');
      }
    }

    // --- Level Milestone Banner ---
    showLevelBanner(lvl) {
      if (!this.levelBanner) return;
      if (this.bannerTimeoutId) {
        clearTimeout(this.bannerTimeoutId);
      }
      const theme = this.themeManager.getColors();
      this.levelBannerTitle.textContent = `LEVEL ${lvl} REACHED!`;
      this.levelBannerTitle.style.color = theme.primary;
      this.levelBannerTitle.style.textShadow = `0 0 20px ${theme.primaryAlpha(0.9)}`;
      this.levelBanner.style.borderColor = theme.primaryAlpha(0.7);
      this.levelBanner.style.boxShadow = `0 0 25px ${theme.primaryAlpha(0.45)}, inset 0 0 15px ${theme.primaryAlpha(0.2)}`;
      this.levelBanner.classList.remove('hidden');
      // Trigger CSS animation re-flow
      this.levelBanner.style.animation = 'none';
      void this.levelBanner.offsetWidth; // re-flow
      this.levelBanner.style.animation = '';

      this.bannerTimeoutId = setTimeout(() => {
        this.levelBanner.classList.add('hidden');
      }, 2600);
    }

    // --- State Transitions ---
    setGameState(newState) {
      if (newState !== STATE.PLAYING) {
        this.resetHeldKeys();
      }
      this.currentState = newState;

      // Screen Overlays
      this.menuScreen.classList.toggle('hidden', newState !== STATE.MENU);
      this.menuScreen.classList.toggle('active', newState === STATE.MENU);

      this.pauseScreen.classList.toggle('hidden', newState !== STATE.PAUSED);
      this.pauseScreen.classList.toggle('active', newState === STATE.PAUSED);

      this.gameOverScreen.classList.toggle('hidden', newState !== STATE.GAMEOVER);
      this.gameOverScreen.classList.toggle('active', newState === STATE.GAMEOVER);

      if (this.levelSelectScreen) {
        this.levelSelectScreen.classList.toggle('hidden', newState !== STATE.LEVEL_SELECT);
        this.levelSelectScreen.classList.toggle('active', newState === STATE.LEVEL_SELECT);
      }

      if (this.continueScreen) {
        this.continueScreen.classList.toggle('hidden', newState !== STATE.CONTINUE);
        this.continueScreen.classList.toggle('active', newState === STATE.CONTINUE);
      }

      if (this.keyShopScreen) {
        this.keyShopScreen.classList.toggle('hidden', newState !== STATE.SHOP);
        this.keyShopScreen.classList.toggle('active', newState === STATE.SHOP);
      }

      // HUD Visibility
      this.gameHud.style.display = (newState === STATE.PLAYING || newState === STATE.PAUSED) ? 'flex' : 'none';

      // Floating Mobile Controls Visibility (Active during gameplay only, inactive when respawning or in modal)
      if (this.touchControls) {
        const isPlaying = (newState === STATE.PLAYING && !this.isRespawning);
        this.touchControls.classList.toggle('controls-inactive', !isPlaying);
      }

      if (newState === STATE.LEVEL_SELECT) {
        this.renderLevelSelectUI();
      }

      // Blur / Unfocus buttons so Enter key doesn't trigger unexpected clicks
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }

    // --- World & Portal Progression System ---
    getWorldForLevel(lvl) {
      const n = Math.floor(Number(lvl));
      if (!Number.isFinite(n) || n <= 0) return 1;
      return Math.floor((n - 1) / 12) + 1;
    }

    getWorldStartLevel(w) {
      const worldNum = Math.floor(Number(w));
      if (!Number.isFinite(worldNum) || worldNum <= 0) return 1;
      return (worldNum - 1) * 12 + 1;
    }

    getWorldEndLevel(w) {
      const worldNum = Math.floor(Number(w));
      if (!Number.isFinite(worldNum) || worldNum <= 0) return 12;
      return worldNum * 12;
    }

    isWorldUnlocked(w) {
      const worldNum = Math.floor(Number(w));
      if (!Number.isFinite(worldNum) || worldNum <= 1) return true;
      return this.highestUnlockedLevel >= (worldNum - 1) * 12;
    }

    isPortalUnlocked(w) {
      const worldNum = Math.floor(Number(w));
      if (!Number.isFinite(worldNum) || worldNum <= 0) return false;
      return this.highestUnlockedLevel >= worldNum * 12;
    }

    getMaxAccessibleWorld() {
      return Math.max(1, Math.floor(this.highestUnlockedLevel / 12) + 1);
    }

    goToPrevWorld() {
      if (this.currentWorld > 1) {
        this.currentWorld--;
        if (this.sound && this.sound.playOrbCollect) {
          this.sound.playOrbCollect();
        }
        this.renderLevelSelectUI();
      }
    }

    goToNextWorld() {
      if (this.isPortalUnlocked(this.currentWorld)) {
        this.currentWorld++;
        if (this.sound && this.sound.playStarCollect) {
          this.sound.playStarCollect();
        }
        this.renderLevelSelectUI();
      }
    }

    openLevelSelect(preferredWorld = null) {
      if (typeof preferredWorld === 'number' && Number.isFinite(preferredWorld) && preferredWorld >= 1) {
        this.currentWorld = Math.floor(preferredWorld);
      } else {
        this.currentWorld = this.getWorldForLevel(this.lastPlayedLevel);
      }
      this.currentWorld = Math.max(1, Math.min(this.currentWorld, this.getMaxAccessibleWorld()));
      this.setGameState(STATE.LEVEL_SELECT);
      this.renderLevelSelectUI();
    }

    renderLevelSelectUI() {
      // Ensure last-played level never exceeds highest unlocked level
      this.lastPlayedLevel = Math.min(Math.max(1, this.lastPlayedLevel || 1), this.highestUnlockedLevel);

      // Ensure currentWorld is valid and accessible
      const maxWorld = this.getMaxAccessibleWorld();
      this.currentWorld = Math.max(1, Math.min(this.currentWorld || 1, maxWorld));

      const startLvl = this.getWorldStartLevel(this.currentWorld);
      const endLvl = this.getWorldEndLevel(this.currentWorld);

      if (this.continueLevelTitle) {
        this.continueLevelTitle.textContent = `CONTINUE LEVEL ${this.lastPlayedLevel}`;
      }
      if (this.levelSelectProgressSub) {
        this.levelSelectProgressSub.textContent = `${this.highestUnlockedLevel} UNLOCKED`;
      }
      if (this.worldTitleText) {
        this.worldTitleText.textContent = `WORLD ${this.currentWorld}`;
      }
      if (this.worldRangeText) {
        this.worldRangeText.textContent = `LEVELS ${startLvl}–${endLvl}`;
      }

      const canGoPrev = this.currentWorld > 1;
      const canGoNext = this.isPortalUnlocked(this.currentWorld);

      if (this.prevWorldBtn) {
        this.prevWorldBtn.disabled = !canGoPrev;
        this.prevWorldBtn.classList.toggle('disabled', !canGoPrev);
        this.prevWorldBtn.setAttribute('aria-disabled', canGoPrev ? 'false' : 'true');
      }
      if (this.nextWorldBtn) {
        this.nextWorldBtn.disabled = !canGoNext;
        this.nextWorldBtn.classList.toggle('disabled', !canGoNext);
        this.nextWorldBtn.setAttribute('aria-disabled', canGoNext ? 'false' : 'true');
      }

      this.renderLevelGrid();
    }

    renderLevelGrid() {
      if (!this.levelCardsGrid) return;

      this.levelCardsGrid.innerHTML = '';

      const startLvl = this.getWorldStartLevel(this.currentWorld);
      const endLvl = this.getWorldEndLevel(this.currentWorld);

      // Render the 12 levels for the current world
      for (let lvl = startLvl; lvl <= endLvl; lvl++) {
        const isUnlocked = lvl <= this.highestUnlockedLevel;
        const isCurrent = lvl === this.lastPlayedLevel;
        const starRating = this.levelBestRatings[lvl] || 0;
        const targetAlt = getLevelMilestone(lvl);

        const card = document.createElement('div');
        card.className = `level-card ${isUnlocked ? 'unlocked' : 'locked'}${isCurrent ? ' current' : ''}`;
        card.setAttribute('role', 'listitem');
        card.setAttribute('data-level', String(lvl));

        if (isUnlocked) {
          card.setAttribute('tabindex', '0');
          card.setAttribute('aria-label', `Level ${lvl}, Unlocked, ${starRating} stars earned, target ${targetAlt} altitude`);

          let badgeHtml = '';
          if (isCurrent) {
            badgeHtml = '<span class="card-status-badge active-badge">ACTIVE</span>';
          } else if (starRating > 0 || lvl < this.highestUnlockedLevel) {
            badgeHtml = '<span class="card-status-badge cleared-badge">CLEAR</span>';
          }

          const star1 = starRating >= 1 ? 'earned' : '';
          const star2 = starRating >= 2 ? 'earned' : '';
          const star3 = starRating >= 3 ? 'earned' : '';

          card.innerHTML = `
            <div class="card-header-row">
              <span class="card-level-num">LVL ${lvl}</span>
              ${badgeHtml}
            </div>
            <div class="card-mid-zone">
              <div class="card-stars-row" aria-label="${starRating} out of 3 stars">
                <span class="card-star ${star1}">★</span>
                <span class="card-star ${star2}">★</span>
                <span class="card-star ${star3}">★</span>
              </div>
            </div>
            <div class="card-footer-row">
              <span class="card-target-text">${targetAlt} ALT</span>
            </div>
          `;

          bindButtonAction(card, () => {
            this.selectedLevel = lvl;
            this.startNewGame(lvl);
          });

          card.addEventListener('keydown', (e) => {
            if (e.code === 'Enter' || e.code === 'Space') {
              e.preventDefault();
              this.selectedLevel = lvl;
              this.startNewGame(lvl);
            }
          });
        } else {
          card.setAttribute('aria-disabled', 'true');
          card.setAttribute('aria-label', `Level ${lvl}, Locked. Reach Level ${lvl} to unlock.`);

          card.innerHTML = `
            <div class="card-header-row">
              <span class="card-level-num">LVL ${lvl}</span>
            </div>
            <div class="card-mid-zone">
              <div class="card-lock-center">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
                <span class="card-lock-text">LOCKED</span>
              </div>
            </div>
            <div class="card-footer-row">
              <span class="card-target-text">REACH LVL ${lvl}</span>
            </div>
          `;

          card.addEventListener('click', (e) => {
            if (e && e.preventDefault) e.preventDefault();
            card.classList.remove('locked-shake');
            void card.offsetWidth;
            card.classList.add('locked-shake');
          });
        }

        this.levelCardsGrid.appendChild(card);
      }

      // Render the futuristic dimensional portal to next world
      const nextWorld = this.currentWorld + 1;
      const portalUnlocked = this.isPortalUnlocked(this.currentWorld);
      const nextWorldStart = this.getWorldStartLevel(nextWorld);
      const nextWorldEnd = this.getWorldEndLevel(nextWorld);

      const portalCard = document.createElement('div');
      portalCard.className = `world-portal-card ${portalUnlocked ? 'unlocked' : 'locked'}`;
      portalCard.setAttribute('role', 'button');
      portalCard.setAttribute('data-target-world', String(nextWorld));

      if (portalUnlocked) {
        portalCard.setAttribute('tabindex', '0');
        portalCard.setAttribute('aria-label', `Dimensional Portal to World ${nextWorld}. Gateway unlocked. Warp to Levels ${nextWorldStart} through ${nextWorldEnd}.`);

        portalCard.innerHTML = `
          <div class="portal-vortex-aura"></div>
          <div class="portal-left-group">
            <div class="portal-icon-wrapper">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="6 3"/>
                <circle cx="12" cy="12" r="4" fill="currentColor"/>
              </svg>
            </div>
            <div class="portal-text-group">
              <span class="portal-kicker">DIMENSIONAL GATEWAY</span>
              <span class="portal-title">WORLD ${nextWorld}</span>
              <span class="portal-subtext">LEVELS ${nextWorldStart}–${nextWorldEnd}</span>
            </div>
          </div>
          <div class="portal-action-badge">WARP &rarr;</div>
        `;

        bindButtonAction(portalCard, () => {
          this.goToNextWorld();
        });

        portalCard.addEventListener('keydown', (e) => {
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            this.goToNextWorld();
          }
        });
      } else {
        portalCard.setAttribute('aria-disabled', 'true');
        portalCard.setAttribute('aria-label', `Dimensional Portal to World ${nextWorld}. Locked. Reach Level ${endLvl} to unlock.`);

        portalCard.innerHTML = `
          <div class="portal-left-group">
            <div class="portal-icon-wrapper">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            </div>
            <div class="portal-text-group">
              <span class="portal-kicker">SEALED GATEWAY</span>
              <span class="portal-title">WORLD ${nextWorld}</span>
              <span class="portal-subtext">REACH LEVEL ${endLvl} TO UNLOCK</span>
            </div>
          </div>
          <div class="portal-action-badge">LOCKED</div>
        `;

        portalCard.addEventListener('click', (e) => {
          if (e && e.preventDefault) e.preventDefault();
          portalCard.classList.remove('locked-shake');
          void portalCard.offsetWidth;
          portalCard.classList.add('locked-shake');
        });
      }

      this.levelCardsGrid.appendChild(portalCard);
    }

    startNewGame(levelToStart = null) {
      this.sound.init();

      // Determine starting level
      let targetLevel = 1;
      if (typeof levelToStart === 'number' && Number.isFinite(levelToStart) && levelToStart >= 1) {
        targetLevel = Math.floor(levelToStart);
      } else if (this.selectedLevel) {
        targetLevel = this.selectedLevel;
      } else if (this.lastPlayedLevel) {
        targetLevel = this.lastPlayedLevel;
      }

      // Ensure last-played and starting level can never exceed highest unlocked level
      const validatedLevel = Math.min(Math.max(1, targetLevel), this.highestUnlockedLevel);

      this.level = validatedLevel;
      this.selectedLevel = validatedLevel;
      this.lastPlayedLevel = validatedLevel;
      this.saveLastPlayedLevel(validatedLevel);

      // Base altitude for selected level
      this.startAltitude = (validatedLevel === 1) ? 0 : getLevelMilestone(validatedLevel - 1);
      this.score = this.startAltitude;
      this.maxAltitude = this.startAltitude;
      this.cameraY = 0;
      this.isNewRecord = false;
      this.runOrbs = 0;
      this.runStars = 0;
      this.collectibles = [];
      this.specialStars = [];
      this.lastStarGeneratedY = 600;
      this.runResultsProcessed = false;
      if (this.newBestTag) this.newBestTag.classList.add('hidden');
      if (this.levelBanner) this.levelBanner.classList.add('hidden');

      // Reset Ball
      this.ball.reset(240, 580);
      this.ball.vy = BOUNCE_VELOCITY * 0.7; // Initial small drop from safe base
      this.ball.hasAirJump = false;
      this.ball.invulnerable = false;
      this.particles.reset();

      // Reset Lives, Currency & Respawn States for New Run
      this.lives = CURRENCY_CONFIG.initialLives;
      this.runBlues = 0;
      this.isRespawning = false;
      this.countdownTimer = 0;
      this.invulnerableTimer = 0;
      if (this.respawnCountdownOverlay) {
        this.respawnCountdownOverlay.classList.add('hidden');
      }

      // Reset Initial Platforms:
      // Generous stationary base at y=620 ensures safe spawn landing on all levels
      this.platforms = [
        new Platform(100, 620, 280, 18, 0, 0, CANVAS_WIDTH, null),
        new Platform(80, 440, 140, 16, -75, 30, 310, null),
        new Platform(230, 260, 140, 16, 0, 0, CANVAS_WIDTH, null),
      ];
      this.highestGeneratedY = 260;
      this.lastSafePlatform = this.platforms[0];

      // Spawn starter energy orbs on intro tiers (safe, reachable)
      this.collectibles.push(new CollectibleOrb(150, 395));
      this.collectibles.push(new CollectibleOrb(300, 215));

      // Reset theme instantly to selected level
      this.themeManager.setLevel(this.level, true);
      this.applyThemeToHUD();

      // Generate initial buffer of platforms above Tier 2 matching level difficulty
      this.generatePlatformsAhead();

      this.updateScoreDisplays();
      this.setGameState(STATE.PLAYING);
    }

    togglePause() {
      if (this.currentState === STATE.PLAYING) {
        this.setGameState(STATE.PAUSED);
        this.resetHeldKeys();
      } else if (this.currentState === STATE.PAUSED) {
        this.setGameState(STATE.PLAYING);
      }
    }

    triggerGameOver(reason = 'The orb fell into the void') {
      // Prevent duplicate processing if triggered multiple times
      if (this.currentState === STATE.GAMEOVER || this.runResultsProcessed) return;
      this.runResultsProcessed = true;

      this.setGameState(STATE.GAMEOVER);
      this.resetHeldKeys();

      // Check for new best record
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        this.saveBestScore(this.bestScore);
        this.isNewRecord = true;
        this.newBestTag.classList.remove('hidden');
      } else {
        this.newBestTag.classList.add('hidden');
      }

      // Check highest level reached
      if (this.level > this.highestUnlockedLevel) {
        this.saveHighestUnlockedLevel(this.level);
      }

      // 1. Calculate Three-Star Performance Rating for this run
      const rating = this.calculatePerformanceRating(this.score, this.runOrbs, this.runStars);

      // 2. Add run collectibles to persistent lifetime totals EXACTLY ONCE
      this.totalOrbs += this.runOrbs;
      this.totalStars += this.runStars;
      this.saveTotalOrbs(this.totalOrbs);
      this.saveTotalStars(this.totalStars);

      // 3. Update level milestone achievement ratings (persist best star rating per level completed)
      for (let lvl = 1; lvl <= this.level; lvl++) {
        const prevRating = this.levelBestRatings[lvl] || 0;
        if (rating > prevRating) {
          this.levelBestRatings[lvl] = rating;
        }
      }
      this.saveLevelRatings(this.levelBestRatings);

      // 4. Update Three-Star Performance Board in Results UI
      const starIcons = [this.starIcon1, this.starIcon2, this.starIcon3];
      starIcons.forEach((starElem, idx) => {
        if (!starElem) return;
        if (idx < rating) {
          starElem.classList.add('earned');
        } else {
          starElem.classList.remove('earned');
        }
      });

      if (this.ratingVerdictText) {
        this.ratingVerdictText.classList.toggle('has-stars', rating > 0);
        if (rating === 3) {
          this.ratingVerdictText.textContent = '3 STARS EARNED! PERFECT CLIMB';
        } else if (rating === 2) {
          this.ratingVerdictText.textContent = '2 STARS EARNED';
        } else if (rating === 1) {
          this.ratingVerdictText.textContent = '1 STAR EARNED';
        } else {
          this.ratingVerdictText.textContent = 'NO STARS EARNED';
        }
      }

      // 5. Update Results Screen Detailed Stats Grid
      if (this.finalScore) this.finalScore.textContent = this.score;
      if (this.finalBestScore) this.finalBestScore.textContent = this.bestScore;
      if (this.finalLevelReached) this.finalLevelReached.textContent = this.level;
      if (this.finalHighestLevel) this.finalHighestLevel.textContent = this.highestLevelCompleted;
      if (this.finalRunOrbs) this.finalRunOrbs.textContent = this.runOrbs;
      if (this.finalRunStars) this.finalRunStars.textContent = this.runStars;
      if (this.finalTotalOrbs) this.finalTotalOrbs.textContent = this.totalOrbs;
      if (this.finalTotalStars) this.finalTotalStars.textContent = this.totalStars;
      if (this.finalRunBlues) this.finalRunBlues.textContent = `+${this.runBlues || 0}`;
      if (this.finalTotalBlues) this.finalTotalBlues.textContent = this.blues;
      if (this.finalTotalKeys) this.finalTotalKeys.textContent = this.keysInventory;
      if (this.gameOverSubtext) this.gameOverSubtext.textContent = reason;

      // Play results screen audio fanfare reflecting rating
      this.sound.playResultsScreen(rating);

      this.updateScoreDisplays();
    }

    updateScoreDisplays() {
      this.hudScore.textContent = this.score;
      this.hudBest.textContent = this.bestScore;
      if (this.hudRunOrbs) this.hudRunOrbs.textContent = this.runOrbs;
      if (this.hudRunStars) this.hudRunStars.textContent = this.runStars;
      if (this.menuBestScore) this.menuBestScore.textContent = this.bestScore;
      if (this.menuHighestLevel) this.menuHighestLevel.textContent = this.highestLevelCompleted;
      if (this.menuTotalOrbs) this.menuTotalOrbs.textContent = this.totalOrbs;
      if (this.menuTotalStars) this.menuTotalStars.textContent = this.totalStars;
      if (this.hudLevelText) this.hudLevelText.textContent = `LVL ${this.level}`;
      this.updateLivesDisplay();
      this.updateCurrencyDisplays();
      this.applyThemeToHUD();
    }

    applyThemeToHUD() {
      const theme = this.themeManager.getColors();
      if (this.hudLevelText) {
        this.hudLevelText.style.color = theme.primary;
        this.hudLevelText.style.textShadow = `0 0 10px ${theme.primaryAlpha(0.85)}`;
      }
      if (this.hudLevelProgress) {
        this.hudLevelProgress.style.background = `linear-gradient(90deg, ${theme.secondary}, ${theme.primary})`;
        this.hudLevelProgress.style.boxShadow = `0 0 10px ${theme.primaryAlpha(0.85)}`;
      }
      const track = this.hudLevelProgress ? this.hudLevelProgress.parentElement : null;
      if (track) {
        track.style.borderColor = theme.primaryAlpha(0.45);
      }
      if (this.gameHud) {
        this.gameHud.style.borderColor = theme.primaryAlpha(0.38);
        this.gameHud.style.boxShadow = `0 4px 18px rgba(0, 0, 0, 0.5), 0 0 14px ${theme.primaryAlpha(0.22)}`;
      }
      if (this.hudScore) {
        this.hudScore.style.color = theme.primary;
        this.hudScore.style.textShadow = `0 0 10px ${theme.primaryAlpha(0.65)}`;
      }
    }

    resetHeldKeys() {
      this.keys.left = false;
      this.keys.right = false;
      this.keys.down = false;
      if (this.heldPointers) {
        this.heldPointers.left.clear();
        this.heldPointers.right.clear();
        this.heldPointers.down.clear();
        this.heldPointers.jump.clear();
      }
      const touchBtns = [this.touchLeft, this.touchRight, this.touchDown, this.touchUp];
      for (let i = 0; i < touchBtns.length; i++) {
        const btn = touchBtns[i];
        if (btn) {
          btn.classList.remove('touch-active');
          if (btn.hasPointerCapture && btn.releasePointerCapture) {
            try {
              // Safety cleanup
            } catch (e) {}
          }
        }
      }
    }

    // Single edge-triggered air jump action (1 per airborne period)
    handleAirJump() {
      if (this.currentState !== STATE.PLAYING) return;
      if (this.ball.hasAirJump) {
        this.ball.applyAirJump();
        this.particles.spawnAirJumpRing(this.ball.x, this.ball.y);
        this.sound.playAirJump();
      }
    }

    // --- Procedural Generation & Recycling ---
    generatePlatformsAhead() {
      // Keep platforms generated at least 650px above camera viewport
      let generateLimit = 0;
      while (this.highestGeneratedY > this.cameraY - 650 && generateLimit < 50) {
        generateLimit++;
        // Consistent, bounded vertical gap (124px to 152px)
        const spacing = 124 + Math.random() * 28;
        const newY = this.highestGeneratedY - spacing;
        this.highestGeneratedY = newY;

        // Current altitude in world space for progressive difficulty
        const altitude = (this.startAltitude || 0) + Math.max(0, (BASE_ALTITUDE_Y - newY) / 2);

        // Platform width
        let width = 140;
        if (altitude < 500) {
          width = 140 + Math.random() * 25; // 140 - 165px
        } else if (altitude < 1200) {
          width = 130 + Math.random() * 25; // 130 - 155px
        } else if (altitude < 2100) {
          width = 125 + Math.random() * 20; // 125 - 145px
        } else {
          width = 118 + Math.random() * 22; // 118 - 140px
        }

        // Horizontal position within playable bounds
        const minX = 25;
        const maxX = CANVAS_WIDTH - width - 25;
        const x = minX + Math.random() * (maxX - minX);

        // Moving platform probability & speed:
        // Preserves intentional mixture of stationary & moving platforms
        let vx = 0;
        let platMinX = 0;
        let platMaxX = CANVAS_WIDTH;

        const moveChance = altitude < 500 ? 0.35 : (altitude < 1200 ? 0.42 : 0.48);
        if (Math.random() < moveChance) {
          const speed = (altitude < 500 ? 45 : 55) + Math.random() * 30;
          vx = (Math.random() > 0.5 ? 1 : -1) * speed;
          const patrolRange = 40 + Math.random() * 50;
          platMinX = Math.max(20, x - patrolRange);
          platMaxX = Math.min(CANVAS_WIDTH - width - 20, x + patrolRange);
        }

        // Spike Hazard placement:
        // - Level 1 (altitude < 500): ZERO hazards for introductory climb
        // - Level 2 (500 <= altitude < 1200): 18% chance, width 28px, stationary platforms only
        // - Level 3 (1200 <= altitude < 2100): 24% chance, width 30px
        // - Level 4 (2100 <= altitude < 3200): 28% chance, width 32px
        // - Level 5+ (altitude >= 3200): 32% chance (capped to maintain fairness)
        let spike = null;
        if (altitude >= 500) {
          let spikeChance = 0;
          let spikeWidth = 28;

          if (altitude < 1200) {
            spikeChance = 0.18;
            spikeWidth = 28;
          } else if (altitude < 2100) {
            spikeChance = 0.24;
            spikeWidth = 30;
          } else if (altitude < 3200) {
            spikeChance = 0.28;
            spikeWidth = 32;
          } else {
            spikeChance = 0.32;
            spikeWidth = 32;
          }

          // Ensure fair play:
          // In Level 2, only place spikes on stationary platforms to ease players in
          // Platform must be at least 115px wide so safe landing zone is generous (>= 85px)
          const allowSpike = (width >= 115) && (vx === 0 || altitude >= 1200);
          if (allowSpike && Math.random() < spikeChance) {
            const side = Math.random() > 0.5 ? 'left' : 'right';
            spike = {
              width: spikeWidth,
              height: 13,
              side: side,
            };
          }
        }

        this.platforms.push(
          new Platform(x, newY, width, 16, vx, platMinX, platMaxX, spike)
        );

        // --- Collectible Energy Orbs Procedural Spawning ---
        // 1. Orbs placed safely near/above platforms (65% chance)
        if (Math.random() < 0.65) {
          let orbX = x + width * 0.5;
          if (spike) {
            // Position orb strictly over the safe non-hazardous side
            if (spike.side === 'left') {
              const safeLeft = x + spike.width + 10;
              const safeRight = x + width - 10;
              orbX = (safeLeft + safeRight) * 0.5;
            } else {
              const safeLeft = x + 10;
              const safeRight = x + width - spike.width - 10;
              orbX = (safeLeft + safeRight) * 0.5;
            }
          } else if (width > 130) {
            // Slight dynamic variation on wider platforms
            orbX = x + 25 + Math.random() * (width - 50);
          }
          this.collectibles.push(new CollectibleOrb(orbX, newY - 32));
        }

        // 2. Aerial gap orbs between platforms (skill / risk path, 25% chance)
        if (Math.random() < 0.25) {
          const gapX = 45 + Math.random() * (CANVAS_WIDTH - 90);
          const gapY = newY + spacing * 0.5;
          this.collectibles.push(new CollectibleOrb(gapX, gapY));
        }

        // --- Special Star Collectibles Spawning (Rare & Prestigious) ---
        // Minimum altitude distance between star spawns (>= 720px)
        const starDist = this.lastStarGeneratedY - newY;
        if (starDist >= 720) {
          const shouldSpawnStar = (starDist >= 950) || (Math.random() < 0.7);
          if (shouldSpawnStar) {
            let starX = x + width * 0.5;
            let starY = newY - 48;

            if (spike) {
              if (spike.side === 'left') {
                starX = x + spike.width + 14 + (width - spike.width - 28) * 0.5;
              } else {
                starX = x + 14 + (width - spike.width - 28) * 0.5;
              }
            }

            // Keep within playable horizontal viewport bounds
            starX = Math.max(35, Math.min(CANVAS_WIDTH - 35, starX));
            this.specialStars.push(new CollectibleStar(starX, starY));
            this.lastStarGeneratedY = newY;
          }
        }
      }

      // Memory cleanup: Recycle/remove platforms & collectibles far below camera view (preserving last safe platform)
      const removeThresholdY = this.cameraY + (this.canvasHeight || CANVAS_HEIGHT) + 240;
      this.platforms = this.platforms.filter(p => p.y <= removeThresholdY || p === this.lastSafePlatform);
      this.collectibles = this.collectibles.filter(o => o.y <= removeThresholdY && !o.collected);
      this.specialStars = this.specialStars.filter(s => s.y <= removeThresholdY && !s.collected);
    }

    // --- Event Listeners ---
    setupEventListeners() {
      // Keyboard Down
      window.addEventListener('keydown', (e) => {
        // Prevent default scrolling on game navigation keys
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
          e.preventDefault();
        }

        // Toggle sound key
        if (e.code === 'KeyM') {
          this.toggleSound();
          return;
        }

        // Ignore auto-repeated events from held keys
        if (e.repeat) return;

        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this.keys.left = true;
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this.keys.right = true;
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          this.keys.down = true;
        } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          // Edge-triggered: exactly one action per key press
          this.handleAirJump();
        } else if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.currentState === STATE.SHOP) {
            this.closeShop();
          } else if (this.currentState === STATE.CONTINUE) {
            this.skipContinue();
          } else if (this.currentState === STATE.LEVEL_SELECT) {
            this.setGameState(STATE.MENU);
          } else if (this.currentState === STATE.PLAYING || this.currentState === STATE.PAUSED) {
            this.togglePause();
          }
        } else if (e.code === 'Enter' || e.code === 'Space') {
          if (this.currentState === STATE.CONTINUE) {
            if (this.keysInventory > 0) {
              this.continueWithKey();
            } else {
              this.skipContinue();
            }
          } else if (this.currentState === STATE.MENU) {
            this.startNewGame(this.lastPlayedLevel);
          } else if (this.currentState === STATE.LEVEL_SELECT) {
            this.startNewGame(this.lastPlayedLevel);
          } else if (this.currentState === STATE.GAMEOVER) {
            this.startNewGame(this.selectedLevel || this.lastPlayedLevel);
          } else if (this.currentState === STATE.PAUSED) {
            this.togglePause();
          }
        }
      });

      // Keyboard Up
      window.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this.keys.left = false;
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this.keys.right = false;
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          this.keys.down = false;
        }
      });

      // Reset held keys on window blur or tab visibility change
      window.addEventListener('blur', () => this.resetHeldKeys());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.resetHeldKeys();
          if (this.currentState === STATE.PLAYING) {
            this.togglePause();
          }
          if (this.sound) {
            this.sound.suspend();
          }
        } else {
          if (this.sound && this.sound.enabled) {
            this.sound.resume();
          }
        }
      });

      // UI Buttons (using bindButtonAction for fast mobile touchend + desktop click)
      bindButtonAction(this.playBtn, () => this.startNewGame(this.lastPlayedLevel));
      bindButtonAction(this.resumeBtn, () => this.togglePause());
      bindButtonAction(this.restartBtn, () => this.startNewGame(this.selectedLevel || this.lastPlayedLevel));
      bindButtonAction(this.restartFromPauseBtn, () => this.startNewGame(this.selectedLevel || this.lastPlayedLevel));
      bindButtonAction(this.pauseBtn, () => this.togglePause());
      if (this.soundBtn) {
        bindButtonAction(this.soundBtn, () => this.toggleSound());
      }
      if (this.menuReturnBtn) {
        bindButtonAction(this.menuReturnBtn, () => {
          this.setGameState(STATE.MENU);
          this.updateScoreDisplays();
        });
      }

      // Level Selection Screen buttons
      if (this.levelsBtn) {
        bindButtonAction(this.levelsBtn, () => {
          this.openLevelSelect();
        });
      }
      if (this.continueLevelBtn) {
        bindButtonAction(this.continueLevelBtn, () => {
          this.startNewGame(this.lastPlayedLevel);
        });
      }
      if (this.levelSelectBackBtn) {
        bindButtonAction(this.levelSelectBackBtn, () => {
          this.setGameState(STATE.MENU);
          this.updateScoreDisplays();
        });
      }
      if (this.resultsLevelsBtn) {
        bindButtonAction(this.resultsLevelsBtn, () => {
          this.openLevelSelect();
        });
      }
      if (this.pauseLevelsBtn) {
        bindButtonAction(this.pauseLevelsBtn, () => {
          this.openLevelSelect();
        });
      }
      if (this.prevWorldBtn) {
        bindButtonAction(this.prevWorldBtn, () => {
          this.goToPrevWorld();
        });
      }
      if (this.nextWorldBtn) {
        bindButtonAction(this.nextWorldBtn, () => {
          this.goToNextWorld();
        });
      }

      // Continue Screen Action Buttons
      if (this.continueWithKeyBtn) {
        bindButtonAction(this.continueWithKeyBtn, () => this.continueWithKey());
      }
      if (this.continueOpenShopBtn) {
        bindButtonAction(this.continueOpenShopBtn, () => this.openShop(STATE.CONTINUE));
      }
      if (this.continueSkipBtn) {
        bindButtonAction(this.continueSkipBtn, () => this.skipContinue());
      }

      // Shop / Key Vault Action Buttons
      if (this.menuShopBtn) {
        bindButtonAction(this.menuShopBtn, () => this.openShop(STATE.MENU));
      }
      if (this.menuShopActionBtn) {
        bindButtonAction(this.menuShopActionBtn, () => this.openShop(STATE.MENU));
      }
      if (this.pauseShopBtn) {
        bindButtonAction(this.pauseShopBtn, () => this.openShop(STATE.PAUSED));
      }
      if (this.resultsShopBtn) {
        bindButtonAction(this.resultsShopBtn, () => this.openShop(STATE.GAMEOVER));
      }
      if (this.shopCloseBtn) {
        bindButtonAction(this.shopCloseBtn, () => this.closeShop());
      }

      // Key Bundle Purchase Buttons
      if (this.buyBundleBtn1) {
        bindButtonAction(this.buyBundleBtn1, () => this.buyKeyBundle(1, 100));
      }
      if (this.buyBundleBtn3) {
        bindButtonAction(this.buyBundleBtn3, () => this.buyKeyBundle(3, 270));
      }
      if (this.buyBundleBtn5) {
        bindButtonAction(this.buyBundleBtn5, () => this.buyKeyBundle(5, 425));
      }

      // Responsive Viewport Resize & Orientation Change
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', () => {
          this.updateCanvasDimensions();
          if (this.currentState === STATE.PLAYING && this.ball) {
            const minTopOffset = Math.round(this.canvasHeight * 0.34);
            if (this.ball.y - this.cameraY < minTopOffset) {
              this.cameraY = this.ball.y - minTopOffset;
            }
          }
        });

        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', () => {
            this.updateCanvasDimensions();
          });
        }

        window.addEventListener('orientationchange', () => {
          setTimeout(() => {
            this.updateCanvasDimensions();
          }, 60);
        });
      }
    }

    // --- Mobile Floating Controls (Reliable Multi-Touch Pointer Events) ---
    setupMobileControls() {
      if (!this.heldPointers) {
        this.heldPointers = {
          left: new Set(),
          right: new Set(),
          down: new Set(),
          jump: new Set(),
        };
      }

      const bindSteeringButton = (btn, keyName) => {
        if (!btn) return;
        const pointerSet = this.heldPointers[keyName];

        const onDown = (e) => {
          if (e && e.cancelable) e.preventDefault();
          this.sound.init();
          if (this.currentState !== STATE.PLAYING) return;

          const pId = (e && e.pointerId !== undefined) ? e.pointerId : (e && e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].identifier : 0);
          pointerSet.add(pId);
          this.keys[keyName] = true;
          btn.classList.add('touch-active');

          if (btn.setPointerCapture && e && e.pointerId !== undefined) {
            try {
              btn.setPointerCapture(e.pointerId);
            } catch (err) {}
          }
        };

        const onUp = (e) => {
          if (e && e.cancelable) e.preventDefault();
          const pId = (e && e.pointerId !== undefined) ? e.pointerId : (e && e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].identifier : 0);
          pointerSet.delete(pId);

          if (pointerSet.size === 0) {
            this.keys[keyName] = false;
            btn.classList.remove('touch-active');
          }

          if (btn.hasPointerCapture && btn.releasePointerCapture && e && e.pointerId !== undefined) {
            try {
              if (btn.hasPointerCapture(e.pointerId)) {
                btn.releasePointerCapture(e.pointerId);
              }
            } catch (err) {}
          }
        };

        const onCancel = (e) => {
          onUp(e);
        };

        // Pointer Events
        btn.addEventListener('pointerdown', onDown, { passive: false });
        btn.addEventListener('pointerup', onUp, { passive: false });
        btn.addEventListener('pointercancel', onCancel, { passive: false });
        btn.addEventListener('lostpointercapture', onCancel, { passive: false });

        // Touch event fallback
        btn.addEventListener('touchstart', onDown, { passive: false });
        btn.addEventListener('touchend', onUp, { passive: false });
        btn.addEventListener('touchcancel', onCancel, { passive: false });
      };

      const bindJumpButton = (btn) => {
        if (!btn) return;
        const pointerSet = this.heldPointers.jump;

        const onDown = (e) => {
          if (e && e.cancelable) e.preventDefault();
          this.sound.init();
          if (this.currentState !== STATE.PLAYING) return;

          const pId = (e && e.pointerId !== undefined) ? e.pointerId : (e && e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].identifier : 0);
          const wasEmpty = pointerSet.size === 0;
          pointerSet.add(pId);

          // Edge-triggered: exactly one action per physical button press
          if (wasEmpty) {
            this.handleAirJump();
          }
          btn.classList.add('touch-active');

          if (btn.setPointerCapture && e && e.pointerId !== undefined) {
            try {
              btn.setPointerCapture(e.pointerId);
            } catch (err) {}
          }
        };

        const onUp = (e) => {
          if (e && e.cancelable) e.preventDefault();
          const pId = (e && e.pointerId !== undefined) ? e.pointerId : (e && e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].identifier : 0);
          pointerSet.delete(pId);

          if (pointerSet.size === 0) {
            btn.classList.remove('touch-active');
          }

          if (btn.hasPointerCapture && btn.releasePointerCapture && e && e.pointerId !== undefined) {
            try {
              if (btn.hasPointerCapture(e.pointerId)) {
                btn.releasePointerCapture(e.pointerId);
              }
            } catch (err) {}
          }
        };

        const onCancel = (e) => {
          onUp(e);
        };

        // Pointer Events
        btn.addEventListener('pointerdown', onDown, { passive: false });
        btn.addEventListener('pointerup', onUp, { passive: false });
        btn.addEventListener('pointercancel', onCancel, { passive: false });
        btn.addEventListener('lostpointercapture', onCancel, { passive: false });

        // Touch event fallback
        btn.addEventListener('touchstart', onDown, { passive: false });
        btn.addEventListener('touchend', onUp, { passive: false });
        btn.addEventListener('touchcancel', onCancel, { passive: false });
      };

      bindSteeringButton(this.touchLeft, 'left');
      bindSteeringButton(this.touchRight, 'right');
      bindSteeringButton(this.touchDown, 'down');
      bindJumpButton(this.touchUp);
    }

    // --- Physics Sub-Step (Anti-tunneling & Deterministic Motion) ---
    physicsSubStep(subDt) {
      // 1. Update platform positions
      for (let i = 0; i < this.platforms.length; i++) {
        this.platforms[i].update(subDt);
      }

      // Record previous ball position
      this.ball.prevX = this.ball.x;
      this.ball.prevY = this.ball.y;

      // 2. Horizontal ball steering
      let steerX = 0;
      if (this.keys.left && !this.keys.right) steerX = -1;
      else if (this.keys.right && !this.keys.left) steerX = 1;

      if (steerX !== 0) {
        // Active counter-steering / reversal uses boosted braking acceleration for crisp turnaround
        const isReversing = (this.ball.vx !== 0 && Math.sign(this.ball.vx) !== steerX);
        const currentAccel = isReversing ? MOVE_BRAKE_ACCEL_X : MOVE_ACCEL_X;
        this.ball.vx += steerX * currentAccel * subDt;
        if (Math.abs(this.ball.vx) > MAX_SPEED_X) {
          this.ball.vx = Math.sign(this.ball.vx) * MAX_SPEED_X;
        }
      } else {
        if (this.ball.vx > 0) {
          this.ball.vx = Math.max(0, this.ball.vx - MOVE_DECEL_X * subDt);
        } else if (this.ball.vx < 0) {
          this.ball.vx = Math.min(0, this.ball.vx + MOVE_DECEL_X * subDt);
        }
      }

      // 3. Vertical motion (Gravity + optional Down/S dive)
      this.ball.vy += GRAVITY * subDt;
      if (this.keys.down) {
        this.ball.vy += STEER_ACCEL_DOWN * subDt;
      }
      if (this.ball.vy > MAX_FALL_SPEED) {
        this.ball.vy = MAX_FALL_SPEED;
      }

      // Update ball positions
      this.ball.x += this.ball.vx * subDt;
      this.ball.y += this.ball.vy * subDt;

      // 4. Boundary Checks (Playable Left & Right Walls)
      if (this.ball.x - this.ball.radius < 0) {
        this.ball.x = this.ball.radius;
        this.ball.vx = Math.abs(this.ball.vx) * 0.55;
        this.particles.spawnWallSparks(0, this.ball.y, true);
        this.sound.playWallBounce();
      } else if (this.ball.x + this.ball.radius > CANVAS_WIDTH) {
        this.ball.x = CANVAS_WIDTH - this.ball.radius;
        this.ball.vx = -Math.abs(this.ball.vx) * 0.55;
        this.particles.spawnWallSparks(CANVAS_WIDTH, this.ball.y, false);
        this.sound.playWallBounce();
      }

      // 5. Spike Hazard Collision Detection
      for (let i = 0; i < this.platforms.length; i++) {
        const p = this.platforms[i];
        if (!p.spike) continue;

        // Spike bounding box
        const sLeft = (p.spike.side === 'left') ? p.x + 4 : p.x + p.width - p.spike.width - 4;
        const sRight = sLeft + p.spike.width;
        const sTop = p.y - p.spike.height;
        const sBottom = p.y;

        // Circle - Rect collision check
        const closestX = Math.max(sLeft, Math.min(this.ball.x, sRight));
        const closestY = Math.max(sTop, Math.min(this.ball.y, sBottom));
        const dx = this.ball.x - closestX;
        const dy = this.ball.y - closestY;
        const hitDistSq = (this.ball.radius * 0.85) * (this.ball.radius * 0.85);

        if (dx * dx + dy * dy < hitDistSq) {
          if (this.invulnerableTimer > 0) continue;
          this.sound.playHazard();
          this.particles.spawnHazardSparks(this.ball.x, this.ball.y);
          this.handlePlayerFall();
          return;
        }
      }

      // 5b. Energy Orb Collectibles Collision Check
      for (let i = this.collectibles.length - 1; i >= 0; i--) {
        const orb = this.collectibles[i];
        if (orb.collected) continue;
        const orbY = orb.getVisualY();
        const dx = this.ball.x - orb.x;
        const dy = this.ball.y - orbY;
        const hitDist = this.ball.radius + orb.radius + 4;
        if (dx * dx + dy * dy <= hitDist * hitDist) {
          orb.collected = true;
          this.runOrbs++;
          this.addBlues(CURRENCY_CONFIG.bluesPerOrb, true);
          this.sound.playOrbCollect();
          this.particles.spawnOrbCollectSparks(orb.x, orbY);
          this.collectibles.splice(i, 1);
        }
      }

      // 5c. Special Star Collectibles Collision Check
      for (let i = this.specialStars.length - 1; i >= 0; i--) {
        const star = this.specialStars[i];
        if (star.collected) continue;
        const starY = star.getVisualY();
        const dx = this.ball.x - star.x;
        const dy = this.ball.y - starY;
        const hitDist = this.ball.radius + star.radius + 5;
        if (dx * dx + dy * dy <= hitDist * hitDist) {
          star.collected = true;
          this.runStars++;
          this.addBlues(CURRENCY_CONFIG.bluesPerStar, true);
          this.sound.playStarCollect();
          this.particles.spawnStarCollectBurst(star.x, starY);
          this.specialStars.splice(i, 1);
        }
      }

      // 6. Consistent 2-Way Platform Collision Handling
      for (let i = 0; i < this.platforms.length; i++) {
        const p = this.platforms[i];

        // Safe landing zone calculation (excludes spike portion if present)
        let safeLeft = p.x;
        let safeRight = p.x + p.width;
        if (p.spike) {
          if (p.spike.side === 'left') {
            safeLeft = p.x + p.spike.width + 2;
          } else {
            safeRight = p.x + p.width - p.spike.width - 2;
          }
        }

        // Horizontal overlap calculation (including swept range of platform & ball)
        const ballLeft = this.ball.x - this.ball.radius * 0.72;
        const ballRight = this.ball.x + this.ball.radius * 0.72;
        const prevBallLeft = this.ball.prevX - this.ball.radius * 0.72;
        const prevBallRight = this.ball.prevX + this.ball.radius * 0.72;

        const pPlatLeft = Math.min(safeLeft, safeLeft + (p.x - p.prevX));
        const pPlatRight = Math.max(safeRight, safeRight + (p.x - p.prevX));

        const isSafeHOverlap = (ballRight >= pPlatLeft && ballLeft <= pPlatRight) ||
                               (prevBallRight >= pPlatLeft && prevBallLeft <= pPlatRight);

        // Entire platform horizontal overlap (used for underside collision)
        const fullPlatLeft = Math.min(p.x, p.prevX);
        const fullPlatRight = Math.max(p.x + p.width, p.prevX + p.width);
        const isFullHOverlap = (ballRight >= fullPlatLeft && ballLeft <= fullPlatRight) ||
                               (prevBallRight >= fullPlatLeft && prevBallLeft <= fullPlatRight);

        const platTop = p.y;
        const platBottom = p.y + p.height;

        // --- DIRECTION A: Descending (vy >= 0) -> Land on top surface ---
        if (this.ball.vy >= 0 && isSafeHOverlap) {
          const ballBottom = this.ball.y + this.ball.radius;
          const prevBottom = this.ball.prevY + this.ball.radius;

          // Ball crossed top surface from above
          if (prevBottom <= platTop + 10 && ballBottom >= platTop && this.ball.prevY <= platBottom) {
            // Place ball exactly on the platform
            this.ball.y = platTop - this.ball.radius;
            // Maintain relative horizontal alignment with moving platform
            this.ball.x += (p.x - p.prevX);

            // Record as last safe platform reached
            this.lastSafePlatform = p;

            // Trigger automatic upward bounce and reset air jump!
            this.ball.triggerBounce();
            p.triggerImpact();
            this.particles.spawnBounceSparks(this.ball.x, platTop, this.themeManager.getColors());
            this.sound.playBounce();
            break;
          }
        }
        // --- DIRECTION B: Ascending (vy < 0) -> Hit underside of platform ---
        else if (this.ball.vy < 0 && isFullHOverlap) {
          const ballTop = this.ball.y - this.ball.radius;
          const prevTop = this.ball.prevY - this.ball.radius;

          // Ball hit underside from below
          if (prevTop >= platBottom - 10 && ballTop <= platBottom && this.ball.prevY >= platTop) {
            // Stop ball at underside surface
            this.ball.y = platBottom + this.ball.radius;
            // Cancel upward velocity and rebound gently downward (no landing bounce)
            this.ball.vy = Math.max(60, -this.ball.vy * 0.2);

            p.triggerImpact();
            this.particles.spawnHeadBumpSparks(this.ball.x, platBottom);
            this.sound.playHeadBump();
            break;
          }
        }
      }
    }

    // --- Physics & Update ---
    update(dt) {
      // If respawn countdown is active, tick countdown and hold ball at safe platform
      if (this.isRespawning) {
        this.countdownTimer -= dt;

        // Keep ball securely pinned at safe platform coordinates
        this.ball.x = this.respawnTargetX;
        this.ball.y = this.respawnTargetY;
        this.ball.vx = 0;
        this.ball.vy = 0;

        const currentSec = Math.max(1, Math.ceil(this.countdownTimer));
        if (currentSec !== this.lastCountdownInteger && this.countdownTimer > 0) {
          this.lastCountdownInteger = currentSec;
          if (this.countdownNumber) {
            this.countdownNumber.textContent = currentSec.toString();
            this.countdownNumber.classList.remove('pulse-tick');
            void this.countdownNumber.offsetWidth;
            this.countdownNumber.classList.add('pulse-tick');
          }
          this.sound.playCountdownTick(currentSec);
        }

        if (this.countdownTimer <= 0) {
          this.finishRespawn();
        }
        return; // Skip normal gameplay updates while respawning
      }

      if (this.currentState !== STATE.PLAYING) {
        return;
      }

      // Invulnerability protection timer decay
      if (this.invulnerableTimer > 0) {
        this.invulnerableTimer -= dt;
        this.ball.invulnerable = (this.invulnerableTimer > 0);
      }

      // Substepping prevents tunneling even with frame delays
      const maxSubDt = 0.007; // 7ms maximum per substep
      let remainingDt = dt;
      let stepLimit = 0;
      while (remainingDt > 0.0001 && stepLimit < 20) {
        stepLimit++;
        const subDt = Math.min(remainingDt, maxSubDt);
        this.physicsSubStep(subDt);
        remainingDt -= subDt;
        if (this.currentState !== STATE.PLAYING) return;
      }

      // Update visual animations
      this.particles.update(dt);
      for (let i = 0; i < this.platforms.length; i++) {
        this.platforms[i].updateVisuals(dt);
      }
      for (let i = 0; i < this.collectibles.length; i++) {
        this.collectibles[i].update(dt);
      }
      for (let i = 0; i < this.specialStars.length; i++) {
        this.specialStars[i].update(dt);
      }
      this.ball.updateVisuals(dt);

      // Smooth level theme transition
      this.themeManager.update(dt);
      this.applyThemeToHUD();

      // Camera: Vertical follow upward
      // Keeps ball comfortably positioned on screen (~52% from top)
      const currentH = this.canvasHeight || CANVAS_HEIGHT;
      const targetOffset = Math.round(currentH * 0.52);
      const minTopOffset = Math.round(currentH * 0.34);
      const targetCameraY = this.ball.y - targetOffset;
      if (targetCameraY < this.cameraY) {
        // Smooth upward scroll
        this.cameraY += (targetCameraY - this.cameraY) * Math.min(1, dt * 9);
      }
      // Never allow ball to rise above top threshold without camera keeping up
      if (this.ball.y - this.cameraY < minTopOffset) {
        this.cameraY = this.ball.y - minTopOffset;
      }

      // Generate upcoming platforms ahead & cleanup far-below platforms
      this.generatePlatformsAhead();

      // Scoring calculation (Altitude above base platform + starting milestone altitude)
      const currentClimb = Math.max(0, Math.floor((BASE_ALTITUDE_Y - this.ball.y) / 2));
      const currentAltitude = (this.startAltitude || 0) + currentClimb;
      if (currentAltitude > this.maxAltitude) {
        this.maxAltitude = currentAltitude;
        this.score = this.maxAltitude;
      }

      // Level Progression System
      const prevMilestone = this.level === 1 ? 0 : getLevelMilestone(this.level - 1);
      const nextMilestone = getLevelMilestone(this.level);

      // Check level completion milestone
      if (this.score >= nextMilestone) {
        this.level++;
        this.themeManager.setLevel(this.level); // Smooth transition towards new level theme!
        this.showLevelBanner(this.level);
        this.sound.playLevelComplete();

        if (this.level > this.highestUnlockedLevel) {
          this.saveHighestUnlockedLevel(this.level);
        }
        this.lastPlayedLevel = this.level;
        this.saveLastPlayedLevel(this.level);
      }

      // Update Progress Bar
      const currentSpan = nextMilestone - prevMilestone;
      const progress = Math.min(1, Math.max(0, (this.score - prevMilestone) / currentSpan));
      if (this.hudLevelProgress) {
        this.hudLevelProgress.style.width = `${Math.round(progress * 100)}%`;
      }

      this.updateScoreDisplays();

      // Fall detection: Ball falls below bottom edge of screen viewport
      if (this.ball.y - this.cameraY - this.ball.radius > currentH) {
        if (!this.isRespawning && this.invulnerableTimer <= 0) {
          this.handlePlayerFall();
        }
      }
    }

    // --- Landing Readability & Visual Prediction Guide ---
    renderLandingIndicator(ctx, theme) {
      if (this.currentState !== STATE.PLAYING && this.currentState !== STATE.PAUSED) return;

      const ballX = this.ball.x;
      const ballY = this.ball.y;
      const ballVy = this.ball.vy;

      // Find the closest platform directly underneath the ball
      let targetPlat = null;
      let minDy = Infinity;

      for (let i = 0; i < this.platforms.length; i++) {
        const p = this.platforms[i];
        const dy = p.y - ballY;
        // Consider platforms within 260px vertically below the ball
        if (dy > 0 && dy < 260 && dy < minDy) {
          if (ballX >= p.x - 32 && ballX <= p.x + p.width + 32) {
            minDy = dy;
            targetPlat = p;
          }
        }
      }

      if (!targetPlat) return;

      const p = targetPlat;
      const platTop = p.y;
      const dy = platTop - ballY;

      // Safe landing zone boundaries (excluding spike hazard if present)
      let safeLeft = p.x;
      let safeRight = p.x + p.width;
      let isSpikeZone = false;
      if (p.spike) {
        if (p.spike.side === 'left') {
          safeLeft = p.x + p.spike.width + 2;
          if (ballX < safeLeft) isSpikeZone = true;
        } else {
          safeRight = p.x + p.width - p.spike.width - 2;
          if (ballX > safeRight) isSpikeZone = true;
        }
      }

      const isSafe = !isSpikeZone && ballX >= safeLeft - this.ball.radius * 0.4 && ballX <= safeRight + this.ball.radius * 0.4;

      // Proximity factor (0 at 240px away, 1 at 0px away)
      const proximity = Math.min(1, Math.max(0, 1 - (dy / 240)));
      const fallFactor = ballVy > 0 ? 1.0 : 0.45;
      const alpha = proximity * 0.55 * fallFactor;
      if (alpha <= 0.02) return;

      ctx.save();

      // Theme-aligned neon colors
      let primaryColor, glowColor;
      if (isSpikeZone) {
        primaryColor = `rgba(255, 42, 109, ${alpha * 0.95})`;
        glowColor = `rgba(255, 42, 109, ${alpha * 0.4})`;
      } else if (isSafe) {
        primaryColor = theme ? theme.primaryAlpha(alpha * 0.85) : `rgba(0, 240, 255, ${alpha * 0.85})`;
        glowColor = theme ? theme.primaryAlpha(alpha * 0.35) : `rgba(0, 240, 255, ${alpha * 0.35})`;
      } else {
        primaryColor = `rgba(148, 163, 184, ${alpha * 0.45})`;
        glowColor = `rgba(148, 163, 184, ${alpha * 0.15})`;
      }

      // 1. Subtle vertical alignment ray (only when descending towards platform within 180px)
      if (ballVy > 0 && dy < 180 && isSafe) {
        const rayAlpha = Math.min(0.2, (1 - dy / 180) * 0.25);
        const rayGrad = ctx.createLinearGradient(ballX, ballY + this.ball.radius, ballX, platTop);
        rayGrad.addColorStop(0, theme ? theme.primaryAlpha(rayAlpha * 0.25) : `rgba(0, 240, 255, ${rayAlpha * 0.25})`);
        rayGrad.addColorStop(1, theme ? theme.primaryAlpha(rayAlpha) : `rgba(0, 240, 255, ${rayAlpha})`);

        ctx.beginPath();
        ctx.moveTo(ballX, ballY + this.ball.radius);
        ctx.lineTo(ballX, platTop);
        ctx.strokeStyle = rayGrad;
        ctx.lineWidth = 1.5;
        if (ctx.setLineDash) ctx.setLineDash([3, 4]);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
      }

      // 2. Landing Shadow Ellipse on platform top surface
      const shadowX = Math.max(p.x + 6, Math.min(p.x + p.width - 6, ballX));
      const shadowRadiusX = Math.max(8, this.ball.radius * (0.8 + 0.6 * proximity));
      const shadowRadiusY = Math.max(2.5, 3.5 * proximity);

      const shadowGrad = ctx.createRadialGradient(
        shadowX, platTop, 1,
        shadowX, platTop, shadowRadiusX * 1.5
      );
      shadowGrad.addColorStop(0, primaryColor);
      shadowGrad.addColorStop(0.5, glowColor);
      shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      if (ctx.ellipse) {
        ctx.ellipse(shadowX, platTop, shadowRadiusX * 1.4, shadowRadiusY * 1.5, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(shadowX, platTop, shadowRadiusX, 0, Math.PI * 2);
      }
      ctx.fillStyle = shadowGrad;
      ctx.fill();

      // Inner crisp touchdown marker pip
      ctx.beginPath();
      if (ctx.ellipse) {
        ctx.ellipse(shadowX, platTop, shadowRadiusX * 0.6, shadowRadiusY * 0.7, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(shadowX, platTop, shadowRadiusX * 0.6, 0, Math.PI * 2);
      }
      ctx.fillStyle = primaryColor;
      ctx.fill();

      ctx.restore();
    }

    // --- Rendering ---
    render() {
      // Clear canvas
      this.ctx.clearRect(0, 0, CANVAS_WIDTH, this.canvasHeight || CANVAS_HEIGHT);

      // Get active interpolated theme colors
      const theme = this.themeManager.getColors();

      // Render Parallax Background (uses cameraY for parallax scroll, theme for ambient cyber lighting)
      this.background.render(this.ctx, this.cameraY, theme);

      // Render World Entities (Platforms, Hazards, Particles, Ball)
      // Transformed by Camera Y offset
      this.ctx.save();
      this.ctx.translate(0, -this.cameraY);

      // Render Platforms & Spikes (all platforms automatically take active level theme)
      for (let i = 0; i < this.platforms.length; i++) {
        this.platforms[i].render(this.ctx, theme);
      }

      // Render subtle predictive landing shadow and alignment cue
      this.renderLandingIndicator(this.ctx, theme);

      // Render Collectible Energy Orbs
      for (let i = 0; i < this.collectibles.length; i++) {
        this.collectibles[i].render(this.ctx);
      }

      // Render Special Star Collectibles
      for (let i = 0; i < this.specialStars.length; i++) {
        this.specialStars[i].render(this.ctx);
      }

      // Render Particles
      this.particles.render(this.ctx);

      // Render Ball with subtle level theme trail accent
      if (this.currentState === STATE.PLAYING || this.currentState === STATE.PAUSED) {
        this.ball.render(this.ctx, theme);
      }

      this.ctx.restore();
    }

    // --- Main Loop ---
    loop(currentTime) {
      try {
        if (!this.lastTime) {
          this.lastTime = currentTime;
        }

        // Calculate delta time in seconds, clamped to 0.05s to prevent huge lag spikes
        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
        this.lastTime = currentTime;

        // Update & Render
        this.update(dt);
        this.render();
      } catch (loopErr) {
        console.error('Error in Bounce game loop:', loopErr);
      } finally {
        this.animationFrameId = requestAnimationFrame(this.loop);
      }
    }
  }

  // Expose on global window object if available
  if (typeof window !== 'undefined') {
    window.BounceGame = BounceGame;
    window.STATE = STATE;
    window.CURRENCY_CONFIG = CURRENCY_CONFIG;
    window.getLevelMilestone = getLevelMilestone;
    window.bindButtonAction = bindButtonAction;
    window.MOVE_ACCEL_X = MOVE_ACCEL_X;
    window.MOVE_BRAKE_ACCEL_X = MOVE_BRAKE_ACCEL_X;
    window.MOVE_DECEL_X = MOVE_DECEL_X;
    window.MAX_SPEED_X = MAX_SPEED_X;
    window.LEVEL_THEMES = LEVEL_THEMES;
    window.ThemeManager = ThemeManager;
    window.getThemeIndexForLevel = getThemeIndexForLevel;
    window.getThemeForLevel = getThemeForLevel;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      BounceGame,
      STATE,
      CURRENCY_CONFIG,
      getLevelMilestone,
      bindButtonAction,
      MOVE_ACCEL_X,
      MOVE_BRAKE_ACCEL_X,
      MOVE_DECEL_X,
      MAX_SPEED_X,
      LEVEL_THEMES,
      ThemeManager,
      getThemeIndexForLevel,
      getThemeForLevel,
    };
  }

  // Initialize Game on DOM Ready or immediately if DOM is already ready
  function initGameInstance() {
    if (typeof window !== 'undefined' && !window.bounceGame) {
      window.bounceGame = new BounceGame();
    }
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initGameInstance);
    } else {
      initGameInstance();
    }
  }
})();
