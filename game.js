/**
 * ============================================================================
 * BOUNCE — Neon Arcade Game (Version 1.2 - Precision Movement & Moving Platforms)
 * Features:
 * - Edge-triggered single air jump (1 per bounce) preventing infinite flight
 * - 2-way vertical collision detection (landing bounce top, underside ceiling thud)
 * - Deterministic horizontally moving platforms (Start Base, Tier 1, Tier 2)
 * - Sub-stepped physics simulation eliminating tunneling
 * - Responsive left/right steering and downward dive
 * ============================================================================
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const CANVAS_WIDTH = 480;
  const CANVAS_HEIGHT = 700;
  const STORAGE_KEY = 'bounce_arcade_best_score';

  // Physics Parameters
  const GRAVITY = 980;              // Base downward acceleration (px/s^2)
  const BOUNCE_VELOCITY = -660;      // Automatic upward launch on platform landing (px/s)
  const AIR_JUMP_IMPULSE = -580;     // Single fixed air-jump upward impulse (px/s)
  const MOVE_ACCEL_X = 2200;        // Horizontal steering acceleration (px/s^2)
  const MOVE_DECEL_X = 1600;        // Horizontal friction/deceleration (px/s^2)
  const MAX_SPEED_X = 340;          // Terminal horizontal speed (px/s)
  const STEER_ACCEL_DOWN = 1600;    // Downward dive acceleration on holding Down/S (px/s^2)
  const MAX_FALL_SPEED = 880;       // Terminal downward vertical speed (px/s)

  const BASE_ALTITUDE_Y = 620;      // Baseline Y coordinate for altitude scoring

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

    playBounce() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(540, now + 0.12);

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.13);
      } catch (e) {}
    }

    playAirJump() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.14);

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
      } catch (e) {}
    }

    playHeadBump() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.09);

        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
      } catch (e) {}
    }

    playWallBounce() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.09);
      } catch (e) {}
    }

    playGameOver() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.45);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.46);
      } catch (e) {}
    }

    playNewRecord() {
      if (!this.enabled || !this.ctx) return;
      try {
        const notes = [440, 554, 659, 880];
        notes.forEach((freq, idx) => {
          const now = this.ctx.currentTime + idx * 0.09;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.19);
        });
      } catch (e) {}
    }
  }

  // --- Ball Entity ---
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
      this.hasAirJump = true; // Landing on a platform resets air jump
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

      // Trail update
      this.trail.unshift({ x: this.x, y: this.y, alpha: 0.7 });
      if (this.trail.length > 8) {
        this.trail.pop();
      }
      for (let i = 0; i < this.trail.length; i++) {
        this.trail[i].alpha -= dt * 2.2;
      }
    }

    render(ctx) {
      // 1. Render glowing trail
      for (let i = this.trail.length - 1; i >= 0; i--) {
        const pt = this.trail[i];
        if (pt.alpha <= 0) continue;
        const trailRadius = this.radius * (1 - (i / this.trail.length) * 0.5);

        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, trailRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 240, 255, ${Math.max(0, pt.alpha * 0.35)})`;
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
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
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

  // --- Platform Entity with Deterministic Horizontal Movement ---
  class Platform {
    constructor(x, y, width, height = 16, label = '', vx = 0, minX = 0, maxX = CANVAS_WIDTH) {
      this.x = x;
      this.y = y;
      this.prevX = x;
      this.width = width;
      this.height = height;
      this.label = label;
      this.impactPulse = 0;
      this.vx = vx;
      this.minX = minX;
      this.maxX = maxX;
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

    render(ctx) {
      ctx.save();

      const pulseOffset = Math.sin(this.impactPulse * Math.PI) * 2;
      const drawY = this.y + pulseOffset;

      // Platform body gradient
      const bodyGrad = ctx.createLinearGradient(this.x, drawY, this.x, drawY + this.height);
      bodyGrad.addColorStop(0, '#1c1642');
      bodyGrad.addColorStop(1, '#0e0c24');

      ctx.beginPath();
      ctx.roundRect(this.x, drawY, this.width, this.height, 6);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // Platform border & neon glow
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.impactPulse > 0 ? '#00f0ff' : '#a855f7';
      ctx.stroke();

      // Glowing top impact rail
      const railGrad = ctx.createLinearGradient(this.x, drawY, this.x + this.width, drawY);
      if (this.impactPulse > 0) {
        railGrad.addColorStop(0, 'rgba(0, 240, 255, 0.5)');
        railGrad.addColorStop(0.5, '#ffffff');
        railGrad.addColorStop(1, 'rgba(0, 240, 255, 0.5)');
      } else {
        railGrad.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
        railGrad.addColorStop(0.5, '#c084fc');
        railGrad.addColorStop(1, 'rgba(168, 85, 247, 0.4)');
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
        ctx.strokeStyle = `rgba(0, 240, 255, ${this.impactPulse * 0.7})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Platform Tier Label (subtle neon text)
      if (this.label) {
        ctx.font = '600 10px Orbitron, sans-serif';
        ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.label, this.x + this.width / 2, drawY + this.height / 2);
      }

      ctx.restore();
    }
  }

  // --- Particle Effects Manager ---
  class ParticleManager {
    constructor() {
      this.particles = [];
      this.maxParticles = 70;
    }

    reset() {
      this.particles = [];
    }

    spawnBounceSparks(x, y, count = 12) {
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
          color: Math.random() > 0.4 ? '#00f0ff' : '#a855f7',
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
        // Downward spray angle
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

  // --- Background Grid & Neon Ambiance ---
  class Background {
    constructor() {
      this.stars = [];
      for (let i = 0; i < 28; i++) {
        this.stars.push({
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * CANVAS_HEIGHT,
          radius: 0.8 + Math.random() * 1.2,
          alpha: 0.2 + Math.random() * 0.6,
          speed: 8 + Math.random() * 14,
        });
      }
    }

    update(dt) {
      for (let i = 0; i < this.stars.length; i++) {
        const star = this.stars[i];
        star.y += star.speed * dt;
        if (star.y > CANVAS_HEIGHT) {
          star.y = 0;
          star.x = Math.random() * CANVAS_WIDTH;
        }
      }
    }

    render(ctx) {
      ctx.save();

      // Deep dark navy backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGrad.addColorStop(0, '#050711');
      bgGrad.addColorStop(0.5, '#0a0f26');
      bgGrad.addColorStop(1, '#060814');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Subtle cyber grid lines
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 40;

      for (let x = 0; x < CANVAS_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }

      for (let y = 0; y < CANVAS_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // Floating cyber particles / stars
      for (let i = 0; i < this.stars.length; i++) {
        const star = this.stars[i];
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(168, 85, 247, ${star.alpha})`;
        ctx.fill();
      }

      // Bottom danger void glow
      const dangerGrad = ctx.createLinearGradient(0, CANVAS_HEIGHT - 60, 0, CANVAS_HEIGHT);
      dangerGrad.addColorStop(0, 'rgba(255, 42, 109, 0)');
      dangerGrad.addColorStop(1, 'rgba(255, 42, 109, 0.12)');
      ctx.fillStyle = dangerGrad;
      ctx.fillRect(0, CANVAS_HEIGHT - 60, CANVAS_WIDTH, 60);

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
      this.hudScore = document.getElementById('hudScore');
      this.hudBest = document.getElementById('hudBest');
      this.menuBestScore = document.getElementById('menuBestScore');
      this.finalScore = document.getElementById('finalScore');
      this.finalBestScore = document.getElementById('finalBestScore');
      this.newBestTag = document.getElementById('newBestTag');

      // Buttons
      this.playBtn = document.getElementById('playBtn');
      this.resumeBtn = document.getElementById('resumeBtn');
      this.restartBtn = document.getElementById('restartBtn');
      this.restartFromPauseBtn = document.getElementById('restartFromPauseBtn');
      this.pauseBtn = document.getElementById('pauseBtn');

      // Mobile 4-Directional Touch Buttons
      this.touchUp = document.getElementById('touchUp');
      this.touchDown = document.getElementById('touchDown');
      this.touchLeft = document.getElementById('touchLeft');
      this.touchRight = document.getElementById('touchRight');

      // Game Entities & Components
      this.sound = new SoundSynth();
      this.background = new Background();
      this.particles = new ParticleManager();
      this.ball = new Ball();

      // 3 Horizontally Moving Platforms with deterministic patrol ranges
      // Start Base: Wide (240px), slow (45px/s), patrols x=60 to 180 (spans 60-420px)
      // Tier 1: 140px, 80px/s, patrols x=30 to 310
      // Tier 2: 140px, 70px/s, patrols x=40 to 300
      this.platforms = [
        new Platform(120, 620, 240, 18, 'START BASE', 45, 60, 180),
        new Platform(80, 440, 140, 16, 'TIER 1', -80, 30, 310),
        new Platform(250, 260, 140, 16, 'TIER 2', 70, 40, 300),
      ];

      // Input State (Continuous keys for steering; edge-detection for air jump)
      this.keys = {
        left: false,
        right: false,
        down: false,
      };

      // Game Metrics & State
      this.currentState = STATE.MENU;
      this.score = 0;
      this.maxAltitude = 0;
      this.bestScore = this.loadBestScore();
      this.isNewRecord = false;

      // Loop Timing
      this.lastTime = 0;
      this.animationFrameId = null;

      // Initialize
      this.setupEventListeners();
      this.updateScoreDisplays();
      this.setGameState(STATE.MENU);

      // Start Game Loop
      this.loop = this.loop.bind(this);
      this.animationFrameId = requestAnimationFrame(this.loop);
    }

    // --- Persistence ---
    loadBestScore() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
      } catch (e) {
        return 0;
      }
    }

    saveBestScore(val) {
      try {
        localStorage.setItem(STORAGE_KEY, val.toString());
      } catch (e) {}
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
      this.isNewRecord = false;
      this.newBestTag.classList.add('hidden');

      // Reset Ball
      this.ball.reset(240, 580);
      this.ball.vy = BOUNCE_VELOCITY * 0.7; // Initial small drop/hop from safe base
      this.ball.hasAirJump = false;
      this.particles.reset();

      // Reset Moving Platforms to initial deterministic states
      this.platforms = [
        new Platform(120, 620, 240, 18, 'START BASE', 45, 60, 180),
        new Platform(80, 440, 140, 16, 'TIER 1', -80, 30, 310),
        new Platform(250, 260, 140, 16, 'TIER 2', 70, 40, 300),
      ];

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

    triggerGameOver() {
      this.setGameState(STATE.GAMEOVER);
      this.sound.playGameOver();
      this.resetHeldKeys();

      // Check for new best record
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        this.saveBestScore(this.bestScore);
        this.isNewRecord = true;
        this.sound.playNewRecord();
        this.newBestTag.classList.remove('hidden');
      } else {
        this.newBestTag.classList.add('hidden');
      }

      this.finalScore.textContent = this.score;
      this.finalBestScore.textContent = this.bestScore;
      this.updateScoreDisplays();
    }

    updateScoreDisplays() {
      this.hudScore.textContent = this.score;
      this.hudBest.textContent = this.bestScore;
      this.menuBestScore.textContent = this.bestScore;
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

    // --- Event Listeners ---
    setupEventListeners() {
      // Keyboard Down
      window.addEventListener('keydown', (e) => {
        // Prevent default scrolling on game navigation keys
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
          e.preventDefault();
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

      // 4. Boundary Checks (Walls & Ceiling)
      // Left Wall
      if (this.ball.x - this.ball.radius < 0) {
        this.ball.x = this.ball.radius;
        this.ball.vx = Math.abs(this.ball.vx) * 0.55;
        this.particles.spawnWallSparks(0, this.ball.y, true);
        this.sound.playWallBounce();
      }
      // Right Wall
      else if (this.ball.x + this.ball.radius > CANVAS_WIDTH) {
        this.ball.x = CANVAS_WIDTH - this.ball.radius;
        this.ball.vx = -Math.abs(this.ball.vx) * 0.55;
        this.particles.spawnWallSparks(CANVAS_WIDTH, this.ball.y, false);
        this.sound.playWallBounce();
      }

      // Top Ceiling (prevents escaping top of view)
      if (this.ball.y - this.ball.radius < 0) {
        this.ball.y = this.ball.radius;
        if (this.ball.vy < 0) {
          this.ball.vy = -this.ball.vy * 0.2; // Gentle downward deflection
        }
      }

      // 5. Consistent 2-Way Platform Collision Handling
      for (let i = 0; i < this.platforms.length; i++) {
        const p = this.platforms[i];

        // Horizontal overlap calculation (including swept range of platform & ball)
        const ballLeft = this.ball.x - this.ball.radius * 0.72;
        const ballRight = this.ball.x + this.ball.radius * 0.72;
        const prevBallLeft = this.ball.prevX - this.ball.radius * 0.72;
        const prevBallRight = this.ball.prevX + this.ball.radius * 0.72;

        const platLeft = Math.min(p.x, p.prevX);
        const platRight = Math.max(p.x + p.width, p.prevX + p.width);

        const isHOverlap = (ballRight >= platLeft && ballLeft <= platRight) ||
                           (prevBallRight >= platLeft && prevBallLeft <= platRight);

        if (!isHOverlap) continue;

        const platTop = p.y;
        const platBottom = p.y + p.height;

        // --- DIRECTION A: Descending (vy >= 0) -> Land on top surface ---
        if (this.ball.vy >= 0) {
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
            this.particles.spawnBounceSparks(this.ball.x, platTop);
            this.sound.playBounce();
            break;
          }
        }
        // --- DIRECTION B: Ascending (vy < 0) -> Hit underside of platform ---
        else if (this.ball.vy < 0) {
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
      this.background.update(dt);
      this.particles.update(dt);

      for (let i = 0; i < this.platforms.length; i++) {
        this.platforms[i].updateVisuals(dt);
      }

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
      }

      this.ball.updateVisuals(dt);

      // Scoring calculation (Altitude above base platform)
      const currentAltitude = Math.max(0, Math.floor((BASE_ALTITUDE_Y - this.ball.y) / 2));
      if (currentAltitude > this.maxAltitude) {
        this.maxAltitude = currentAltitude;
        this.score = this.maxAltitude;
        this.updateScoreDisplays();
      }

      // Game Over detection (Ball falls below bottom screen boundary)
      if (this.ball.y - this.ball.radius > CANVAS_HEIGHT) {
        this.triggerGameOver();
      }
    }

    // --- Rendering ---
    render() {
      // Clear canvas
      this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Render Background
      this.background.render(this.ctx);

      // Render Platforms
      for (let i = 0; i < this.platforms.length; i++) {
        this.platforms[i].render(this.ctx);
      }

      // Render Particles
      this.particles.render(this.ctx);

      // Render Ball
      if (this.currentState === STATE.PLAYING || this.currentState === STATE.PAUSED) {
        this.ball.render(this.ctx);
      }
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
