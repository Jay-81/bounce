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
  const CANVAS_HEIGHT = 700;
  const STORAGE_KEY_BEST = 'bounce_arcade_best_score';
  const STORAGE_KEY_LEVEL = 'bounce_arcade_highest_level';
  const STORAGE_KEY_SOUND = 'bounce_arcade_sound_enabled';

  // Physics Parameters (World space)
  const GRAVITY = 980;              // Base downward acceleration (px/s^2)
  const BOUNCE_VELOCITY = -660;      // Automatic upward launch on platform landing (px/s)
  const AIR_JUMP_IMPULSE = -580;     // Single fixed air-jump upward impulse (px/s)
  const MOVE_ACCEL_X = 2200;        // Horizontal steering acceleration (px/s^2)
  const MOVE_DECEL_X = 1600;        // Horizontal friction/deceleration (px/s^2)
  const MAX_SPEED_X = 340;          // Terminal horizontal speed (px/s)
  const STEER_ACCEL_DOWN = 1600;    // Downward dive acceleration on holding Down/S (px/s^2)
  const MAX_FALL_SPEED = 880;       // Terminal downward vertical speed (px/s)

  const BASE_ALTITUDE_Y = 620;      // Baseline world Y coordinate for altitude scoring

  // Level Milestones Formula
  function getLevelMilestone(lvl) {
    let m = 0;
    for (let i = 1; i <= lvl; i++) {
      m += 500 + (i - 1) * 200;
    }
    return m;
  }

  // --- Level Neon Color Themes ---
  // Level 1: Cyan and electric blue
  // Level 2: Purple and magenta
  // Level 3: Neon green and lime
  // Level 4: Orange and gold
  // Level 5: Pink and hot magenta
  // Level 6 onward: Cycles through themes predictably
  const LEVEL_THEMES = [
    {
      name: 'Cyan & Electric Blue',
      primary: [0, 240, 255],       // #00f0ff
      secondary: [0, 119, 255],     // #0077ff
      rail: [56, 189, 248],         // #38bdf8
      bodyTop: [11, 26, 48],        // #0b1a30
      bodyBottom: [6, 13, 26],      // #060d1a
    },
    {
      name: 'Purple & Magenta',
      primary: [168, 85, 247],      // #a855f7
      secondary: [217, 70, 239],    // #d946ef
      rail: [192, 132, 252],        // #c084fc
      bodyTop: [28, 18, 54],        // #1c1236
      bodyBottom: [13, 8, 28],      // #0d081c
    },
    {
      name: 'Neon Green & Lime',
      primary: [46, 234, 112],      // #2eea70
      secondary: [163, 230, 53],    // #a3e635
      rail: [74, 222, 128],         // #4ade80
      bodyTop: [14, 38, 23],        // #0e2617
      bodyBottom: [6, 19, 11],      // #06130b
    },
    {
      name: 'Orange & Gold',
      primary: [255, 136, 0],       // #ff8800
      secondary: [255, 215, 0],     // #ffd700
      rail: [245, 158, 11],         // #f59e0b
      bodyTop: [43, 23, 8],         // #2b1708
      bodyBottom: [20, 9, 2],       // #140902
    },
    {
      name: 'Pink & Hot Magenta',
      primary: [244, 63, 94],       // #f43f5e
      secondary: [255, 0, 127],     // #ff007f
      rail: [251, 113, 133],        // #fb7185
      bodyTop: [43, 11, 30],        // #2b0b1e
      bodyBottom: [20, 4, 14],      // #14040e
    },
  ];

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
      this.current = this.cloneTheme(LEVEL_THEMES[0]);
      this.target = this.cloneTheme(LEVEL_THEMES[0]);
    }

    cloneTheme(theme) {
      return {
        primary: [...theme.primary],
        secondary: [...theme.secondary],
        rail: [...theme.rail],
        bodyTop: [...theme.bodyTop],
        bodyBottom: [...theme.bodyBottom],
      };
    }

    setLevel(lvl, instant = false) {
      this.currentLevel = lvl;
      const themeIdx = (lvl - 1) % LEVEL_THEMES.length;
      const t = LEVEL_THEMES[themeIdx];
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
    }

    getColors() {
      const c = this.current;
      return {
        primary: rgbStr(c.primary),
        primaryRgb: c.primary,
        primaryAlpha: (a) => rgbaStr(c.primary, a),
        secondary: rgbStr(c.secondary),
        secondaryAlpha: (a) => rgbaStr(c.secondary, a),
        rail: rgbStr(c.rail),
        railAlpha: (a) => rgbaStr(c.rail, a),
        bodyTop: rgbStr(c.bodyTop),
        bodyBottom: rgbStr(c.bodyBottom),
      };
    }
  }

  // --- Game States ---
  const STATE = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
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

      // Outer glow aura
      const glowGrad = ctx.createRadialGradient(0, 0, this.radius * 0.4, 0, 0, this.radius * 2.2);
      glowGrad.addColorStop(0, 'rgba(0, 240, 255, 0.9)');
      glowGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.35)');
      glowGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');

      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Air jump availability halo (subtle bright orbit indicator)
      if (this.hasAirJump) {
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.45, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
        ctx.lineWidth = 1.5;
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

      // Platform body gradient from active level theme
      const bodyGrad = ctx.createLinearGradient(this.x, drawY, this.x, drawY + this.height);
      bodyGrad.addColorStop(0, bodyTop);
      bodyGrad.addColorStop(1, bodyBottom);

      ctx.beginPath();
      ctx.roundRect(this.x, drawY, this.width, this.height, 6);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // Platform border & neon glow
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.impactPulse > 0 ? '#ffffff' : primaryCol;
      ctx.stroke();

      // Glowing top impact rail
      const railGrad = ctx.createLinearGradient(this.x, drawY, this.x + this.width, drawY);
      if (this.impactPulse > 0) {
        railGrad.addColorStop(0, primaryAlpha(0.6));
        railGrad.addColorStop(0.5, '#ffffff');
        railGrad.addColorStop(1, primaryAlpha(0.6));
      } else {
        railGrad.addColorStop(0, primaryAlpha(0.35));
        railGrad.addColorStop(0.5, railCol);
        railGrad.addColorStop(1, primaryAlpha(0.35));
      }

      ctx.beginPath();
      ctx.moveTo(this.x + 4, drawY + 1);
      ctx.lineTo(this.x + this.width - 4, drawY + 1);
      ctx.strokeStyle = railGrad;
      ctx.lineWidth = 3;
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
      for (let i = 0; i < 35; i++) {
        this.stars.push({
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * CANVAS_HEIGHT,
          radius: 0.8 + Math.random() * 1.4,
          alpha: 0.2 + Math.random() * 0.6,
          parallax: 0.2 + Math.random() * 0.5,
        });
      }
    }

    render(ctx, cameraY) {
      ctx.save();

      // Deep dark navy backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGrad.addColorStop(0, '#050711');
      bgGrad.addColorStop(0.5, '#0a0f26');
      bgGrad.addColorStop(1, '#060814');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Subtle cyber grid lines that scroll seamlessly with camera
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 40;

      // Vertical grid lines
      for (let x = 0; x < CANVAS_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }

      // Horizontal grid lines offset by camera position
      const gridOffsetY = ((-cameraY) % gridSize + gridSize) % gridSize;
      for (let y = gridOffsetY; y < CANVAS_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // Floating cyber particles / stars with parallax
      for (let i = 0; i < this.stars.length; i++) {
        const star = this.stars[i];
        // Calculate screen Y with parallax wrapping
        const screenStarY = ((star.y - cameraY * star.parallax) % CANVAS_HEIGHT + CANVAS_HEIGHT) % CANVAS_HEIGHT;

        ctx.beginPath();
        ctx.arc(star.x, screenStarY, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(168, 85, 247, ${star.alpha})`;
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
      this.menuBestScore = document.getElementById('menuBestScore');
      this.menuHighestLevel = document.getElementById('menuHighestLevel');
      this.finalScore = document.getElementById('finalScore');
      this.finalBestScore = document.getElementById('finalBestScore');
      this.finalLevelReached = document.getElementById('finalLevelReached');
      this.gameOverSubtext = document.getElementById('gameOverSubtext');
      this.newBestTag = document.getElementById('newBestTag');

      // Level Banner Element
      this.levelBanner = document.getElementById('levelBanner');
      this.levelBannerTitle = document.getElementById('levelBannerTitle');
      this.bannerTimeoutId = null;

      // Buttons
      this.playBtn = document.getElementById('playBtn');
      this.resumeBtn = document.getElementById('resumeBtn');
      this.restartBtn = document.getElementById('restartBtn');
      this.restartFromPauseBtn = document.getElementById('restartFromPauseBtn');
      this.pauseBtn = document.getElementById('pauseBtn');
      this.soundBtn = document.getElementById('soundBtn');

      // Mobile Touch Buttons
      this.touchUp = document.getElementById('touchUp');
      this.touchDown = document.getElementById('touchDown');
      this.touchLeft = document.getElementById('touchLeft');
      this.touchRight = document.getElementById('touchRight');

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

      // Input State
      this.keys = {
        left: false,
        right: false,
        down: false,
      };

      // Game Metrics & State
      this.currentState = STATE.MENU;
      this.score = 0;
      this.maxAltitude = 0;
      this.level = 1;
      this.highestLevelCompleted = this.loadHighestLevel();
      this.bestScore = this.loadBestScore();
      this.isNewRecord = false;

      // Loop Timing
      this.lastTime = 0;
      this.animationFrameId = null;

      // Initialize
      this.setupEventListeners();
      this.updateSoundButtonUI();
      this.updateScoreDisplays();
      this.setGameState(STATE.MENU);

      // Start Game Loop
      this.loop = this.loop.bind(this);
      this.animationFrameId = requestAnimationFrame(this.loop);
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

    loadHighestLevel() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_LEVEL);
        return saved ? Math.max(1, parseInt(saved, 10) || 1) : 1;
      } catch (e) {
        return 1;
      }
    }

    saveHighestLevel(val) {
      try {
        localStorage.setItem(STORAGE_KEY_LEVEL, val.toString());
      } catch (e) {}
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
      this.currentState = newState;

      // Screen Overlays
      this.menuScreen.classList.toggle('hidden', newState !== STATE.MENU);
      this.menuScreen.classList.toggle('active', newState === STATE.MENU);

      this.pauseScreen.classList.toggle('hidden', newState !== STATE.PAUSED);
      this.pauseScreen.classList.toggle('active', newState === STATE.PAUSED);

      this.gameOverScreen.classList.toggle('hidden', newState !== STATE.GAMEOVER);
      this.gameOverScreen.classList.toggle('active', newState === STATE.GAMEOVER);

      // HUD Visibility
      this.gameHud.style.display = (newState === STATE.PLAYING || newState === STATE.PAUSED) ? 'flex' : 'none';

      // Blur / Unfocus buttons so Enter key doesn't trigger unexpected clicks
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }

    startNewGame() {
      this.sound.init();
      this.score = 0;
      this.maxAltitude = 0;
      this.level = 1;
      this.cameraY = 0;
      this.isNewRecord = false;
      this.newBestTag.classList.add('hidden');
      if (this.levelBanner) this.levelBanner.classList.add('hidden');

      // Reset Ball
      this.ball.reset(240, 580);
      this.ball.vy = BOUNCE_VELOCITY * 0.7; // Initial small drop from safe base
      this.ball.hasAirJump = false;
      this.particles.reset();

      // Reset Initial Platforms (Level 1 start: completely hazard free)
      // Generous stationary base, moving tier 1, stationary tier 2 (clean visual shapes, no text labels)
      this.platforms = [
        new Platform(100, 620, 280, 18, 0, 0, CANVAS_WIDTH, null),
        new Platform(80, 440, 140, 16, -75, 30, 310, null),
        new Platform(230, 260, 140, 16, 0, 0, CANVAS_WIDTH, null),
      ];
      this.highestGeneratedY = 260;

      // Reset theme instantly to Level 1
      this.themeManager.setLevel(1, true);
      this.applyThemeToHUD();

      // Generate initial buffer of platforms above Tier 2
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
      if (this.currentState === STATE.GAMEOVER) return;

      this.setGameState(STATE.GAMEOVER);
      this.sound.playGameOver();
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
      if (this.level > this.highestLevelCompleted) {
        this.highestLevelCompleted = this.level;
        this.saveHighestLevel(this.highestLevelCompleted);
      }

      this.finalScore.textContent = this.score;
      this.finalBestScore.textContent = this.bestScore;
      this.finalLevelReached.textContent = this.level;
      if (this.gameOverSubtext) this.gameOverSubtext.textContent = reason;
      this.updateScoreDisplays();
    }

    updateScoreDisplays() {
      this.hudScore.textContent = this.score;
      this.hudBest.textContent = this.bestScore;
      this.menuBestScore.textContent = this.bestScore;
      if (this.menuHighestLevel) this.menuHighestLevel.textContent = this.highestLevelCompleted;
      if (this.hudLevelText) this.hudLevelText.textContent = `LVL ${this.level}`;
      this.applyThemeToHUD();
    }

    applyThemeToHUD() {
      const theme = this.themeManager.getColors();
      if (this.hudLevelText) {
        this.hudLevelText.style.color = theme.primary;
        this.hudLevelText.style.textShadow = `0 0 10px ${theme.primaryAlpha(0.8)}`;
      }
      if (this.hudLevelProgress) {
        this.hudLevelProgress.style.background = `linear-gradient(90deg, ${theme.secondary}, ${theme.primary})`;
        this.hudLevelProgress.style.boxShadow = `0 0 8px ${theme.primaryAlpha(0.8)}`;
      }
      const track = this.hudLevelProgress ? this.hudLevelProgress.parentElement : null;
      if (track) {
        track.style.borderColor = theme.primaryAlpha(0.4);
      }
    }

    resetHeldKeys() {
      this.keys.left = false;
      this.keys.right = false;
      this.keys.down = false;
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
      while (this.highestGeneratedY > this.cameraY - 650) {
        // Consistent, bounded vertical gap (124px to 152px)
        const spacing = 124 + Math.random() * 28;
        const newY = this.highestGeneratedY - spacing;
        this.highestGeneratedY = newY;

        // Current altitude in world space for progressive difficulty
        const altitude = Math.max(0, (BASE_ALTITUDE_Y - newY) / 2);

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
      }

      // Memory cleanup: Recycle/remove platforms far below camera view
      const removeThresholdY = this.cameraY + CANVAS_HEIGHT + 240;
      this.platforms = this.platforms.filter(p => p.y <= removeThresholdY);
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
          if (this.currentState === STATE.PLAYING || this.currentState === STATE.PAUSED) {
            this.togglePause();
          }
        } else if (e.code === 'Enter' || e.code === 'Space') {
          if (this.currentState === STATE.MENU || this.currentState === STATE.GAMEOVER) {
            this.startNewGame();
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
        }
      });

      // UI Buttons
      this.playBtn.addEventListener('click', () => this.startNewGame());
      this.resumeBtn.addEventListener('click', () => this.togglePause());
      this.restartBtn.addEventListener('click', () => this.startNewGame());
      this.restartFromPauseBtn.addEventListener('click', () => this.startNewGame());
      this.pauseBtn.addEventListener('click', () => this.togglePause());
      if (this.soundBtn) {
        this.soundBtn.addEventListener('click', () => this.toggleSound());
      }

      // Touch Buttons for Mobile
      if (this.touchUp) {
        const triggerUp = (e) => {
          e.preventDefault();
          this.sound.init();
          this.handleAirJump();
        };
        this.touchUp.addEventListener('touchstart', triggerUp, { passive: false });
        this.touchUp.addEventListener('mousedown', triggerUp);
      }

      const bindSteerTouch = (elem, keyName) => {
        if (!elem) return;
        const start = (e) => {
          e.preventDefault();
          this.sound.init();
          this.keys[keyName] = true;
        };
        const end = (e) => {
          e.preventDefault();
          this.keys[keyName] = false;
        };
        elem.addEventListener('touchstart', start, { passive: false });
        elem.addEventListener('touchend', end, { passive: false });
        elem.addEventListener('touchcancel', end, { passive: false });
        elem.addEventListener('mousedown', start);
        elem.addEventListener('mouseup', end);
        elem.addEventListener('mouseleave', end);
      };

      bindSteerTouch(this.touchDown, 'down');
      bindSteerTouch(this.touchLeft, 'left');
      bindSteerTouch(this.touchRight, 'right');
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
        this.ball.vx += steerX * MOVE_ACCEL_X * subDt;
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
          this.sound.playHazard();
          this.particles.spawnHazardSparks(this.ball.x, this.ball.y);
          this.triggerGameOver('Shattered by a hazard spike!');
          return;
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
      if (this.currentState !== STATE.PLAYING) {
        return;
      }

      // Substepping prevents tunneling even with frame delays
      const maxSubDt = 0.007; // 7ms maximum per substep
      let remainingDt = dt;
      while (remainingDt > 0) {
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
      this.ball.updateVisuals(dt);

      // Smooth level theme transition
      this.themeManager.update(dt);
      this.applyThemeToHUD();

      // Camera: Vertical follow upward
      // Keeps ball comfortably positioned on screen (~360px from top)
      const targetCameraY = this.ball.y - 360;
      if (targetCameraY < this.cameraY) {
        // Smooth upward scroll
        this.cameraY += (targetCameraY - this.cameraY) * Math.min(1, dt * 9);
      }
      // Never allow ball to rise above top 240px without camera keeping up
      if (this.ball.y - this.cameraY < 240) {
        this.cameraY = this.ball.y - 240;
      }

      // Generate upcoming platforms ahead & cleanup far-below platforms
      this.generatePlatformsAhead();

      // Scoring calculation (Altitude above base platform)
      const currentAltitude = Math.max(0, Math.floor((BASE_ALTITUDE_Y - this.ball.y) / 2));
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

        if (this.level > this.highestLevelCompleted) {
          this.highestLevelCompleted = this.level;
          this.saveHighestLevel(this.level);
        }
      }

      // Update Progress Bar
      const currentSpan = nextMilestone - prevMilestone;
      const progress = Math.min(1, Math.max(0, (this.score - prevMilestone) / currentSpan));
      if (this.hudLevelProgress) {
        this.hudLevelProgress.style.width = `${Math.round(progress * 100)}%`;
      }

      this.updateScoreDisplays();

      // Game Over detection: Ball falls below bottom edge of screen viewport
      if (this.ball.y - this.cameraY - this.ball.radius > CANVAS_HEIGHT) {
        this.triggerGameOver('The orb fell into the void');
      }
    }

    // --- Rendering ---
    render() {
      // Clear canvas
      this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Render Parallax Background (uses cameraY for parallax scroll)
      this.background.render(this.ctx, this.cameraY);

      // Get active interpolated theme colors
      const theme = this.themeManager.getColors();

      // Render World Entities (Platforms, Hazards, Particles, Ball)
      // Transformed by Camera Y offset
      this.ctx.save();
      this.ctx.translate(0, -this.cameraY);

      // Render Platforms & Spikes (all platforms automatically take active level theme)
      for (let i = 0; i < this.platforms.length; i++) {
        this.platforms[i].render(this.ctx, theme);
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
      if (!this.lastTime) {
        this.lastTime = currentTime;
      }

      // Calculate delta time in seconds, clamped to 0.05s to prevent huge lag spikes
      const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
      this.lastTime = currentTime;

      // Update & Render
      this.update(dt);
      this.render();

      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  // Initialize Game on DOM Ready
  window.addEventListener('DOMContentLoaded', () => {
    window.bounceGame = new BounceGame();
  });
})();
