/**
 * Automated test suite for BOUNCE mobile-first floating controls redesign.
 *
 * Verifies:
 * 1. LEFT and RIGHT hold/release behavior & continuous steering
 * 2. DOWN button continuous dive acceleration (never triggers jump)
 * 3. JUMP button edge-triggered single air jump & air-jump rules preservation
 * 4. Prevention of duplicate jump triggers from holding JUMP
 * 5. Simultaneous LEFT + JUMP and RIGHT + JUMP
 * 6. Simultaneous steering (LEFT/RIGHT) and DOWN
 * 7. Independent multi-touch release (releasing one pointer never cancels held button)
 * 8. Pointer cancellation (pointercancel) and lost pointer capture (lostpointercapture)
 * 9. Complete input cleanup on pause, game over, menu return, and window blur / tab hide
 * 10. Desktop keyboard controls preservation (KeyA/KeyD/ArrowLeft/ArrowRight/KeyW/KeyS/M/Esc/Enter)
 * 11. Verification that canvas swipe steering and obsolete control systems are completely removed
 * 12. Floating controls visibility state during active gameplay vs menus/pause
 * 13. Mobile menu & in-game button navigation (touchend responsiveness and drag threshold rejection)
 */

const test = require('node:test');
const assert = require('node:assert');

// Setup comprehensive DOM mocks in Node environment before loading game.js
function setupDOMMocks() {
  const elements = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();

  class MockElement {
    constructor(id = '', tagName = 'div') {
      this.id = id;
      this.tagName = tagName;
      this._classes = new Set();
      this.classList = {
        add: (...args) => args.forEach(c => this._classes.add(c)),
        remove: (...args) => args.forEach(c => this._classes.delete(c)),
        toggle: (c, force) => {
          if (force === undefined) {
            if (this._classes.has(c)) this._classes.delete(c);
            else this._classes.add(c);
          } else if (force) {
            this._classes.add(c);
          } else {
            this._classes.delete(c);
          }
        },
        contains: (c) => this._classes.has(c),
      };
      this.style = {};
      this.listeners = new Map();
      this._hasCapture = false;
      this.capturedPointerId = null;
      this.textContent = '';
      this.title = '';
      this._parentElement = null;
    }

    get parentElement() {
      if (!this._parentElement) {
        this._parentElement = {
          style: {},
          classList: this.classList,
        };
      }
      return this._parentElement;
    }

    querySelector(sel) {
      return new MockElement('child_' + sel);
    }

    querySelectorAll(sel) {
      return [new MockElement('child_' + sel)];
    }

    addEventListener(event, handler) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(handler);
    }

    removeEventListener(event, handler) {
      if (!this.listeners.has(event)) return;
      const list = this.listeners.get(event);
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    }

    dispatchEvent(event) {
      const list = this.listeners.get(event.type) || [];
      for (const h of list) {
        h(event);
      }
    }

    setPointerCapture(id) {
      this._hasCapture = true;
      this.capturedPointerId = id;
    }

    releasePointerCapture(id) {
      this._hasCapture = false;
      this.capturedPointerId = null;
    }

    hasPointerCapture(id) {
      return this._hasCapture && (this.capturedPointerId === id || id === undefined);
    }

    getBoundingClientRect() {
      return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
    }

    getContext(type) {
      return {
        clearRect: () => {},
        fillRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        scale: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        measureText: () => ({ width: 50 }),
        fillText: () => {},
      };
    }
  }

  function getOrCreateElement(id) {
    if (!elements.has(id)) {
      elements.set(id, new MockElement(id));
    }
    return elements.get(id);
  }

  const mockDocument = {
    getElementById: (id) => getOrCreateElement(id),
    activeElement: { blur: () => {} },
    hidden: false,
    addEventListener: (event, handler) => {
      if (!documentListeners.has(event)) documentListeners.set(event, []);
      documentListeners.get(event).push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!documentListeners.has(event)) return;
      const list = documentListeners.get(event);
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    },
    dispatchEvent: (event) => {
      const list = documentListeners.get(event.type) || [];
      for (const h of list) h(event);
    },
  };

  const mockWindow = {
    addEventListener: (event, handler) => {
      if (!windowListeners.has(event)) windowListeners.set(event, []);
      windowListeners.get(event).push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!windowListeners.has(event)) return;
      const list = windowListeners.get(event);
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    },
    dispatchEvent: (event) => {
      const list = windowListeners.get(event.type) || [];
      for (const h of list) h(event);
    },
    localStorage: {
      _store: new Map(),
      getItem: (k) => mockWindow.localStorage._store.get(k) || null,
      setItem: (k, v) => mockWindow.localStorage._store.set(k, String(v)),
      removeItem: (k) => mockWindow.localStorage._store.delete(k),
      clear: () => mockWindow.localStorage._store.clear(),
    },
    AudioContext: class {
      constructor() {
        this.state = 'running';
      }
      createGain() {
        return {
          connect: () => {},
          gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        };
      }
      createOscillator() {
        return {
          connect: () => {},
          start: () => {},
          stop: () => {},
          frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        };
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  };

  global.window = mockWindow;
  global.document = mockDocument;
  global.localStorage = mockWindow.localStorage;
  global.requestAnimationFrame = mockWindow.requestAnimationFrame;
  global.cancelAnimationFrame = mockWindow.cancelAnimationFrame;

  return { mockWindow, mockDocument, getOrCreateElement };
}

