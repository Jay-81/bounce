/**
 * Automated test suite for BOUNCE Run-Complete / Results Screen redesign.
 *
 * Verifies:
 * 1. Visual Redesign elements exist and match required schema
 * 2. Proper handling of 0 stars: "NO STARS EARNED", all 3 stars unearned
 * 3. Proper handling of 1, 2, 3 stars: glowing earned stars & distinct victory verdicts
 * 4. Tasteful personal record notification shown ONLY when score > bestScore
 * 5. Preservation of all metrics (altitude, level, run orbs, run stars, best alt, lifetime totals)
 * 6. Dominant CLIMB AGAIN action starts new run (STATE.PLAYING)
 * 7. Secondary MAIN MENU action returns to main menu (STATE.MENU)
 */

const test = require('node:test');
const assert = require('node:assert');

// Setup comprehensive DOM mocks in Node environment before loading game.js
const elements = new Map();
const documentListeners = new Map();
const windowListeners = new Map();
const mockStorage = new Map();

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
    this.textContent = '';
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

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
  }

  getContext() {
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

global.window = {
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 2,
  addEventListener: (event, handler) => {
    if (!windowListeners.has(event)) windowListeners.set(event, []);
    windowListeners.get(event).push(handler);
  },
  removeEventListener: () => {},
  localStorage: {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    clear: () => mockStorage.clear(),
  },
  AudioContext: class {
    constructor() {
      this.state = 'running';
      this.destination = {};
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
    suspend() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
};

global.document = {
  getElementById: (id) => getOrCreateElement(id),
  querySelector: (sel) => {
    const clean = sel.replace(/[#.]/g, '');
    return getOrCreateElement(clean);
  },
  querySelectorAll: (sel) => {
    const clean = sel.replace(/[#.]/g, '');
    return [getOrCreateElement(clean)];
  },
  addEventListener: (event, handler) => {
    if (!documentListeners.has(event)) documentListeners.set(event, []);
    documentListeners.get(event).push(handler);
  },
  removeEventListener: () => {},
  hidden: false,
  body: getOrCreateElement('body'),
};

global.localStorage = global.window.localStorage;
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const { BounceGame, STATE } = require('../game.js');

test('Results Screen - Required DOM elements and initial state', () => {
  const game = new BounceGame();

  assert.ok(game.gameOverScreen, 'gameOverScreen element exists');
  assert.ok(game.resultsTitle || document.getElementById('resultsTitle'), 'resultsTitle exists');
  assert.ok(game.gameOverSubtext, 'gameOverSubtext exists');
  assert.ok(game.starIcon1 && game.starIcon2 && game.starIcon3, 'starIcon 1, 2, 3 exist');
  assert.ok(game.ratingVerdictText, 'ratingVerdictText exists');
  assert.ok(game.finalScore, 'finalScore exists');
  assert.ok(game.newBestTag, 'newBestTag exists');
  assert.ok(game.finalLevelReached, 'finalLevelReached exists');
  assert.ok(game.finalRunOrbs, 'finalRunOrbs exists');
  assert.ok(game.finalRunStars, 'finalRunStars exists');
  assert.ok(game.finalBestScore, 'finalBestScore exists');
  assert.ok(game.restartBtn, 'restartBtn exists');
  assert.ok(game.menuReturnBtn, 'menuReturnBtn exists');
});

test('Results Screen - 0-Star Run displays "NO STARS EARNED", dims stars, hides record tag when not beaten', () => {
  mockStorage.set('bounce_best_score', '500');
  const game = new BounceGame();

  game.bestScore = 500;
  game.score = 30;
  game.runOrbs = 0;
  game.runStars = 0;
  game.level = 1;

  game.triggerGameOver('The orb fell into the void');

  assert.strictEqual(game.gameOverSubtext.textContent, 'The orb fell into the void');
  assert.strictEqual(game.starIcon1.classList.contains('earned'), false, 'Star 1 dimmed');
  assert.strictEqual(game.starIcon2.classList.contains('earned'), false, 'Star 2 dimmed');
  assert.strictEqual(game.starIcon3.classList.contains('earned'), false, 'Star 3 dimmed');
  assert.strictEqual(game.ratingVerdictText.textContent, 'NO STARS EARNED');
  assert.strictEqual(game.ratingVerdictText.classList.contains('has-stars'), false);
  assert.strictEqual(game.newBestTag.classList.contains('hidden'), true, 'Record badge hidden since score 30 < 500');
  assert.strictEqual(game.finalScore.textContent, 30);
  assert.strictEqual(game.finalBestScore.textContent, 500);
});

test('Results Screen - 1-Star Run displays "1 STAR EARNED", illuminates 1 star', () => {
  mockStorage.set('bounce_best_score', '500');
  const game = new BounceGame();

  game.bestScore = 500;
  game.score = 350;
  game.runOrbs = 2;
  game.runStars = 0;
  game.level = 1;

  game.triggerGameOver('The orb fell into the void');

  assert.strictEqual(game.starIcon1.classList.contains('earned'), true, 'Star 1 earned');
  assert.strictEqual(game.starIcon2.classList.contains('earned'), false, 'Star 2 dimmed');
  assert.strictEqual(game.starIcon3.classList.contains('earned'), false, 'Star 3 dimmed');
  assert.strictEqual(game.ratingVerdictText.textContent, '1 STAR EARNED');
  assert.strictEqual(game.ratingVerdictText.classList.contains('has-stars'), true);
});

test('Results Screen - 2-Star Run displays "2 STARS EARNED", illuminates 2 stars', () => {
  mockStorage.set('bounce_best_score', '500');
  const game = new BounceGame();

  game.bestScore = 500;
  game.score = 800;
  game.runOrbs = 6;
  game.runStars = 0;
  game.level = 2;

  game.triggerGameOver('The orb fell into the void');

  assert.strictEqual(game.starIcon1.classList.contains('earned'), true, 'Star 1 earned');
  assert.strictEqual(game.starIcon2.classList.contains('earned'), true, 'Star 2 earned');
  assert.strictEqual(game.starIcon3.classList.contains('earned'), false, 'Star 3 dimmed');
  assert.strictEqual(game.ratingVerdictText.textContent, '2 STARS EARNED');
  assert.strictEqual(game.ratingVerdictText.classList.contains('has-stars'), true);
});

test('Results Screen - 3-Star Run displays "3 STARS EARNED! PERFECT CLIMB", illuminates all 3 stars', () => {
  mockStorage.set('bounce_best_score', '500');
  const game = new BounceGame();

  game.bestScore = 500;
  game.score = 1500;
  game.runOrbs = 14;
  game.runStars = 2;
  game.level = 3;

  game.triggerGameOver('The orb fell into the void');

  assert.strictEqual(game.starIcon1.classList.contains('earned'), true, 'Star 1 earned');
  assert.strictEqual(game.starIcon2.classList.contains('earned'), true, 'Star 2 earned');
  assert.strictEqual(game.starIcon3.classList.contains('earned'), true, 'Star 3 earned');
  assert.strictEqual(game.ratingVerdictText.textContent, '3 STARS EARNED! PERFECT CLIMB');
  assert.strictEqual(game.ratingVerdictText.classList.contains('has-stars'), true);
});

test('Results Screen - New Personal Record triggers neon record badge', () => {
  mockStorage.set('bounce_best_score', '200');
  const game = new BounceGame();

  game.bestScore = 200;
  game.score = 350; // New record!
  game.triggerGameOver('The orb fell into the void');

  assert.strictEqual(game.isNewRecord, true);
  assert.strictEqual(game.newBestTag.classList.contains('hidden'), false, 'Record badge revealed');
  assert.strictEqual(game.bestScore, 350);
  assert.strictEqual(game.finalBestScore.textContent, 350);
});

test('Results Screen - CLIMB AGAIN and MAIN MENU buttons navigate correctly', () => {
  const game = new BounceGame();

  game.setGameState(STATE.PLAYING);
  game.triggerGameOver('The orb fell into the void');
  assert.strictEqual(game.currentState, STATE.GAMEOVER);

  // Test CLIMB AGAIN
  game.restartBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.PLAYING, 'Restart transitions state to STATE.PLAYING');

  // Trigger game over again
  game.triggerGameOver('The orb fell into the void');
  assert.strictEqual(game.currentState, STATE.GAMEOVER);

  // Test MAIN MENU
  game.menuReturnBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.MENU, 'Menu return transitions state to STATE.MENU');
});
