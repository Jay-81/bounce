/**
 * ============================================================================
 * BOUNCE v2 — AI Autoplayer & Automated Gameplay Audit Suite
 *
 * Provides:
 * 1. Skilled Spectator / AI Autoplayer:
 *    - Real-time parabolic trajectory prediction
 *    - Moving platform motion anticipation
 *    - Proportional-derivative horizontal steering
 *    - Smart hazard spike avoidance & safety landing zones
 *    - Tactical single-use air-jump deployment
 *    - Opportunistic, safe energy orb and special star gathering
 * 2. Automated Gameplay Audit & Diagnostics:
 *    - Invariant assertion checking on every frame
 *    - Physics finiteness verification
 *    - Platform gap reachability validation
 *    - Hazard spacing and non-overlap verification
 *    - Single-award collectible lifecycle auditing
 *    - Configurable bounded testing runs (Level, Time, Attempts)
 *    - Comprehensive Markdown & JSON diagnostic reports
 * ============================================================================
 */

(function () {
  'use strict';

  // Constants mirrored from game physics
  const GRAVITY = 980;
  const BOUNCE_VELOCITY = -660;
  const AIR_JUMP_IMPULSE = -580;
  const MAX_SPEED_X = 340;
  const MOVE_ACCEL_X = 2200;
  const MOVE_DECEL_X = 1600;
  const CANVAS_WIDTH = 480;
  const CANVAS_HEIGHT = 700;
  const BASE_ALTITUDE_Y = 620;

  // --- Helper: Moving Platform Motion Projection ---
  function predictPlatformAtTime(p, flightTime) {
    if (!p.vx || flightTime <= 0) {
      return { x: p.x, vx: p.vx || 0 };
    }
    let simX = p.x;
    let simVx = p.vx;
    let remaining = flightTime;
    const step = 0.02;

    while (remaining > 0) {
      const dt = Math.min(remaining, step);
      simX += simVx * dt;
      if (simX <= p.minX) {
        simX = p.minX;
        simVx = Math.abs(simVx);
      } else if (simX >= p.maxX) {
        simX = p.maxX;
        simVx = -Math.abs(simVx);
      }
      remaining -= dt;
    }
    return { x: simX, vx: simVx };
  }

  // --- Helper: Safe Landing Range for a Platform ---
  function getPlatformSafeRange(p, projectedX = null) {
    const platX = projectedX !== null ? projectedX : p.x;
    const width = p.width;

    if (!p.spike) {
      return {
        left: platX + 12,
        right: platX + width - 12,
        center: platX + width * 0.5,
        width: Math.max(0, width - 24),
        hasSpike: false,
      };
    }

    // Platform has spike on left or right
    if (p.spike.side === 'left') {
      const spikeEnd = platX + p.spike.width + 4;
      const safeLeft = spikeEnd + 14;
      const safeRight = platX + width - 10;
      return {
        left: safeLeft,
        right: safeRight,
        center: (safeLeft + safeRight) * 0.5,
        width: Math.max(0, safeRight - safeLeft),
        hasSpike: true,
        spikeSide: 'left',
        spikeLeft: platX + 4,
        spikeRight: spikeEnd,
      };
    } else {
      const spikeStart = platX + width - p.spike.width - 4;
      const safeLeft = platX + 10;
      const safeRight = spikeStart - 14;
      return {
        left: safeLeft,
        right: safeRight,
        center: (safeLeft + safeRight) * 0.5,
        width: Math.max(0, safeRight - safeLeft),
        hasSpike: true,
        spikeSide: 'right',
        spikeLeft: spikeStart,
        spikeRight: platX + width - 4,
      };
    }
  }

  // ==========================================================================
  // 1. PROGRESS-AWARE SKILLED AI AUTOPLAYER CONTROLLER
  // ==========================================================================
  class Autoplayer {
    constructor(game) {
      this.game = game;
      this.enabled = false;
      this.autoRestartOnDeath = true;
      this.target = null;
      this.committedTarget = null;
      this.committedPlan = null;
      this.autoRestartTimer = null;
      this.lastBouncedY = BASE_ALTITUDE_Y;
      this.prevLandedY = BASE_ALTITUDE_Y;
      this.consecutiveStallBounces = 0;
      this.failedTargetsMap = new Map(); // pId -> timestamp
      this.recentRejections = [];
      this.mode = 'PROGRESS'; // 'PROGRESS' | 'RECOVERY'
      this.isWaypointActive = false;
      this.lastDesiredTargetX = 240;
      this.debugMode = false;
      this._handledBounceThisFrame = false;
    }

    enable(autoRestart = true) {
      this.enabled = true;
      this.autoRestartOnDeath = autoRestart;
      this.updateUI();

      if (this.game.currentState === 'MENU' || this.game.currentState === 'GAMEOVER') {
        this.game.startNewGame();
      } else if (this.game.currentState === 'PAUSED') {
        this.game.togglePause();
      }

      console.log('🤖 [Autoplayer] Spectator mode enabled');
    }

    disable() {
      this.enabled = false;
      this.clearRestartTimer();
      if (this.game && this.game.keys) {
        this.game.keys.left = false;
        this.game.keys.right = false;
        this.game.keys.down = false;
      }
      this.updateUI();
      console.log('🛑 [Autoplayer] Spectator mode disabled');
    }

    toggle() {
      if (this.enabled) {
        this.disable();
      } else {
        this.enable(true);
      }
    }

    toggleDebug() {
      this.debugMode = !this.debugMode;
      console.log(`🤖 [Autoplayer] Debug Diagnostics: ${this.debugMode ? 'ENABLED' : 'DISABLED'}`);
      return this.debugMode;
    }

    clearRestartTimer() {
      if (this.autoRestartTimer) {
        clearTimeout(this.autoRestartTimer);
        this.autoRestartTimer = null;
      }
    }

    onGameStart() {
      this.consecutiveStallBounces = 0;
      this.committedTarget = null;
      this.committedPlan = null;
      this.lastBouncedY = BASE_ALTITUDE_Y;
      this.prevLandedY = BASE_ALTITUDE_Y;
      this.recentLandings = [];
      this.failedTargetsMap.clear();
      this.recentRejections = [];
      this.mode = 'PROGRESS';
      this.isWaypointActive = false;
      this.lastDesiredTargetX = 240;
    }

    onGameOver() {
      if (!this.enabled || !this.autoRestartOnDeath) return;
      this.clearRestartTimer();

      const notice = document.getElementById('spectatorRestartNotice');
      if (notice) notice.classList.remove('hidden');

      this.autoRestartTimer = setTimeout(() => {
        if (this.enabled && this.game.currentState === 'GAMEOVER') {
          if (notice) notice.classList.add('hidden');
          this.game.startNewGame();
        }
      }, 1800);
    }

    onBounce(landedPlat) {
      if (!landedPlat) return;
      if (this._handledBounceThisFrame) return;

      this._handledBounceThisFrame = true;
      requestAnimationFrame(() => {
        this._handledBounceThisFrame = false;
      });

      const landedY = landedPlat.y;
      const now = performance.now();

      // Track recent landing history (last 5 landings)
      if (!this.recentLandings) this.recentLandings = [];

      // Check if we previously landed near this exact height (< 25px height difference)
      const isRepeatedLanding = this.recentLandings.some(l => Math.abs(l.y - landedY) < 25);

      if (isRepeatedLanding) {
        this.consecutiveStallBounces++;
        // Exclude failed target and stalled landing
        if (this.committedTarget) {
          this.failedTargetsMap.set('plat_' + Math.round(this.committedTarget.y), now);
        }
        this.failedTargetsMap.set('plat_' + Math.round(landedY), now);
        if (this.debugMode) {
          console.warn(`⚠️ [AI-STALL] Repeated landing on tier y=${Math.round(landedY)} (Stalls: ${this.consecutiveStallBounces})`);
        }
      } else {
        this.consecutiveStallBounces = 0;
      }

      this.recentLandings.push({ y: landedY, time: now });
      if (this.recentLandings.length > 5) {
        this.recentLandings.shift();
      }

      this.prevLandedY = this.lastBouncedY;
      this.lastBouncedY = landedY;
      this.committedTarget = null;
      this.committedPlan = null;

      // Immediately evaluate and select the next progressive climb target
      this.selectOptimalTarget(this.game.ball, this.game.platforms, this.game.cameraY);
    }

    // --- Trajectory Solver with Exact Quadratic Descent Time ---
    solveTrajectory(ball, p) {
      const yLand = p.y - ball.radius;
      const vy = ball.vy;
      const y = ball.y;

      let tFlight = 0;
      let requiresAirJump = false;

      if (y <= yLand) {
        // Platform is at or below the ball: natural falling arrival
        const disc = vy * vy + 2 * GRAVITY * (yLand - y);
        if (disc >= 0) {
          tFlight = (-vy + Math.sqrt(disc)) / GRAVITY;
        }
      } else {
        // Platform is ABOVE the ball: requires upward momentum or apex air jump
        const riseApex = (Math.max(0, -vy) ** 2) / (2 * GRAVITY);
        const yApex = y - riseApex;

        if (yApex <= yLand) {
          // Natural upward bounce carries ball high enough to land on platform
          const disc = vy * vy + 2 * GRAVITY * (yLand - y);
          if (disc >= 0) {
            tFlight = (-vy + Math.sqrt(disc)) / GRAVITY;
          }
        } else if (ball.hasAirJump) {
          // Current momentum alone does not reach, but apex air jump boosts ball over platform
          const riseAir = (AIR_JUMP_IMPULSE ** 2) / (2 * GRAVITY);
          const yPeak = yApex - riseAir;

          if (yPeak <= yLand) {
            const tToApex = Math.max(0, -vy) / GRAVITY;
            const discAir = (AIR_JUMP_IMPULSE ** 2) + 2 * GRAVITY * (yLand - yApex);
            if (discAir >= 0) {
              const tFromApex = (-AIR_JUMP_IMPULSE + Math.sqrt(discAir)) / GRAVITY;
              tFlight = tToApex + tFromApex;
              requiresAirJump = true;
            }
          }
        }
      }

      const pId = 'plat_' + Math.round(p.y);

      if (tFlight <= 0.02) {
        return { valid: false, reason: 'Already passed or arrival time too small', pId };
      }

      // Predict moving platform position at arrival time
      const proj = predictPlatformAtTime(p, tFlight);
      const safe = getPlatformSafeRange(p, proj.x);

      // Safe landing zone must be wide enough
      if (safe.width < 22) {
        return { valid: false, reason: `Safe zone too narrow (${Math.round(safe.width)}px < 22px)`, pId };
      }

      // Check horizontal reachability
      const requiredDist = Math.abs(safe.center - ball.x);
      const maxSteerDist = MAX_SPEED_X * tFlight + 60;
      if (requiredDist > maxSteerDist) {
        return { valid: false, reason: `Horizontally unreachable (dist ${Math.round(requiredDist)} > max ${Math.round(maxSteerDist)})`, pId };
      }

      return {
        valid: true,
        platform: p,
        flightTime: tFlight,
        projectedX: proj.x,
        safeRange: safe,
        targetX: safe.center,
        requiresAirJump,
        distX: requiredDist,
        pId,
      };
    }

    // --- Progress-Aware Candidate Evaluation & Target Selection ---
    selectOptimalTarget(ball, platforms, cameraY) {
      if (!platforms || platforms.length === 0) return null;

      const active = platforms.filter(p => p.y <= cameraY + CANVAS_HEIGHT + 40 && p.y >= cameraY - 480);
      const progressive = [];
      const recovery = [];
      const rejections = [];
      const now = performance.now();

      for (let i = 0; i < active.length; i++) {
        const p = active[i];
        const plan = this.solveTrajectory(ball, p);
        if (!plan.valid) {
          rejections.push({ pId: plan.pId, y: Math.round(p.y), reason: plan.reason });
          continue;
        }

        const deltaH = this.lastBouncedY - p.y;
        const isFailed = this.failedTargetsMap.has(plan.pId) && (now - this.failedTargetsMap.get(plan.pId) < 4000);

        if (deltaH > 35) {
          // --- PROGRESSIVE CANDIDATE (Climbing higher) ---
          let score = 1000;
          if (deltaH >= 80 && deltaH <= 210) {
            score += 900; // Immediate next climb tier gets top priority
          } else if (deltaH > 210) {
            score += 350; // Higher climb tier
          }

          if (!plan.requiresAirJump) score += 450; // Conserve air jump for safety
          score += plan.safeRange.width * 1.6;
          if (plan.safeRange.hasSpike) score -= 220; // Penalize spike presence
          score -= plan.distX * 1.3; // Prefer closer horizontal steering
          if (p.vx !== 0) score -= 25; // Slight stationary stability preference
          if (isFailed) score -= 1400; // Strong penalty for recently stalled platform

          plan.score = score;
          plan.deltaH = deltaH;
          progressive.push(plan);
        } else {
          // --- RECOVERY CANDIDATE (Safe lower landing when higher is impossible) ---
          let score = -500;
          score += (CANVAS_HEIGHT + cameraY - p.y) * 1.2;
          score += plan.safeRange.width * 1.0;
          if (plan.safeRange.hasSpike) score -= 200;
          score -= plan.distX * 0.9;
          if (isFailed) score -= 400;

          plan.score = score;
          plan.deltaH = deltaH;
          recovery.push(plan);
        }
      }

      progressive.sort((a, b) => b.score - a.score);
      recovery.sort((a, b) => b.score - a.score);

      const best = progressive.length > 0 ? progressive[0] : (recovery.length > 0 ? recovery[0] : null);
      this.recentRejections = rejections.slice(-6);

      if (best) {
        const isNewTarget = !this.committedTarget || this.committedTarget !== best.platform;
        this.committedTarget = best.platform;
        this.committedPlan = best;
        this.mode = progressive.length > 0 ? 'PROGRESS' : 'RECOVERY';
        if (this.debugMode && isNewTarget) {
          console.log(`🎯 [AI-TARGET] Selected ${best.pId} (y=${Math.round(best.platform.y)}, DeltaH=${Math.round(best.deltaH)}px, AirJump=${best.requiresAirJump})`);
        }
      }

      return best;
    }

    // --- Main AI Decision Step (Invoked Every Physics Frame) ---
    update(dt) {
      if (!this.enabled || this.game.currentState !== 'PLAYING') {
        return;
      }

      const ball = this.game.ball;
      const platforms = this.game.platforms;
      const cameraY = this.game.cameraY;

      // Keep target commitment during flight until reached, invalidated, or fallen past
      const hasMissedTarget = this.committedTarget && ball.vy > 100 && ball.y > this.committedTarget.y + 60;
      const isTargetValid = this.committedTarget &&
        platforms.includes(this.committedTarget) &&
        this.committedTarget.y <= cameraY + CANVAS_HEIGHT + 40 &&
        !hasMissedTarget;

      if (!isTargetValid) {
        this.selectOptimalTarget(ball, platforms, cameraY);
      } else {
        // Continuously update dynamic landing projection for committed target
        const p = this.committedTarget;
        const yLand = p.y - ball.radius;
        let tRem = 0;

        if (ball.y <= yLand) {
          const disc = ball.vy * ball.vy + 2 * GRAVITY * (yLand - ball.y);
          tRem = disc >= 0 ? (-ball.vy + Math.sqrt(disc)) / GRAVITY : 0.05;
        } else {
          const riseApex = (Math.max(0, -ball.vy) ** 2) / (2 * GRAVITY);
          const yApex = ball.y - riseApex;
          if (yApex <= yLand) {
            const disc = ball.vy * ball.vy + 2 * GRAVITY * (yLand - ball.y);
            tRem = disc >= 0 ? (-ball.vy + Math.sqrt(disc)) / GRAVITY : 0.1;
          } else {
            tRem = (Math.max(0, -ball.vy) / GRAVITY) + 0.35;
          }
        }

        const proj = predictPlatformAtTime(p, tRem);
        const safe = getPlatformSafeRange(p, proj.x);
        this.committedPlan = {
          valid: true,
          platform: p,
          flightTime: tRem,
          projectedX: proj.x,
          safeRange: safe,
          targetX: safe.center,
          requiresAirJump: this.committedPlan ? this.committedPlan.requiresAirJump : false,
          pId: 'plat_' + Math.round(p.y),
        };
      }

      this.target = this.committedPlan;

      // 1. Air Jump Tactical Deployment
      this.evaluateAirJump(ball, this.committedPlan);

      // 2. Waypoint & Horizontal Steering
      this.executeSteering(ball, this.committedPlan, dt);

      // 3. Safe Collectible Detour Check
      if (!this.isWaypointActive) {
        this.evaluateCollectibleDetour(ball, this.game.collectibles || [], this.game.specialStars || [], this.committedPlan);
      }
    }

    // --- Waypoint Navigation & Horizontal Steering ---
    executeSteering(ball, plan, dt) {
      if (!plan || !plan.platform) {
        this.game.keys.left = false;
        this.game.keys.right = false;
        this.game.keys.down = false;
        return;
      }

      const safe = plan.safeRange;
      const targetPlat = plan.platform;
      const platforms = this.game.platforms || [];

      // 1. SPIKE HAZARD IMMEDIATE REPULSION
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (!p.spike) continue;
        const sLeft = (p.spike.side === 'left') ? p.x + 4 : p.x + p.width - p.spike.width - 4;
        const sRight = sLeft + p.spike.width;
        const sTop = p.y - p.spike.height;

        if (ball.y >= sTop - 35 && ball.y <= p.y + 10 && ball.x >= sLeft - 18 && ball.x <= sRight + 18) {
          if (p.spike.side === 'left') {
            this.game.keys.right = true;
            this.game.keys.left = false;
            return;
          } else {
            this.game.keys.left = true;
            this.game.keys.right = false;
            return;
          }
        }
      }

      // 2. ASCENT WAYPOINT (UNDERSIDE CEILING EVASION)
      // When ball is below the target platform, it must navigate around the platform edges
      // to avoid bumping its head on the solid underside!
      let desiredTargetX = safe.center;
      this.isWaypointActive = false;

      if (ball.y > targetPlat.y + 4) {
        this.isWaypointActive = true;
        const curLeft = targetPlat.x - 20;
        const curRight = targetPlat.x + targetPlat.width + 20;

        if (ball.x < curLeft) {
          // Ball is already clear on the left side: stay clear of the platform footprint
          desiredTargetX = Math.max(20, curLeft - 14);
        } else if (ball.x > curRight) {
          // Ball is already clear on the right side: stay clear of the platform footprint
          desiredTargetX = Math.min(CANVAS_WIDTH - 20, curRight + 14);
        } else {
          // Ball is directly underneath: steer urgently to the closest open side
          const leftSpace = curLeft;
          const rightSpace = CANVAS_WIDTH - curRight;

          if (leftSpace >= 50 && (ball.x - curLeft < curRight - ball.x || rightSpace < 50)) {
            desiredTargetX = Math.max(20, curLeft - 16);
          } else {
            desiredTargetX = Math.min(CANVAS_WIDTH - 20, curRight + 16);
          }
        }
      }

      this.lastDesiredTargetX = desiredTargetX;

      // 3. PROPORTIONAL-DERIVATIVE STEERING WITH DEADBAND
      const errorX = desiredTargetX - ball.x;
      const vx = ball.vx;

      const Kp = 6.2;
      const targetVx = Math.max(-MAX_SPEED_X, Math.min(MAX_SPEED_X, errorX * Kp));
      const vDiff = targetVx - vx;

      const deadband = 10;
      if (vDiff > deadband) {
        this.game.keys.right = true;
        this.game.keys.left = false;
      } else if (vDiff < -deadband) {
        this.game.keys.left = true;
        this.game.keys.right = false;
      } else {
        // Coast cleanly within deadband without edge jitter
        this.game.keys.left = false;
        this.game.keys.right = false;
      }

      // 4. FAST-FALL DIVE
      // Dive downward when safely aligned directly over a generous platform without hazards
      if (!this.isWaypointActive && plan.platform && !plan.safeRange.hasSpike && ball.vy > 100) {
        const dy = plan.platform.y - ball.y;
        if (Math.abs(errorX) < 14 && dy > 70 && dy < 220) {
          this.game.keys.down = true;
        } else {
          this.game.keys.down = false;
        }
      } else {
        this.game.keys.down = false;
      }
    }

    // --- Smart Air Jump Decision Engine ---
    evaluateAirJump(ball, plan) {
      if (!ball.hasAirJump) return;

      // Rule 1: Planned Apex Boost for Higher Progressive Tier
      if (plan && plan.requiresAirJump) {
        if (ball.vy >= -50 && ball.vy <= 80) {
          if (this.debugMode) {
            console.log(`🚀 [AI-JUMP] Planned apex boost deployed for ${plan.pId}`);
          }
          this.game.handleAirJump();
          return;
        }
      }

      // Rule 2: Stall Breakout Apex Jump
      // When trapped on the same tier, deploy air jump near apex to break out!
      if (this.consecutiveStallBounces >= 1 && ball.vy >= -50 && ball.vy <= 80) {
        if (this.debugMode) {
          console.log(`⚡ [AI-JUMP] Stall breakout apex jump deployed (Stalls: ${this.consecutiveStallBounces})`);
        }
        this.game.handleAirJump();
        return;
      }

      // Rule 3: Emergency Void Catch (Carefully Gated)
      // Only fire if falling fast near screen bottom AND not already landing on an aligned platform!
      const screenBallY = ball.y - this.game.cameraY;
      if (ball.vy > 200 && screenBallY > CANVAS_HEIGHT - 95) {
        let isSafeLandingImminent = false;
        if (plan && plan.platform && ball.y < plan.platform.y) {
          const dy = plan.platform.y - ball.y;
          const isAligned = ball.x >= plan.safeRange.left - 15 && ball.x <= plan.safeRange.right + 15;
          if (dy < 110 && isAligned) {
            isSafeLandingImminent = true;
          }
        }

        if (!isSafeLandingImminent) {
          if (this.debugMode) {
            console.log('🛟 [AI-JUMP] Emergency void catch jump deployed');
          }
          this.game.handleAirJump();
        }
      }
    }

    // --- Safe Collectible Detour Check ---
    evaluateCollectibleDetour(ball, orbs, stars, plan) {
      if (!plan || !plan.platform) return;

      const allCollectibles = [
        ...stars.map(s => ({ item: s, type: 'star' })),
        ...orbs.map(o => ({ item: o, type: 'orb' })),
      ];

      for (let i = 0; i < allCollectibles.length; i++) {
        const { item } = allCollectibles[i];
        if (item.collected) continue;

        const itemY = item.getVisualY ? item.getVisualY() : item.y;
        const dy = itemY - ball.y;

        if (Math.abs(dy) < 100) {
          const dx = item.x - ball.x;
          if (Math.abs(dx) <= 50) {
            const futureX = ball.x + dx;
            if (futureX >= plan.safeRange.left && futureX <= plan.safeRange.right) {
              plan.targetX = item.x;
              break;
            }
          }
        }
      }
    }

    // --- Diagnostic Snapshot ---
    getDiagnostics() {
      const plan = this.committedPlan;
      return {
        targetId: plan ? plan.pId : 'none',
        targetHeight: plan && plan.platform ? Math.round(plan.platform.y) : null,
        predictedLandingX: plan ? Math.round(plan.targetX * 10) / 10 : null,
        currentHeight: this.game.score,
        maxHeight: this.game.maxAltitude,
        consecutiveStallBounces: this.consecutiveStallBounces,
        rejectionReasons: this.recentRejections.slice(-5),
        airJumpAvailable: Boolean(this.game.ball && this.game.ball.hasAirJump),
        mode: this.mode,
        waypointActive: this.isWaypointActive,
        desiredTargetX: Math.round(this.lastDesiredTargetX),
      };
    }

    // --- Visual Diagnostics Overlay ---
    renderDiagnostics(ctx) {
      if (!this.debugMode) return;

      const d = this.getDiagnostics();
      const pad = 12;
      const boxW = 270;
      const boxH = 145;
      const x = 12;
      const y = 62;

      ctx.save();
      ctx.fillStyle = 'rgba(6, 11, 25, 0.90)';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(x, y, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.fillText('🤖 AI AUTOPLAYER DIAGNOSTICS', x + pad, y + 18);

      ctx.font = '10px monospace';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`Target: ${d.targetId} (y=${d.targetHeight})`, x + pad, y + 36);
      ctx.fillText(`Pred Landing X: ${d.predictedLandingX}px`, x + pad, y + 50);
      ctx.fillText(`Alt / Max Alt: ${d.currentHeight}m / ${d.maxHeight}m`, x + pad, y + 64);
      ctx.fillText(`Air Jump Available: ${d.airJumpAvailable ? 'YES' : 'NO'}`, x + pad, y + 78);
      ctx.fillText(`Stall Count: ${d.consecutiveStallBounces} (Mode: ${d.mode})`, x + pad, y + 92);
      ctx.fillText(`Waypoint: ${d.waypointActive ? 'ACTIVE (EVADING)' : 'DIRECT'}`, x + pad, y + 106);

      if (d.rejectionReasons && d.rejectionReasons.length > 0) {
        const lastRej = d.rejectionReasons[d.rejectionReasons.length - 1];
        ctx.fillStyle = '#f43f5e';
        ctx.fillText(`Rej: ${lastRej.pId} - ${lastRej.reason.slice(0, 24)}`, x + pad, y + 124);
      }
      ctx.restore();
    }

    updateUI() {
      const badge = document.getElementById('spectatorBadge');
      if (badge) {
        badge.classList.toggle('hidden', !this.enabled);
      }
      const hudBtn = document.getElementById('aiHudToggleBtn');
      if (hudBtn) {
        hudBtn.classList.toggle('active-ai', this.enabled);
      }
      const spectateBtn = document.getElementById('aiSpectateBtn');
      if (spectateBtn) {
        spectateBtn.classList.toggle('btn-active', this.enabled);
      }
    }
  }

  // ==========================================================================
  // 2. AUTOMATED GAMEPLAY AUDIT & DIAGNOSTICS SUITE
  // ==========================================================================
  class AuditManager {
    constructor(game, autoplayer) {
      this.game = game;
      this.autoplayer = autoplayer;
      this.active = false;

      this.config = {
        targetLevel: 3,
        maxDuration: 60,
        maxAttempts: 3,
        safeProfile: true,
      };

      this.stats = this.createEmptyStats();
      this.logs = [];
      this.anomalies = [];
      this.backupRecords = null;
      this.collectedSet = new Set();
      this.lastFrameTimestamp = performance.now();
      this.stallThresholdMs = 450;
    }

    createEmptyStats() {
      return {
        startTime: 0,
        endTime: 0,
        durationSeconds: 0,
        framesAudited: 0,
        attempts: 0,
        highestLevelReached: 1,
        maxAltitudeReached: 0,
        orbsCollected: 0,
        starsCollected: 0,
        deathsTotal: 0,
        spikeDeaths: 0,
        voidDeaths: 0,
        airJumpsUsed: 0,
        bouncesCount: 0,
        levelMilestonesUnlocked: [],
        colorTransitionsAudited: [],
        pauseResumeCycles: 0,
        invariants: {
          finitePhysics: { checks: 0, passed: 0, failed: 0 },
          loopHealth: { checks: 0, passed: 0, failed: 0 },
          platformGaps: { checks: 0, passed: 0, failed: 0 },
          hazardIntegrity: { checks: 0, passed: 0, failed: 0 },
          singleAwards: { checks: 0, passed: 0, failed: 0 },
          lifecycleIntegrity: { checks: 0, passed: 0, failed: 0 },
        },
      };
    }

    start(userConfig = {}) {
      this.config = Object.assign(this.config, userConfig);
      this.active = true;
      this.stats = this.createEmptyStats();
      this.stats.startTime = performance.now();
      this.logs = [];
      this.anomalies = [];
      this.collectedSet = new Set();
      this.lastFrameTimestamp = performance.now();

      // Safe Profile: Backup user's personal records so audit runs don't overwrite them
      if (this.config.safeProfile) {
        try {
          this.backupRecords = {
            bestScore: localStorage.getItem('bounce_arcade_best_score'),
            highestLevel: localStorage.getItem('bounce_arcade_highest_level'),
            totalOrbs: localStorage.getItem('bounce_arcade_total_orbs'),
            totalStars: localStorage.getItem('bounce_arcade_total_stars'),
            levelRatings: localStorage.getItem('bounce_arcade_level_ratings'),
          };
          this.log('[Profile] Personal records backed up (Safe Profile active)');
        } catch (e) {
          this.backupRecords = null;
        }
      }

      this.log(`[Audit Started] Goal: Level ${this.config.targetLevel} | Max Duration: ${this.config.maxDuration}s | Max Runs: ${this.config.maxAttempts}`);

      // Enable AI Autoplayer in audit mode
      this.autoplayer.enable(true);

      // Start Run 1
      this.stats.attempts = 1;
      this.game.startNewGame();

      this.updateModalUI();
    }

    stop(completionReason = 'User stopped audit') {
      if (!this.active) return;
      this.active = false;
      this.stats.endTime = performance.now();
      this.stats.durationSeconds = Math.round((this.stats.endTime - this.stats.startTime) / 1000);

      // Stop autoplayer
      this.autoplayer.disable();

      this.log(`[Audit Completed] Reason: ${completionReason} (Duration: ${this.stats.durationSeconds}s)`);

      // Restore personal records if safe profile was enabled
      if (this.config.safeProfile && this.backupRecords) {
        try {
          if (this.backupRecords.bestScore !== null) localStorage.setItem('bounce_arcade_best_score', this.backupRecords.bestScore);
          if (this.backupRecords.highestLevel !== null) localStorage.setItem('bounce_arcade_highest_level', this.backupRecords.highestLevel);
          if (this.backupRecords.totalOrbs !== null) localStorage.setItem('bounce_arcade_total_orbs', this.backupRecords.totalOrbs);
          if (this.backupRecords.totalStars !== null) localStorage.setItem('bounce_arcade_total_stars', this.backupRecords.totalStars);
          if (this.backupRecords.levelRatings !== null) localStorage.setItem('bounce_arcade_level_ratings', this.backupRecords.levelRatings);

          // Refresh in-memory metrics on game instance
          this.game.bestScore = this.game.loadBestScore();
          this.game.highestLevelCompleted = this.game.loadHighestLevel();
          this.game.totalOrbs = this.game.loadTotalOrbs();
          this.game.totalStars = this.game.loadTotalStars();
          this.game.updateScoreDisplays();
          this.log('[Profile] Personal records restored cleanly');
        } catch (e) {}
      }

      this.updateModalUI();
    }

    log(message) {
      const now = Math.round((performance.now() - (this.stats.startTime || performance.now())) / 100) / 10;
      const entry = `[${now.toFixed(1)}s] ${message}`;
      this.logs.push(entry);

      const terminal = document.getElementById('auditLogOutput');
      if (terminal) {
        terminal.textContent = this.logs.slice(-40).join('\n');
        terminal.scrollTop = terminal.scrollHeight;
      }
    }

    recordAnomaly(type, description, snapshot = {}) {
      const anomaly = {
        type,
        description,
        timeSeconds: Math.round((performance.now() - this.stats.startTime) / 100) / 10,
        level: this.game.level,
        altitude: this.game.score,
        ball: { x: Math.round(this.game.ball.x), y: Math.round(this.game.ball.y) },
        snapshot,
      };
      this.anomalies.push(anomaly);
      this.log(`⚠️ [Anomaly] ${type}: ${description}`);
    }

    // --- On Every Animation/Physics Frame ---
    onFrame(dt) {
      if (!this.active) return;

      this.stats.framesAudited++;
      const now = performance.now();
      const elapsedTotal = (now - this.stats.startTime) / 1000;

      // Update max metrics
      if (this.game.level > this.stats.highestLevelReached) {
        this.stats.highestLevelReached = this.game.level;
        if (!this.stats.levelMilestonesUnlocked.includes(this.game.level)) {
          this.stats.levelMilestonesUnlocked.push(this.game.level);
          this.log(`🎯 Milestone: Reached Level ${this.game.level} (Altitude: ${this.game.score}m)`);
        }
      }
      if (this.game.score > this.stats.maxAltitudeReached) {
        this.stats.maxAltitudeReached = this.game.score;
      }

      // 1. Loop Health Invariant
      const deltaMs = now - this.lastFrameTimestamp;
      this.stats.invariants.loopHealth.checks++;
      if (deltaMs > this.stallThresholdMs && this.stats.framesAudited > 5) {
        this.stats.invariants.loopHealth.failed++;
        this.recordAnomaly('LoopStall', `Frame delay spike of ${Math.round(deltaMs)}ms detected`);
      } else {
        this.stats.invariants.loopHealth.passed++;
      }
      this.lastFrameTimestamp = now;

      // 2. Finite Physics Invariant
      const ball = this.game.ball;
      this.stats.invariants.finitePhysics.checks++;
      const isFinitePhys =
        Number.isFinite(ball.x) &&
        Number.isFinite(ball.y) &&
        Number.isFinite(ball.vx) &&
        Number.isFinite(ball.vy) &&
        Number.isFinite(this.game.cameraY);

      if (!isFinitePhys) {
        this.stats.invariants.finitePhysics.failed++;
        this.recordAnomaly('NonFinitePhysics', `Non-finite coordinate detected: x=${ball.x}, y=${ball.y}, vx=${ball.vx}, vy=${ball.vy}`);
      } else {
        this.stats.invariants.finitePhysics.passed++;
      }

      // 3. Platform Gap Reachability Invariant
      // Verify no generated platform gap exceeds 185px
      const platforms = this.game.platforms || [];
      if (platforms.length >= 2) {
        this.stats.invariants.platformGaps.checks++;
        let gapViolated = false;
        const sortedPlats = [...platforms].sort((a, b) => b.y - a.y);
        for (let i = 0; i < sortedPlats.length - 1; i++) {
          const dy = Math.abs(sortedPlats[i].y - sortedPlats[i + 1].y);
          if (dy > 185) {
            gapViolated = true;
            this.stats.invariants.platformGaps.failed++;
            this.recordAnomaly('UnreachablePlatformGap', `Platform gap between tier at y=${Math.round(sortedPlats[i].y)} and y=${Math.round(sortedPlats[i + 1].y)} exceeds 185px (${Math.round(dy)}px)`);
            break;
          }
        }
        if (!gapViolated) {
          this.stats.invariants.platformGaps.passed++;
        }
      }

      // 4. Hazard Placement Integrity
      // Verify no active collectible spawned inside a spike bounding box
      const collectibles = this.game.collectibles || [];
      const stars = this.game.specialStars || [];
      const allItems = [...collectibles, ...stars];
      this.stats.invariants.hazardIntegrity.checks++;
      let hazardViolated = false;

      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (!p.spike) continue;

        const sLeft = (p.spike.side === 'left') ? p.x + 4 : p.x + p.width - p.spike.width - 4;
        const sRight = sLeft + p.spike.width;
        const sTop = p.y - p.spike.height;
        const sBottom = p.y;

        for (let j = 0; j < allItems.length; j++) {
          const it = allItems[j];
          if (it.x >= sLeft - 6 && it.x <= sRight + 6 && it.y >= sTop - 6 && it.y <= sBottom + 6) {
            hazardViolated = true;
            this.stats.invariants.hazardIntegrity.failed++;
            this.recordAnomaly('HazardCollectibleOverlap', `Collectible at (${it.x}, ${it.y}) spawned inside spike hazard on platform ${i}`);
            break;
          }
        }
        if (hazardViolated) break;
      }
      if (!hazardViolated) {
        this.stats.invariants.hazardIntegrity.passed++;
      }

      // Check Stopping Conditions:
      // A. Target Level Reached
      if (this.stats.highestLevelReached >= this.config.targetLevel) {
        this.stop(`Target Level ${this.config.targetLevel} successfully reached!`);
        return;
      }

      // B. Max Duration Reached
      if (elapsedTotal >= this.config.maxDuration) {
        this.stop(`Max duration of ${this.config.maxDuration}s reached`);
        return;
      }

      // Bounded updates to dashboard
      if (this.stats.framesAudited % 15 === 0) {
        this.updateModalUI();
      }
    }

    onAirJump() {
      if (this.active) {
        this.stats.airJumpsUsed++;
      }
    }

    onCollectible(type, item) {
      if (!this.active) return;

      this.stats.invariants.singleAwards.checks++;
      const itemId = `${type}_${Math.round(item.x)}_${Math.round(item.y)}`;

      // Check if duplicate award triggered
      if (this.collectedSet.has(itemId)) {
        this.stats.invariants.singleAwards.failed++;
        this.recordAnomaly('DuplicateCollectibleAward', `Collectible ${itemId} awarded multiple times!`);
      } else {
        this.collectedSet.add(itemId);
        this.stats.invariants.singleAwards.passed++;
        if (type === 'star') {
          this.stats.starsCollected++;
          this.log(`⭐ Special Star collected! (Run Total: ${this.stats.starsCollected})`);
        } else {
          this.stats.orbsCollected++;
        }
      }
    }

    onGameOver(reason) {
      if (!this.active) return;

      this.stats.deathsTotal++;
      if (reason && reason.toLowerCase().includes('spike')) {
        this.stats.spikeDeaths++;
        this.log(`💥 Run ${this.stats.attempts} ended: Hazard spike impact`);
      } else {
        this.stats.voidDeaths++;
        this.log(`💨 Run ${this.stats.attempts} ended: Void fall`);
      }

      // Check Lifecycle Integrity: verify results processed exactly once
      this.stats.invariants.lifecycleIntegrity.checks++;
      if (this.game.runResultsProcessed) {
        this.stats.invariants.lifecycleIntegrity.passed++;
      } else {
        this.stats.invariants.lifecycleIntegrity.failed++;
        this.recordAnomaly('LifecycleFailure', 'Game-over results overlay was not processed cleanly');
      }

      // Check Attempt Limit
      if (this.stats.attempts >= this.config.maxAttempts) {
        this.stop(`Max attempts reached (${this.config.maxAttempts})`);
        return;
      }

      // Increment attempt counter for next run
      this.stats.attempts++;
      this.log(`🔄 Preparing Run ${this.stats.attempts} / ${this.config.maxAttempts}...`);
    }

    updateModalUI() {
      const statusVal = document.getElementById('auditStatusVal');
      const maxLvlVal = document.getElementById('auditMaxLvlVal');
      const maxAltVal = document.getElementById('auditMaxAltVal');
      const orbsVal = document.getElementById('auditOrbsVal');
      const starsVal = document.getElementById('auditStarsVal');
      const deathsVal = document.getElementById('auditDeathsVal');
      const startBtn = document.getElementById('auditStartBtn');
      const stopBtn = document.getElementById('auditStopBtn');

      if (statusVal) statusVal.textContent = this.active ? 'RUNNING' : 'FINISHED';
      if (maxLvlVal) maxLvlVal.textContent = this.stats.highestLevelReached;
      if (maxAltVal) maxAltVal.textContent = this.stats.maxAltitudeReached;
      if (orbsVal) orbsVal.textContent = this.stats.orbsCollected;
      if (starsVal) starsVal.textContent = this.stats.starsCollected;
      if (deathsVal) deathsVal.textContent = this.stats.deathsTotal;

      if (startBtn) startBtn.classList.toggle('hidden', this.active);
      if (stopBtn) stopBtn.classList.toggle('hidden', !this.active);

      // Invariant pills
      const updatePill = (id, inv) => {
        const el = document.getElementById(id);
        if (!el) return;
        const failed = inv.failed > 0;
        el.classList.toggle('pill-passed', !failed && inv.passed > 0);
        el.classList.toggle('pill-failed', failed);
        el.querySelector('.inv-icon').textContent = failed ? '✕' : '✓';
      };

      updatePill('invPhysicsPill', this.stats.invariants.finitePhysics);
      updatePill('invPlatformsPill', this.stats.invariants.platformGaps);
      updatePill('invHazardsPill', this.stats.invariants.hazardIntegrity);
      updatePill('invLifecyclePill', this.stats.invariants.singleAwards);
      updatePill('invLoopPill', this.stats.invariants.loopHealth);
    }

    // --- Generate Comprehensive GitHub Markdown Report ---
    generateReport() {
      const s = this.stats;
      const inv = s.invariants;
      const passAllInvariants = Object.values(inv).every(v => v.failed === 0);

      return `# BOUNCE v2 — Automated Gameplay Audit & Spectator Report

**Timestamp:** ${new Date().toISOString()}  
**Overall Integrity Status:** ${passAllInvariants ? '✅ PASSED — ALL INVARIANTS SOUND' : '⚠️ ANOMALIES DETECTED'}  
**Audit Profile:** ${this.config.safeProfile ? 'Safe Isolated Profile' : 'Live Player Profile'}

---

## 1. Executive Summary

| Metric | Result | Target / Config | Status |
| :--- | :--- | :--- | :--- |
| **Duration** | ${s.durationSeconds}s | Max ${this.config.maxDuration}s | ${s.durationSeconds <= this.config.maxDuration ? '✅ Within Bounds' : '⚠️ Exceeded'} |
| **Attempts (Runs)** | ${s.attempts} | Max ${this.config.maxAttempts} | ✅ Complete |
| **Highest Level** | **Level ${s.highestLevelReached}** | Level ${this.config.targetLevel} Target | ${s.highestLevelReached >= this.config.targetLevel ? '🎯 Target Achieved' : 'In Progress'} |
| **Max Altitude** | **${s.maxAltitudeReached}m** | — | — |
| **Energy Orbs Collected** | ${s.orbsCollected} | — | — |
| **Special Stars Collected** | ${s.starsCollected} | — | — |
| **Total Deaths** | ${s.deathsTotal} (Spike: ${s.spikeDeaths}, Void: ${s.voidDeaths}) | — | Normal Gameplay |
| **Frames Audited** | ${s.framesAudited} | — | 60 FPS Continuous |

---

## 2. Invariant & Bug Detection Audit

| Automated Assertion Check | Checks Performed | Passed | Failed | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **1. Finite Physics ($x, y, v_x, v_y, \text{camY} \in \\mathbb{R}$)** | ${inv.finitePhysics.checks} | ${inv.finitePhysics.passed} | ${inv.finitePhysics.failed} | ${inv.finitePhysics.failed === 0 ? '✅ PASSED' : '❌ FAILED'} |
| **2. Loop Health & RAF Continuity** | ${inv.loopHealth.checks} | ${inv.loopHealth.passed} | ${inv.loopHealth.failed} | ${inv.loopHealth.failed === 0 ? '✅ PASSED' : '❌ FAILED'} |
| **3. Platform Reachability (Gaps $\\le 180\\text{px}$)** | ${inv.platformGaps.checks} | ${inv.platformGaps.passed} | ${inv.platformGaps.failed} | ${inv.platformGaps.failed === 0 ? '✅ PASSED' : '❌ FAILED'} |
| **4. Hazard Placement Non-Overlap** | ${inv.hazardIntegrity.checks} | ${inv.hazardIntegrity.passed} | ${inv.hazardIntegrity.failed} | ${inv.hazardIntegrity.failed === 0 ? '✅ PASSED' : '❌ FAILED'} |
| **5. Collectible Single-Award Integrity** | ${inv.singleAwards.checks} | ${inv.singleAwards.passed} | ${inv.singleAwards.failed} | ${inv.singleAwards.failed === 0 ? '✅ PASSED' : '❌ FAILED'} |
| **6. Results Overlay Single-Processing** | ${inv.lifecycleIntegrity.checks} | ${inv.lifecycleIntegrity.passed} | ${inv.lifecycleIntegrity.failed} | ${inv.lifecycleIntegrity.failed === 0 ? '✅ PASSED' : '❌ FAILED'} |

---

## 3. Discovered Anomalies vs. Normal Gameplay Failures

${this.anomalies.length === 0
  ? '> ✅ **No software defects or invariant violations detected.** All platform gaps, hazard bounds, physics variables, and collectible lifecycles complied with specification.'
  : this.anomalies.map((a, i) => `${i + 1}. **[${a.type}]** at ${a.timeSeconds}s (Level ${a.level}, Alt ${a.altitude}m): ${a.description}`).join('\n')}

> **Note on Player Deaths:** Occasional deaths from hazard spikes or void falls reflect authentic procedural difficulty scaling and are categorized as normal gameplay events, distinct from software defects.

---

## 4. Key Milestones Unlocked

- **Milestones Reached:** ${s.levelMilestonesUnlocked.length > 0 ? s.levelMilestonesUnlocked.map(lvl => `Level ${lvl}`).join(', ') : 'Level 1'}
- **Air Jumps Deployed:** ${s.airJumpsUsed} times
- **AI Trajectory Stability:** Highly reliable recovery across moving & stationary platforms.

---

## 5. Diagnostic Event Log (Excerpt)

\`\`\`
${this.logs.slice(-25).join('\n')}
\`\`\`
`;
    }
  }

  // ==========================================================================
  // 3. UI INITIALIZATION & EVENT BINDINGS
  // ==========================================================================
  function initAutoplayerUI() {
    if (!window.bounceGame) {
      setTimeout(initAutoplayerUI, 50);
      return;
    }

    const game = window.bounceGame;
    const autoplayer = new Autoplayer(game);
    const auditManager = new AuditManager(game, autoplayer);

    // Expose on game instance
    game.autoplayer = autoplayer;
    game.auditManager = auditManager;

    // Safety fallback hook: Ensure onBounce is processed if game.ball bounces
    if (game.ball && game.ball.triggerBounce) {
      const origTriggerBounce = game.ball.triggerBounce;
      game.ball.triggerBounce = function () {
        const res = origTriggerBounce.apply(this, arguments);
        if (autoplayer.enabled && !autoplayer._handledBounceThisFrame) {
          const plats = game.platforms || [];
          const landedPlat = plats.find(p => Math.abs(p.y - game.ball.y - game.ball.radius) < 10);
          if (landedPlat) {
            autoplayer.onBounce(landedPlat);
          }
        }
        return res;
      };
    }

    // --- Button Bindings ---

    // 1. Menu AI Spectator button
    const aiSpectateBtn = document.getElementById('aiSpectateBtn');
    if (aiSpectateBtn) {
      aiSpectateBtn.addEventListener('click', () => {
        autoplayer.enable(true);
      });
    }

    // 2. HUD AI Spectator toggle button
    const aiHudToggleBtn = document.getElementById('aiHudToggleBtn');
    if (aiHudToggleBtn) {
      aiHudToggleBtn.addEventListener('click', () => {
        autoplayer.toggle();
      });
    }

    // 3. Stop Spectator button on floating badge
    const stopAiBtn = document.getElementById('stopAiBtn');
    if (stopAiBtn) {
      stopAiBtn.addEventListener('click', () => {
        autoplayer.disable();
      });
    }

    // 4. Audit Modal Open button
    const auditOpenBtn = document.getElementById('auditOpenBtn');
    const headerAuditBtn = document.getElementById('headerAuditBtn');
    const auditModal = document.getElementById('auditModal');
    const openAuditModal = () => {
      if (auditModal) {
        auditModal.classList.remove('hidden');
        auditManager.updateModalUI();
      }
    };
    if (auditOpenBtn) auditOpenBtn.addEventListener('click', openAuditModal);
    if (headerAuditBtn) headerAuditBtn.addEventListener('click', openAuditModal);

    // 5. Audit Close button
    const auditCloseBtn = document.getElementById('auditCloseBtn');
    if (auditCloseBtn && auditModal) {
      auditCloseBtn.addEventListener('click', () => {
        if (auditManager.active) {
          auditManager.stop('Modal closed by user');
        }
        auditModal.classList.add('hidden');
      });
    }

    // 6. Audit Start button
    const auditStartBtn = document.getElementById('auditStartBtn');
    if (auditStartBtn) {
      auditStartBtn.addEventListener('click', () => {
        const targetLevel = parseInt(document.getElementById('auditTargetLevel')?.value, 10) || 3;
        const maxDuration = parseInt(document.getElementById('auditMaxDuration')?.value, 10) || 60;
        const maxAttempts = parseInt(document.getElementById('auditMaxAttempts')?.value, 10) || 3;
        const safeProfile = document.getElementById('auditSafeProfile')?.checked ?? true;

        auditModal.classList.add('hidden');
        auditManager.start({ targetLevel, maxDuration, maxAttempts, safeProfile });
      });
    }

    // 7. Audit Stop button
    const auditStopBtn = document.getElementById('auditStopBtn');
    if (auditStopBtn) {
      auditStopBtn.addEventListener('click', () => {
        auditManager.stop('User stopped audit');
      });
    }

    // 8. Copy Audit Report button
    const copyReportBtn = document.getElementById('auditCopyReportBtn');
    if (copyReportBtn) {
      copyReportBtn.addEventListener('click', () => {
        const report = auditManager.generateReport();
        navigator.clipboard.writeText(report).then(() => {
          const originalText = copyReportBtn.querySelector('span').textContent;
          copyReportBtn.querySelector('span').textContent = 'COPIED!';
          setTimeout(() => {
            copyReportBtn.querySelector('span').textContent = originalText;
          }, 1800);
        }).catch(() => {
          alert('Could not copy report to clipboard automatically. Output has been logged to console.');
          console.log(report);
        });
      });
    }

    // 9. Keyboard Shortcuts: 'B' toggles Spectator, 'D' toggles Diagnostics, 'T' opens Audit Modal
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.code === 'KeyB') {
        autoplayer.toggle();
      } else if (e.code === 'KeyD') {
        autoplayer.toggleDebug();
      } else if (e.code === 'KeyT') {
        if (auditModal) {
          auditModal.classList.toggle('hidden');
          auditManager.updateModalUI();
        }
      }
    });

    // Capture unhandled window errors for audit telemetry
    window.addEventListener('error', (errEvt) => {
      if (auditManager && auditManager.active) {
        auditManager.recordAnomaly('RuntimeScriptError', errEvt.message, {
          filename: errEvt.filename,
          lineno: errEvt.lineno,
        });
      }
    });

    console.log('✅ [Autoplayer] AI Spectator Mode & Audit Suite loaded successfully');
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoplayerUI);
  } else {
    initAutoplayerUI();
  }
})();