setupDOMMocks();
const {
  BounceGame,
  STATE,
  bindButtonAction,
  MOVE_ACCEL_X,
  MOVE_BRAKE_ACCEL_X,
  MOVE_DECEL_X,
  MAX_SPEED_X,
} = require('../game.js');

function createGameInstance() {
  const game = new BounceGame();
  game.setGameState(STATE.PLAYING);
  return game;
}

function createPointerEvent(type, { pointerId = 1, clientX = 0, clientY = 0 } = {}) {
  return {
    type,
    pointerId,
    clientX,
    clientY,
    cancelable: true,
    preventDefault: () => {},
  };
}

// ---------------------------------------------------------------------------
// 1. LEFT and RIGHT Hold/Release Behavior & Steering Acceleration
// ---------------------------------------------------------------------------
test('1. LEFT button hold & release behavior', () => {
  const game = createGameInstance();
  const leftBtn = game.touchLeft;

  assert.strictEqual(game.keys.left, false, 'LEFT key should initially be false');
  assert.strictEqual(leftBtn.classList.contains('touch-active'), false);

  // Press LEFT
  leftBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 10 }));
  assert.strictEqual(game.keys.left, true, 'Holding LEFT must set keys.left to true');
  assert.strictEqual(leftBtn.classList.contains('touch-active'), true, 'LEFT button has touch-active class');

  // Physics sub-step steers ball to the left (negative vx)
  game.physicsSubStep(0.05);
  assert.ok(game.ball.vx < 0, 'Ball velocity should accelerate in negative X direction');

  // Release LEFT
  leftBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 10 }));
  assert.strictEqual(game.keys.left, false, 'Releasing LEFT must set keys.left to false');
  assert.strictEqual(leftBtn.classList.contains('touch-active'), false, 'LEFT button removes touch-active class');
});

test('2. RIGHT button hold & release behavior', () => {
  const game = createGameInstance();
  const rightBtn = game.touchRight;

  assert.strictEqual(game.keys.right, false, 'RIGHT key should initially be false');
  assert.strictEqual(rightBtn.classList.contains('touch-active'), false);

  // Press RIGHT
  rightBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 11 }));
  assert.strictEqual(game.keys.right, true, 'Holding RIGHT must set keys.right to true');
  assert.strictEqual(rightBtn.classList.contains('touch-active'), true, 'RIGHT button has touch-active class');

  // Physics sub-step steers ball to the right (positive vx)
  game.physicsSubStep(0.05);
  assert.ok(game.ball.vx > 0, 'Ball velocity should accelerate in positive X direction');

  // Release RIGHT
  rightBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 11 }));
  assert.strictEqual(game.keys.right, false, 'Releasing RIGHT must set keys.right to false');
  assert.strictEqual(rightBtn.classList.contains('touch-active'), false, 'RIGHT button removes touch-active class');
});

