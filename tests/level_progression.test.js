/**
 * Automated test suite for BOUNCE World & Portal-Based Level Selection and Progression System.
 *
 * Verifies:
 * 1. Fresh installation defaults (Level 1 unlocked, last-played is 1, World 1 displayed, CONTINUE starts Level 1)
 * 2. Progression unlocking (climbing past milestone unlocks subsequent levels monotonically)
 * 3. Locked-level restrictions (cannot start or select locked levels; clamped safely)
 * 4. Continue and resume behavior (resumes last-played; handles malformed/outdated storage safely)
 * 5. Replaying unlocked levels (can replay any unlocked level without resetting highest progression)
 * 6. Difficulty scaling and starting altitude integration for selected levels
 * 7. World 1 layout & portal locked state: 12 levels (1–12) + portal to World 2; portal locked before Level 12
 * 8. Unlocking Level 12 unlocks World 2 portal and grants access to World 2 (Levels 13–24)
 * 9. Unlocking Level 24 unlocks World 3 portal and grants access to World 3 (Levels 25–36)
 * 10. World navigation: prev/next buttons navigate unlocked worlds, locked portal cannot be entered
 * 11. Cross-world CONTINUE behavior: resumes lastPlayedLevel even when viewing another world
 * 12. Infinite progression calculation: dynamic calculation of start/end levels and portal unlock conditions
 * 13. Persistence across game restarts without overwriting unrelated player data
 * 14. UI Navigation & State Transitions (MENU <-> LEVEL_SELECT <-> RESULTS <-> PLAYING)
 * 15. Interface spacing and mobile safe-area CSS rules verification
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// DOM and Storage Mocks
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
    this.attributes = new Map();
    this.textContent = '';
    this.children = [];
    this._parentElement = null;
    this.scrollTop = 0;
    this.scrollHeight = 500;
    this.clientHeight = 300;
    this._disabled = false;
  }

  get disabled() {
    return this._disabled;
  }

  set disabled(val) {
    this._disabled = !!val;
    if (this._disabled) {
      this.attributes.set('disabled', '');
    } else {
      this.attributes.delete('disabled');
    }
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  set innerHTML(val) {
    this._innerHTML = val;
    if (val === '') {
      this.children = [];
    }
  }

  get className() {
    return Array.from(this._classes).join(' ');
  }

  set className(val) {
    this._classes.clear();
    if (typeof val === 'string') {
      val.split(/\s+/).filter(Boolean).forEach(c => this._classes.add(c));
    }
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

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }

  getAttribute(k) {
    return this.attributes.get(k) || null;
  }

  appendChild(child) {
    child._parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this.children.find(c => c.classList.contains(cls)) || new MockElement('child_' + sel);
    }
    return new MockElement('child_' + sel);
  }

  querySelectorAll(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this.children.filter(c => c.classList.contains(cls));
    }
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
    removeItem: (key) => mockStorage.delete(key),
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
  createElement: (tag) => new MockElement('', tag),
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
  activeElement: { blur: () => {} },
};

global.localStorage = global.window.localStorage;
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const { BounceGame, STATE, getLevelMilestone } = require('../game.js');

test('1. Fresh installation defaults: Level 1 unlocked, lastPlayed=1, CONTINUE resumes Level 1', () => {
  mockStorage.clear();
  const game = new BounceGame();

  assert.strictEqual(game.highestUnlockedLevel, 1, 'Highest unlocked level starts at 1');
  assert.strictEqual(game.lastPlayedLevel, 1, 'Last played level starts at 1');
  assert.strictEqual(game.selectedLevel, 1, 'Selected level is 1');
  assert.strictEqual(game.currentWorld, 1, 'Current world is World 1');

  // Verify CONTINUE button starts Level 1
  game.continueLevelBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.PLAYING, 'Game transitions to PLAYING');
  assert.strictEqual(game.level, 1, 'Game starts at Level 1');
  assert.strictEqual(game.score, 0, 'Altitude starts at 0 for Level 1');
});

test('2. Progression & Milestone Unlocking: reaching next milestone unlocks Level 2 and Level 3 monotonically', () => {
  mockStorage.clear();
  const game = new BounceGame();

  game.startNewGame(1);
  assert.strictEqual(game.level, 1);
  assert.strictEqual(game.highestUnlockedLevel, 1);

  // Milestone for Level 1 is 500. Simulate reaching 520 altitude.
  const milestone1 = getLevelMilestone(1);
  assert.strictEqual(milestone1, 500);

  game.score = 520;
  game.maxAltitude = 520;
  game.update(0.016);

  assert.strictEqual(game.level, 2, 'Player advances to Level 2 in gameplay');
  assert.strictEqual(game.highestUnlockedLevel, 2, 'Level 2 is unlocked in progression');
  assert.strictEqual(mockStorage.get('bounce_arcade_highest_level'), '2', 'Level 2 persisted to localStorage');
  assert.strictEqual(game.lastPlayedLevel, 2, 'Last played level updated to 2');

  // Next milestone for Level 2 is 1200. Simulate reaching 1250 altitude.
  const milestone2 = getLevelMilestone(2);
  assert.strictEqual(milestone2, 1200);

  game.score = 1250;
  game.maxAltitude = 1250;
  game.update(0.016);

  assert.strictEqual(game.level, 3, 'Player advances to Level 3 in gameplay');
  assert.strictEqual(game.highestUnlockedLevel, 3, 'Level 3 is unlocked in progression');
  assert.strictEqual(mockStorage.get('bounce_arcade_highest_level'), '3', 'Level 3 persisted to localStorage');

  // Verify unlocking level 3 never relocks level 1 or 2
  game.saveHighestUnlockedLevel(1);
  assert.strictEqual(game.highestUnlockedLevel, 3, 'Cannot relock previously unlocked levels');
});

test('3. Locked-Level Restrictions: locked levels cannot be selected or started', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_highest_level', '2');
  const game = new BounceGame();

  assert.strictEqual(game.highestUnlockedLevel, 2, 'Highest unlocked is 2');

  // Attempt to start Level 5 (locked)
  game.startNewGame(5);
  assert.strictEqual(game.level, 2, 'Target level 5 clamped to highest unlocked level 2');
  assert.strictEqual(game.lastPlayedLevel, 2, 'Last played level clamped to 2');

  // Verify locked card interaction in level grid
  game.openLevelSelect();
  const cards = game.levelCardsGrid.children;

  const cardLvl4 = cards.find(c => c.getAttribute('data-level') === '4');
  assert.ok(cardLvl4, 'Card for Level 4 exists');
  assert.ok(cardLvl4.classList.contains('locked'), 'Level 4 card has locked class');
  assert.strictEqual(cardLvl4.getAttribute('aria-disabled'), 'true');

  // Clicking locked card should NOT start game
  cardLvl4.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.LEVEL_SELECT, 'Game state remains LEVEL_SELECT on clicking locked level');
});

test('4. Continue and Resume Functionality: resumes last-played level across worlds and sanitizes invalid saved data', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_highest_level', '15');
  mockStorage.set('bounce_arcade_last_played_level', '14');

  const game = new BounceGame();
  assert.strictEqual(game.highestUnlockedLevel, 15);
  assert.strictEqual(game.lastPlayedLevel, 14, 'Loaded last-played level 14');

  // CONTINUE starts Level 14 in World 2
  game.continueLevelBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.PLAYING);
  assert.strictEqual(game.level, 14, 'Resumes Level 14');

  // Corrupted data test: last-played is 999 while highest unlocked is 15
  mockStorage.set('bounce_arcade_last_played_level', '999');
  const gameCorrupted = new BounceGame();
  assert.strictEqual(gameCorrupted.lastPlayedLevel, 15, 'Clamped 999 down to highest unlocked level 15');

  // Non-numeric data test
  mockStorage.set('bounce_arcade_last_played_level', 'corrupt_xyz');
  const gameMalformed = new BounceGame();
  assert.strictEqual(gameMalformed.lastPlayedLevel, 1, 'Malformed value defaults safely to 1');
});

test('5. Replay Unlocked Levels: players can replay earlier levels without losing highest unlocked progress', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_highest_level', '5');
  mockStorage.set('bounce_arcade_last_played_level', '5');

  const game = new BounceGame();
  assert.strictEqual(game.highestUnlockedLevel, 5);

  // Replay Level 1
  game.startNewGame(1);
  assert.strictEqual(game.level, 1, 'Current level is 1');
  assert.strictEqual(game.lastPlayedLevel, 1, 'Last played updated to 1');
  assert.strictEqual(game.highestUnlockedLevel, 5, 'Highest unlocked level remains 5 (not reset)');
  assert.strictEqual(mockStorage.get('bounce_arcade_highest_level'), '5', 'Saved progression preserved in storage');

  // Player falls in Level 1 run
  game.triggerGameOver('Fell into void');
  assert.strictEqual(game.currentState, STATE.GAMEOVER);
  assert.strictEqual(game.highestUnlockedLevel, 5, 'Overall progression intact after game over');

  // Restarting run restarts Level 1
  game.restartBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.PLAYING);
  assert.strictEqual(game.level, 1, 'Restarted Level 1');
});

test('6. Gameplay Integration & Difficulty Scaling: starts at proper milestone altitude and theme', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_highest_level', '3');

  const game = new BounceGame();

  // Starting Level 2
  game.startNewGame(2);
  const milestone1 = getLevelMilestone(1); // 500
  assert.strictEqual(game.startAltitude, milestone1, 'Level 2 starting altitude is 500');
  assert.strictEqual(game.score, 500, 'Score initialized to 500');
  assert.strictEqual(game.themeManager.currentLevel, 2, 'Theme manager initialized to Level 2');

  // Starting Level 3
  game.startNewGame(3);
  const milestone2 = getLevelMilestone(2); // 1200
  assert.strictEqual(game.startAltitude, milestone2, 'Level 3 starting altitude is 1200');
  assert.strictEqual(game.score, 1200, 'Score initialized to 1200');
  assert.strictEqual(game.themeManager.currentLevel, 3, 'Theme manager initialized to Level 3');
});

test('7. World 1 Layout & Portal Locked State: displays exactly Levels 1–12 and locked portal before Level 12', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_highest_level', '6'); // In World 1, has not reached Level 12 yet
  const game = new BounceGame();
  game.openLevelSelect();

  assert.strictEqual(game.currentWorld, 1, 'Viewing World 1');
  assert.strictEqual(game.worldTitleText.textContent, 'WORLD 1', 'World title is WORLD 1');
  assert.strictEqual(game.worldRangeText.textContent, 'LEVELS 1–12', 'World range is LEVELS 1–12');

  const children = game.levelCardsGrid.children;
  // Exactly 12 level cards + 1 portal card = 13 children
  assert.strictEqual(children.length, 13, 'Contains exactly 12 level cards and 1 portal entry');

  // Check the 12 level cards
  for (let lvl = 1; lvl <= 12; lvl++) {
    const card = children[lvl - 1];
    assert.strictEqual(card.getAttribute('data-level'), String(lvl), `Card ${lvl} has correct level data attribute`);
    if (lvl <= 6) {
      assert.ok(card.classList.contains('unlocked'), `Level ${lvl} is unlocked`);
    } else {
      assert.ok(card.classList.contains('locked'), `Level ${lvl} is locked`);
    }
  }

  // Check the portal card at index 12 (the 13th child)
  const portal = children[12];
  assert.ok(portal.classList.contains('world-portal-card'), '13th element is a world-portal-card');
  assert.ok(portal.classList.contains('locked'), 'Portal to World 2 is locked before Level 12 is reached');
  assert.strictEqual(portal.getAttribute('data-target-world'), '2');
  assert.strictEqual(portal.getAttribute('aria-disabled'), 'true');

  // Clicking locked portal should NOT navigate to World 2
  portal.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentWorld, 1, 'Current world remains 1 after clicking locked portal');

  // Prev World button should be disabled for World 1
  assert.strictEqual(game.prevWorldBtn.disabled, true, 'Prev World button disabled on World 1');
  // Next World button should be disabled because portal to World 2 is locked
  assert.strictEqual(game.nextWorldBtn.disabled, true, 'Next World button disabled when portal locked');
});

test('8. Unlocking Level 12 unlocks World 2 portal and grants access to World 2 (Levels 13–24)', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_highest_level', '12'); // Level 12 reached!
  const game = new BounceGame();
  game.openLevelSelect(1);

  assert.strictEqual(game.isPortalUnlocked(1), true, 'Portal for World 1 is unlocked upon reaching Level 12');
  assert.strictEqual(game.isWorldUnlocked(2), true, 'World 2 is unlocked upon reaching Level 12');
  assert.strictEqual(game.getMaxAccessibleWorld(), 2, 'Max accessible world is 2');

  const childrenW1 = game.levelCardsGrid.children;
  const portalW1 = childrenW1[12];
  assert.ok(portalW1.classList.contains('unlocked'), 'Portal card has unlocked class');
  assert.strictEqual(portalW1.getAttribute('tabindex'), '0');

  // Clicking the unlocked portal navigates to World 2
  portalW1.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentWorld, 2, 'Transitions to World 2 upon clicking portal');
  assert.strictEqual(game.worldTitleText.textContent, 'WORLD 2');
  assert.strictEqual(game.worldRangeText.textContent, 'LEVELS 13–24');

  // Check World 2 items
  const childrenW2 = game.levelCardsGrid.children;
  assert.strictEqual(childrenW2.length, 13, 'World 2 contains 12 level cards and 1 portal entry');
  assert.strictEqual(childrenW2[0].getAttribute('data-level'), '13', 'First card in World 2 is Level 13');
  assert.strictEqual(childrenW2[11].getAttribute('data-level'), '24', 'Last card in World 2 is Level 24');

  // Portal to World 3 is locked since highest level is 12 (< 24)
  const portalW2 = childrenW2[12];
  assert.strictEqual(portalW2.getAttribute('data-target-world'), '3');
  assert.ok(portalW2.classList.contains('locked'), 'World 3 portal is locked');
});

test('9. Unlocking Level 24 unlocks World 3 portal and grants access to World 3 (Levels 25–36)', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_highest_level', '24'); // Level 24 reached!
  const game = new BounceGame();

  assert.strictEqual(game.isPortalUnlocked(2), true, 'Portal for World 2 is unlocked upon reaching Level 24');
  assert.strictEqual(game.isWorldUnlocked(3), true, 'World 3 is unlocked');
  assert.strictEqual(game.getMaxAccessibleWorld(), 3, 'Max accessible world is 3');

  game.openLevelSelect(2);
  assert.strictEqual(game.currentWorld, 2);

  // Portal to World 3 is unlocked
  const portalW2 = game.levelCardsGrid.children[12];
  assert.ok(portalW2.classList.contains('unlocked'), 'World 3 portal card is unlocked');

  // Click portal to World 3
  portalW2.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentWorld, 3, 'Navigated to World 3');
  assert.strictEqual(game.worldTitleText.textContent, 'WORLD 3');
  assert.strictEqual(game.worldRangeText.textContent, 'LEVELS 25–36');

  const childrenW3 = game.levelCardsGrid.children;
  assert.strictEqual(childrenW3.length, 13, 'World 3 contains 12 level cards and 1 portal entry');
  assert.strictEqual(childrenW3[0].getAttribute('data-level'), '25', 'First card in World 3 is Level 25');
  assert.strictEqual(childrenW3[11].getAttribute('data-level'), '36', 'Last card in World 3 is Level 36');
  assert.strictEqual(childrenW3[12].getAttribute('data-target-world'), '4', 'Portal targets World 4');
  assert.ok(childrenW3[12].classList.contains('locked'), 'Portal to World 4 is locked');
});

test('10. Navigation Between Worlds: prev and next buttons navigate unlocked worlds safely', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_highest_level', '25'); // Unlocked World 1, 2, and 3
  const game = new BounceGame();

  // Start in World 3
  game.openLevelSelect(3);
  assert.strictEqual(game.currentWorld, 3);
  assert.strictEqual(game.prevWorldBtn.disabled, false, 'Prev button enabled in World 3');

  // Click prevWorldBtn navigates from World 3 to World 2
  game.prevWorldBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentWorld, 2, 'Navigated back to World 2');
  assert.strictEqual(game.worldTitleText.textContent, 'WORLD 2');

  // Navigate to World 1
  game.goToPrevWorld();
  assert.strictEqual(game.currentWorld, 1, 'Navigated back to World 1');
  assert.strictEqual(game.worldTitleText.textContent, 'WORLD 1');
  assert.strictEqual(game.prevWorldBtn.disabled, true, 'Prev button disabled on World 1');

  // Attempting to go prev on World 1 does nothing
  game.goToPrevWorld();
  assert.strictEqual(game.currentWorld, 1, 'Still on World 1');

  // Click nextWorldBtn to World 2
  game.nextWorldBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentWorld, 2, 'Navigated forward to World 2');

  // Navigate to World 3
  game.goToNextWorld();
  assert.strictEqual(game.currentWorld, 3, 'Navigated forward to World 3');

  // On World 3, portal to World 4 is locked (highest level 25 < 36), so next button is disabled
  assert.strictEqual(game.nextWorldBtn.disabled, true, 'Next button disabled on World 3 when World 4 is locked');

  // Attempting to go next when locked does nothing
  game.goToNextWorld();
  assert.strictEqual(game.currentWorld, 3, 'Still on World 3');
});

test('11. Cross-World CONTINUE Behavior: resumes lastPlayedLevel regardless of which world is currently viewed', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_highest_level', '20');
  mockStorage.set('bounce_arcade_last_played_level', '18'); // Level 18 is in World 2

  const game = new BounceGame();
  // Open Level Select - defaults to World containing lastPlayedLevel (World 2)
  game.openLevelSelect();
  assert.strictEqual(game.currentWorld, 2, 'Opens World 2 for lastPlayedLevel 18');
  assert.strictEqual(game.continueLevelTitle.textContent, 'CONTINUE LEVEL 18');

  // Player navigates to World 1 to view earlier levels
  game.prevWorldBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentWorld, 1, 'Viewing World 1');
  assert.strictEqual(game.continueLevelTitle.textContent, 'CONTINUE LEVEL 18', 'CONTINUE still displays Level 18');

  // Player clicks CONTINUE while viewing World 1
  game.continueLevelBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.PLAYING);
  assert.strictEqual(game.level, 18, 'Resumed Level 18 even though World 1 was on screen');
});

test('12. Infinite Progression Calculation: dynamic math works for arbitrary high worlds without hardcoding', () => {
  const game = new BounceGame();

  // Test World math for World 10 (Levels 109–120)
  assert.strictEqual(game.getWorldForLevel(109), 10);
  assert.strictEqual(game.getWorldForLevel(120), 10);
  assert.strictEqual(game.getWorldForLevel(121), 11);
  assert.strictEqual(game.getWorldStartLevel(10), 109);
  assert.strictEqual(game.getWorldEndLevel(10), 120);

  // Test World math for World 100 (Levels 1189–1200)
  assert.strictEqual(game.getWorldStartLevel(100), 1189);
  assert.strictEqual(game.getWorldEndLevel(100), 1200);
  assert.strictEqual(game.getWorldForLevel(1200), 100);

  // Dynamic portal unlock check
  game.highestUnlockedLevel = 119;
  assert.strictEqual(game.isPortalUnlocked(9), true, 'World 9 portal (needs 108) is unlocked');
  assert.strictEqual(game.isPortalUnlocked(10), false, 'World 10 portal (needs 120) is locked');

  game.highestUnlockedLevel = 120;
  assert.strictEqual(game.isPortalUnlocked(10), true, 'World 10 portal unlocked at Level 120');
  assert.strictEqual(game.isWorldUnlocked(11), true, 'World 11 unlocked');
});

test('13. Persistence Integrity: updating progression preserves existing scores, stars, and ratings', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_best_score', '3400');
  mockStorage.set('bounce_arcade_total_orbs', '85');
  mockStorage.set('bounce_arcade_total_stars', '12');
  mockStorage.set('bounce_arcade_sound_enabled', 'false');
  mockStorage.set('bounce_arcade_level_ratings', JSON.stringify({ 1: 3, 2: 2 }));
  mockStorage.set('bounce_arcade_highest_level', '2');
  mockStorage.set('bounce_arcade_last_played_level', '2');

  const game = new BounceGame();
  assert.strictEqual(game.bestScore, 3400);
  assert.strictEqual(game.totalOrbs, 85);
  assert.strictEqual(game.totalStars, 12);
  assert.strictEqual(game.sound.enabled, false);
  assert.strictEqual(game.levelBestRatings[1], 3);
  assert.strictEqual(game.levelBestRatings[2], 2);

  // Player advances to Level 3
  game.saveHighestUnlockedLevel(3);
  game.saveLastPlayedLevel(3);

  // Verify other storage records were NOT overwritten or corrupted
  assert.strictEqual(mockStorage.get('bounce_arcade_best_score'), '3400');
  assert.strictEqual(mockStorage.get('bounce_arcade_total_orbs'), '85');
  assert.strictEqual(mockStorage.get('bounce_arcade_total_stars'), '12');
  assert.strictEqual(mockStorage.get('bounce_arcade_sound_enabled'), 'false');
  assert.strictEqual(mockStorage.get('bounce_arcade_highest_level'), '3');
  assert.strictEqual(mockStorage.get('bounce_arcade_last_played_level'), '3');
});

test('14. UI Navigation & State Transitions: seamless transitions between MENU, LEVEL_SELECT, RESULTS, and PLAYING', () => {
  mockStorage.clear();
  const game = new BounceGame();

  // Initial state is MENU
  assert.strictEqual(game.currentState, STATE.MENU);

  // Open Level Select via Main Menu button
  game.levelsBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.LEVEL_SELECT, 'Transitions to LEVEL_SELECT');
  assert.strictEqual(game.levelSelectScreen.classList.contains('active'), true);
  assert.strictEqual(game.touchControls.classList.contains('controls-inactive'), true, 'Touch controls inactive in LEVEL_SELECT');

  // Back button returns to MENU
  game.levelSelectBackBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.MENU, 'Returns to MENU');

  // Re-open Level Select and start game via card
  game.openLevelSelect();
  const card1 = game.levelCardsGrid.children.find(c => c.getAttribute('data-level') === '1');
  card1.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.PLAYING, 'Starts PLAYING from level card');
  assert.strictEqual(game.touchControls.classList.contains('controls-inactive'), false, 'Touch controls active in PLAYING');

  // Trigger game over, results screen has button to open Level Select
  game.triggerGameOver('Void');
  assert.strictEqual(game.currentState, STATE.GAMEOVER);

  game.resultsLevelsBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(game.currentState, STATE.LEVEL_SELECT, 'Navigates from Results Screen to Level Select');
});

test('15. Interface Spacing & Mobile Safe Areas: Results screen and Level Select maintain proper layout metrics', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

  // Check Results actions zone has comfortable gap and layout
  assert.ok(css.includes('.results-actions-zone'), 'Contains .results-actions-zone');
  assert.ok(/gap:\s*1[2-6]px/.test(css), 'Results actions zone specifies comfortable 12-16px gap');

  // Check Results sub-actions has comfortable spacing
  assert.ok(css.includes('.results-sub-actions'), 'Contains .results-sub-actions');

  // Check world portal card styling exists
  assert.ok(css.includes('.world-portal-card'), 'Contains .world-portal-card');
  assert.ok(css.includes('.portal-vortex-aura'), 'Contains portal vortex aura styling');
  assert.ok(css.includes('.world-portal-card.locked'), 'Contains portal locked styling');

  // Check mobile safe area inset handling exists
  assert.ok(css.includes('env(safe-area-inset-bottom'), 'Respects mobile env(safe-area-inset-bottom)');
});