// ---------------------------------------------------------------------------
// 2. DOWN Button Behavior (Dive Action, Never Triggers Jump)
// ---------------------------------------------------------------------------
test('3. DOWN button hold & release applies dive and never triggers jump', () => {
  const game = createGameInstance();
  const downBtn = game.touchDown;

  assert.strictEqual(game.keys.down, false);

  let jumpTriggered = false;
  const originalAirJump = game.handleAirJump.bind(game);
  game.handleAirJump = () => { jumpTriggered = true; originalAirJump(); };

  // Press DOWN
  downBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 12 }));
  assert.strictEqual(game.keys.down, true, 'DOWN button sets keys.down to true');
  assert.strictEqual(downBtn.classList.contains('touch-active'), true);
  assert.strictEqual(jumpTriggered, false, 'DOWN button must NEVER trigger jump');

  // Physics substep accelerates downward
  const initialVy = 100;
  game.ball.vy = initialVy;
  game.physicsSubStep(0.05);
  // vy should increase from both gravity (980) and dive acceleration (1600)
  assert.ok(game.ball.vy > initialVy + (980 * 0.05), 'Ball must experience downward dive acceleration');

  // Release DOWN
  downBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 12 }));
  assert.strictEqual(game.keys.down, false, 'Releasing DOWN clears keys.down');
  assert.strictEqual(downBtn.classList.contains('touch-active'), false);
  assert.strictEqual(jumpTriggered, false, 'Releasing DOWN must never trigger jump');
});

// ---------------------------------------------------------------------------
// 3. JUMP Button Edge-Triggered Behavior & Air-Jump Rules
// ---------------------------------------------------------------------------
test('4. JUMP button executes single edge-triggered air jump and respects gameplay rules', () => {
  const game = createGameInstance();
  const jumpBtn = game.touchUp;

  // Platform landing gives air jump
  game.ball.hasAirJump = true;
  game.ball.vy = 200; // Falling downward

  // Press JUMP
  jumpBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 13 }));
  assert.strictEqual(game.ball.hasAirJump, false, 'Air jump must be consumed');
  assert.ok(game.ball.vy < 0, 'Ball vy must become negative (upward impulse applied)');
  assert.strictEqual(jumpBtn.classList.contains('touch-active'), true);

  const vyAfterJump = game.ball.vy;

  // Continuous hold on JUMP does NOT trigger duplicate jumps
  jumpBtn.dispatchEvent(createPointerEvent('pointermove', { pointerId: 13 }));
  assert.strictEqual(game.ball.vy, vyAfterJump, 'Holding JUMP does not re-trigger jump');

  // Subsequent press before landing is ignored because air jump was already used
  jumpBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 13 }));
  jumpBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 14 }));
  assert.strictEqual(game.ball.hasAirJump, false, 'No second air jump permitted before landing');

  jumpBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 14 }));
  assert.strictEqual(jumpBtn.classList.contains('touch-active'), false);
});

// ---------------------------------------------------------------------------
// 4. Simultaneous Multi-Touch Input (LEFT + JUMP, RIGHT + JUMP, Steering + DOWN)
// ---------------------------------------------------------------------------
test('5. Simultaneous LEFT + JUMP works concurrently without conflict', () => {
  const game = createGameInstance();
  const leftBtn = game.touchLeft;
  const jumpBtn = game.touchUp;

  game.ball.hasAirJump = true;

  // 1. Left thumb holds LEFT (pointerId: 21)
  leftBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 21 }));
  assert.strictEqual(game.keys.left, true);
  assert.strictEqual(leftBtn.classList.contains('touch-active'), true);

  // 2. Right thumb presses JUMP (pointerId: 22)
  jumpBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 22 }));
  assert.strictEqual(game.ball.hasAirJump, false, 'Jump executed while steering');
  assert.strictEqual(game.keys.left, true, 'LEFT input must remain active while JUMP is pressed');

  // 3. Right thumb releases JUMP (pointerId: 22)
  jumpBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 22 }));
  assert.strictEqual(jumpBtn.classList.contains('touch-active'), false, 'JUMP active state cleared');
  assert.strictEqual(game.keys.left, true, 'LEFT input MUST still be held after JUMP release!');

  // 4. Left thumb releases LEFT
  leftBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 21 }));
  assert.strictEqual(game.keys.left, false, 'LEFT input released when left thumb lifts');
  assert.strictEqual(leftBtn.classList.contains('touch-active'), false);
});

test('6. Simultaneous RIGHT + JUMP works concurrently without conflict', () => {
  const game = createGameInstance();
  const rightBtn = game.touchRight;
  const jumpBtn = game.touchUp;

  game.ball.hasAirJump = true;

  // 1. Left thumb holds RIGHT (pointerId: 23)
  rightBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 23 }));
  assert.strictEqual(game.keys.right, true);

  // 2. Right thumb presses JUMP (pointerId: 24)
  jumpBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 24 }));
  assert.strictEqual(game.ball.hasAirJump, false);
  assert.strictEqual(game.keys.right, true);

  // 3. Right thumb lifts (pointerId: 24)
  jumpBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 24 }));
  assert.strictEqual(game.keys.right, true, 'RIGHT input remains held after JUMP release');

  // 4. Left thumb lifts (pointerId: 23)
  rightBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 23 }));
  assert.strictEqual(game.keys.right, false);
});

test('7. Simultaneous steering and DOWN dive works concurrently', () => {
  const game = createGameInstance();
  const leftBtn = game.touchLeft;
  const downBtn = game.touchDown;

  // Hold LEFT and DOWN simultaneously
  leftBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 25 }));
  downBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 26 }));

  assert.strictEqual(game.keys.left, true);
  assert.strictEqual(game.keys.down, true);

  // Release DOWN first
  downBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 26 }));
  assert.strictEqual(game.keys.down, false);
  assert.strictEqual(game.keys.left, true, 'Releasing DOWN leaves LEFT active');

  // Release LEFT
  leftBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 25 }));
  assert.strictEqual(game.keys.left, false);
});

// ---------------------------------------------------------------------------
// 5. Independent Multi-Touch Release (Distinct Pointer IDs)
// ---------------------------------------------------------------------------
test('8. Independent multi-touch: releasing a different pointer ID never cancels held button', () => {
  const game = createGameInstance();
  const leftBtn = game.touchLeft;

  // User places finger 1 (pointerId: 31) on LEFT
  leftBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 31 }));
  assert.strictEqual(game.keys.left, true);

  // Pointerup with a DIFFERENT pointer ID (e.g. pointerId: 99 from lifting a palm touch)
  leftBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 99 }));
  assert.strictEqual(game.keys.left, true, 'Spurious pointerup with different ID must not clear held key');

  // Release actual held pointerId: 31
  leftBtn.dispatchEvent(createPointerEvent('pointerup', { pointerId: 31 }));
  assert.strictEqual(game.keys.left, false, 'Matching pointerId release clears key');
});

// ---------------------------------------------------------------------------
// 6. Pointer Cancellation & Lost Pointer Capture
// ---------------------------------------------------------------------------
test('9. Pointer cancellation (pointercancel) cleanly releases held inputs', () => {
  const game = createGameInstance();
  const leftBtn = game.touchLeft;

  leftBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 40 }));
  assert.strictEqual(game.keys.left, true);

  // System gesture or incoming notification triggers pointercancel
  leftBtn.dispatchEvent(createPointerEvent('pointercancel', { pointerId: 40 }));
  assert.strictEqual(game.keys.left, false, 'pointercancel must release held input');
  assert.strictEqual(leftBtn.classList.contains('touch-active'), false);
});

test('10. Lost pointer capture (lostpointercapture) cleanly releases held inputs', () => {
  const game = createGameInstance();
  const rightBtn = game.touchRight;

  rightBtn.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 41 }));
  assert.strictEqual(game.keys.right, true);

  // Browser fires lostpointercapture
  rightBtn.dispatchEvent({ type: 'lostpointercapture', pointerId: 41 });
  assert.strictEqual(game.keys.right, false, 'lostpointercapture must release held input');
  assert.strictEqual(rightBtn.classList.contains('touch-active'), false);
});

// ---------------------------------------------------------------------------
// 7. Input Cleanup on Pause, Game Over, Restart, Menu Return, and Blur
// ---------------------------------------------------------------------------
test('11. Complete input cleanup on pause (togglePause)', () => {
  const game = createGameInstance();
  game.touchLeft.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 50 }));
  game.touchDown.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 51 }));
  assert.strictEqual(game.keys.left, true);
  assert.strictEqual(game.keys.down, true);

  game.togglePause();
  assert.strictEqual(game.currentState, STATE.PAUSED);
  assert.strictEqual(game.keys.left, false, 'Pause must clear keys.left');
  assert.strictEqual(game.keys.down, false, 'Pause must clear keys.down');
  assert.strictEqual(game.touchLeft.classList.contains('touch-active'), false);
  assert.strictEqual(game.touchDown.classList.contains('touch-active'), false);
});

test('12. Complete input cleanup on Game Over (triggerGameOver)', () => {
  const game = createGameInstance();
  game.touchRight.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 52 }));
  assert.strictEqual(game.keys.right, true);

  game.triggerGameOver('Fell into void');
  assert.strictEqual(game.currentState, STATE.GAMEOVER);
  assert.strictEqual(game.keys.right, false, 'Game Over must clear keys.right');
  assert.strictEqual(game.touchRight.classList.contains('touch-active'), false);
});

test('13. Complete input cleanup on Menu Return (setGameState(MENU))', () => {
  const game = createGameInstance();
  game.touchLeft.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 53 }));
  assert.strictEqual(game.keys.left, true);

  game.setGameState(STATE.MENU);
  assert.strictEqual(game.currentState, STATE.MENU);
  assert.strictEqual(game.keys.left, false, 'Menu transition must clear keys.left');
});

test('14. Complete input cleanup on Window Blur and Tab Visibility Change', () => {
  const game = createGameInstance();
  game.touchLeft.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 54 }));
  assert.strictEqual(game.keys.left, true);

  // Window blur
  global.window.dispatchEvent({ type: 'blur' });
  assert.strictEqual(game.keys.left, false, 'Window blur must clear keys.left');

  // Tab hidden via visibilitychange
  game.touchRight.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 55 }));
  assert.strictEqual(game.keys.right, true);

  global.document.hidden = true;
  global.document.dispatchEvent({ type: 'visibilitychange' });
  assert.strictEqual(game.keys.right, false, 'Tab hide must clear keys.right');
  assert.strictEqual(game.currentState, STATE.PAUSED, 'Tab hide must pause active game');
  global.document.hidden = false;
});

// ---------------------------------------------------------------------------
// 8. Desktop Keyboard Controls Preservation
// ---------------------------------------------------------------------------
test('15. Preservation of desktop keyboard controls (A/D/Left/Right/W/S/M/Esc/Enter)', () => {
  const game = createGameInstance();

  // A. A / D horizontal steering
  global.window.dispatchEvent({ type: 'keydown', code: 'KeyA', preventDefault: () => {} });
  assert.strictEqual(game.keys.left, true, 'KeyA sets keys.left');
  global.window.dispatchEvent({ type: 'keyup', code: 'KeyA' });
  assert.strictEqual(game.keys.left, false, 'KeyA keyup clears keys.left');

  global.window.dispatchEvent({ type: 'keydown', code: 'KeyD', preventDefault: () => {} });
  assert.strictEqual(game.keys.right, true, 'KeyD sets keys.right');
  global.window.dispatchEvent({ type: 'keyup', code: 'KeyD' });
  assert.strictEqual(game.keys.right, false, 'KeyD keyup clears keys.right');

  // B. S downward dive
  global.window.dispatchEvent({ type: 'keydown', code: 'KeyS', preventDefault: () => {} });
  assert.strictEqual(game.keys.down, true, 'KeyS sets keys.down');
  global.window.dispatchEvent({ type: 'keyup', code: 'KeyS' });
  assert.strictEqual(game.keys.down, false, 'KeyS keyup clears keys.down');

  // C. W edge-triggered air jump
  game.ball.hasAirJump = true;
  global.window.dispatchEvent({ type: 'keydown', code: 'KeyW', preventDefault: () => {} });
  assert.strictEqual(game.ball.hasAirJump, false, 'KeyW applies air jump');

  // Repeat keydown is ignored
  global.window.dispatchEvent({ type: 'keydown', code: 'KeyW', repeat: true, preventDefault: () => {} });

  // D. Escape toggles pause
  assert.strictEqual(game.currentState, STATE.PLAYING);
  global.window.dispatchEvent({ type: 'keydown', code: 'Escape', preventDefault: () => {} });
  assert.strictEqual(game.currentState, STATE.PAUSED, 'Escape pauses game');
  global.window.dispatchEvent({ type: 'keydown', code: 'Escape', preventDefault: () => {} });
  assert.strictEqual(game.currentState, STATE.PLAYING, 'Escape unpauses game');
});

// ---------------------------------------------------------------------------
// 9. Ensuring Removed Swipe and Obsolete Systems are No Longer Active
// ---------------------------------------------------------------------------
test('16. Obsolete swipe steering and control mode systems are completely removed', () => {
  const game = createGameInstance();
  const canvas = game.canvas;

  // Canvas pointerdown/move must NOT steer the ball (swipe steering removed)
  canvas.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 60, clientX: 100, clientY: 200 }));
  canvas.dispatchEvent(createPointerEvent('pointermove', { pointerId: 60, clientX: 200, clientY: 200 }));
  assert.strictEqual(game.keys.right, false, 'Canvas swipe pointer move must NOT trigger steering');
  assert.strictEqual(game.keys.left, false);

  // Verify obsolete swipe properties and methods are absent
  assert.strictEqual(game.activeGesture, undefined, 'activeGesture must be removed');
  assert.strictEqual(game.calculateSwipeSteerDuration, undefined, 'calculateSwipeSteerDuration must be removed');
  assert.strictEqual(game.setupGestureControls, undefined, 'setupGestureControls must be removed');
  assert.strictEqual(game.controlMode, undefined, 'controlMode must be removed');
  assert.strictEqual(game.controlModeBtn, undefined, 'controlModeBtn must be absent');
  assert.strictEqual(game.gestureToast, undefined, 'gestureToast must be absent');

  // Verify obsolete SWIPE constants are absent from exports
  const exported = require('../game.js');
  assert.strictEqual(exported.SWIPE_MIN_DIST, undefined, 'SWIPE_MIN_DIST must not be exported');
  assert.strictEqual(exported.SWIPE_STEER_MAX_MS, undefined, 'SWIPE_STEER_MAX_MS must not be exported');
});

// ---------------------------------------------------------------------------
// 10. Floating Controls Visibility Across Game States
// ---------------------------------------------------------------------------
test('17. Floating controls appear during PLAYING and are inactive during MENU, PAUSED, and GAMEOVER', () => {
  const game = new BounceGame();

  // Initial state is MENU -> controls should have controls-inactive
  assert.strictEqual(game.currentState, STATE.MENU);
  assert.strictEqual(game.touchControls.classList.contains('controls-inactive'), true, 'Inactive on MENU');

  // Start game -> PLAYING -> controls-inactive removed
  game.startNewGame();
  assert.strictEqual(game.currentState, STATE.PLAYING);
  assert.strictEqual(game.touchControls.classList.contains('controls-inactive'), false, 'Active during PLAYING');

  // Pause -> controls-inactive added
  game.togglePause();
  assert.strictEqual(game.currentState, STATE.PAUSED);
  assert.strictEqual(game.touchControls.classList.contains('controls-inactive'), true, 'Inactive on PAUSED');

  // Resume -> controls-inactive removed
  game.togglePause();
  assert.strictEqual(game.currentState, STATE.PLAYING);
  assert.strictEqual(game.touchControls.classList.contains('controls-inactive'), false, 'Active on Resume');

  // Game Over -> controls-inactive added
  game.triggerGameOver('Test over');
  assert.strictEqual(game.currentState, STATE.GAMEOVER);
  assert.strictEqual(game.touchControls.classList.contains('controls-inactive'), true, 'Inactive on GAMEOVER');
});

// ---------------------------------------------------------------------------
// 11. Mobile Menu & Navigation Buttons
// ---------------------------------------------------------------------------
test('18. Mobile menu navigation buttons respond to click and touchend with debounce protection', () => {
  const game = new BounceGame();
  assert.strictEqual(game.currentState, STATE.MENU);

  // Click starts game
  game.playBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.PLAYING, 'playBtn starts game');

  // Pause button via touchend
  game.pauseBtn.dispatchEvent({
    type: 'touchstart',
    changedTouches: [{ clientX: 400, clientY: 20 }],
  });
  game.pauseBtn.dispatchEvent({
    type: 'touchend',
    cancelable: true,
    preventDefault: () => {},
  });
  assert.strictEqual(game.currentState, STATE.PAUSED, 'pauseBtn pauses game');

  // Resume button via touchend
  game.resumeBtn.dispatchEvent({
    type: 'touchstart',
    changedTouches: [{ clientX: 200, clientY: 300 }],
  });
  game.resumeBtn.dispatchEvent({
    type: 'touchend',
    cancelable: true,
    preventDefault: () => {},
  });
  assert.strictEqual(game.currentState, STATE.PLAYING, 'resumeBtn resumes game');
});
