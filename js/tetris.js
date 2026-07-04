/**
 * Tetris – PC version with T-spin / SRS support
 * Controls:
 *   ←/→        : Move
 *   ↓           : Soft drop
 *   Space       : Hard drop
 *   ↑ / X       : Rotate clockwise
 *   Z / Ctrl    : Rotate counter-clockwise
 *   A           : Rotate 180°
 *   C / Shift   : Hold
 *   P / Esc     : Pause
 */

// ── Constants ──────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 20;
const CELL = 30;          // px per cell
const HIDDEN_ROWS = 2;    // invisible rows above the board
const NEXT_COUNT = 5;     // how many next pieces to show

// Colours for each piece type (index 0 = empty)
const COLORS = [
  null,
  '#00f0f0', // I  – cyan
  '#f0f000', // O  – yellow
  '#a000f0', // T  – purple
  '#00f000', // S  – green
  '#f00000', // Z  – red
  '#0000f0', // J  – blue
  '#f0a000', // L  – orange
];

// Piece definitions: 4 rotation states, each state is an array of [row, col] offsets
const PIECES = {
  //       0            1            2            3
  I: [
    [[1,0],[1,1],[1,2],[1,3]],   // 0 – spawn horizontal (row 1)
    [[0,2],[1,2],[2,2],[3,2]],   // R – vertical col 2
    [[2,0],[2,1],[2,2],[2,3]],   // 2 – horizontal row 2
    [[0,1],[1,1],[2,1],[3,1]],   // L – vertical col 1
  ],
  O: [
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
  ],
  T: [
    [[0,1],[1,0],[1,1],[1,2]],   // 0  – flat top
    [[0,1],[1,1],[1,2],[2,1]],   // R  – right
    [[1,0],[1,1],[1,2],[2,1]],   // 2  – flat bottom
    [[0,1],[1,0],[1,1],[2,1]],   // L  – left
  ],
  S: [
    [[0,1],[0,2],[1,0],[1,1]],
    [[0,1],[1,1],[1,2],[2,2]],
    [[1,1],[1,2],[2,0],[2,1]],
    [[0,0],[1,0],[1,1],[2,1]],
  ],
  Z: [
    [[0,0],[0,1],[1,1],[1,2]],
    [[0,2],[1,1],[1,2],[2,1]],
    [[1,0],[1,1],[2,1],[2,2]],
    [[0,1],[1,0],[1,1],[2,0]],
  ],
  J: [
    [[0,0],[1,0],[1,1],[1,2]],
    [[0,1],[0,2],[1,1],[2,1]],
    [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,0],[2,1]],
  ],
  L: [
    [[0,2],[1,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]],
    [[1,0],[1,1],[1,2],[2,0]],
    [[0,0],[0,1],[1,1],[2,1]],
  ],
};

const PIECE_KEYS = ['I','O','T','S','Z','J','L'];
const PIECE_INDEX = { I:1, O:2, T:3, S:4, Z:5, J:6, L:7 };

// ── SRS Wall-Kick Tables ────────────────────────────────────────────────────
// kick[fromRotation][direction] = array of [rowDelta, colDelta] to try
// direction: 0=CW, 1=CCW
const KICKS_JLSTZ = [
  /* 0→R */ [[ 0, 0],[ 0,-1],[-1,-1],[+2, 0],[+2,-1]],
  /* R→2 */ [[ 0, 0],[ 0,+1],[+1,+1],[-2, 0],[-2,+1]],
  /* 2→L */ [[ 0, 0],[ 0,+1],[-1,+1],[+2, 0],[+2,+1]],
  /* L→0 */ [[ 0, 0],[ 0,-1],[+1,-1],[-2, 0],[-2,-1]],
];
const KICKS_JLSTZ_CCW = [
  /* 0→L */ [[ 0, 0],[ 0,+1],[-1,+1],[+2, 0],[+2,+1]],
  /* R→0 */ [[ 0, 0],[ 0,+1],[+1,+1],[-2, 0],[-2,+1]],
  /* 2→R */ [[ 0, 0],[ 0,-1],[-1,-1],[+2, 0],[+2,-1]],
  /* L→2 */ [[ 0, 0],[ 0,-1],[+1,-1],[-2, 0],[-2,-1]],
];
const KICKS_I_CW = [
  /* 0→R */ [[ 0, 0],[ 0,-2],[ 0,+1],[+1,-2],[-2,+1]],
  /* R→2 */ [[ 0, 0],[ 0,-1],[ 0,+2],[-2,-1],[+1,+2]],
  /* 2→L */ [[ 0, 0],[ 0,+2],[ 0,-1],[-1,+2],[+2,-1]],
  /* L→0 */ [[ 0, 0],[ 0,+1],[ 0,-2],[+2,+1],[-1,-2]],
];
const KICKS_I_CCW = [
  /* 0→L */ [[ 0, 0],[ 0,-1],[ 0,+2],[-2,-1],[+1,+2]],
  /* R→0 */ [[ 0, 0],[ 0,+2],[ 0,-1],[-1,+2],[+2,-1]],
  /* 2→R */ [[ 0, 0],[ 0,+1],[ 0,-2],[+2,+1],[-1,-2]],
  /* L→2 */ [[ 0, 0],[ 0,-2],[ 0,+1],[+1,-2],[-2,+1]],
];

// 180° kick table (simple – try 5 offsets)
function getKicks180(type, rot) {
  // For most pieces just try column shifts; I-piece needs row shifts too
  if (type === 'I') {
    return [[0,0],[0,1],[0,-1],[1,0],[-1,0]];
  }
  return [[0,0],[0,1],[0,-1],[-1,0],[1,0]];
}

function getKickTable(type, fromRot, dir) {
  // dir: +1 = CW, -1 = CCW, 2 = 180
  if (type === 'O') return [[0,0]]; // O never needs kicks
  if (type === 'I') {
    if (dir === +1) return KICKS_I_CW[fromRot];
    if (dir === -1) return KICKS_I_CCW[fromRot];
    return getKicks180(type, fromRot);
  }
  if (dir === +1) return KICKS_JLSTZ[fromRot];
  if (dir === -1) return KICKS_JLSTZ_CCW[fromRot];
  return getKicks180(type, fromRot);
}

// ── Scoring ────────────────────────────────────────────────────────────────
const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES        = [400, 800, 1200, 1600]; // 0,1,2,3 lines
const TSPIN_MINI_SCORES   = [100, 200];              // 0,1 lines (mini only 0-1)
const SOFT_DROP_SCORE     = 1;
const HARD_DROP_SCORE     = 2;

// ── Utilities ──────────────────────────────────────────────────────────────
function randomBag() {
  const bag = [...PIECE_KEYS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// ── Game State ─────────────────────────────────────────────────────────────
class Tetris {
  constructor() {
    this.boardCanvas  = document.getElementById('board-canvas');
    this.holdCanvas   = document.getElementById('hold-canvas');
    this.nextCanvas   = document.getElementById('next-canvas');
    this.bctx  = this.boardCanvas.getContext('2d');
    this.hctx  = this.holdCanvas.getContext('2d');
    this.nctx  = this.nextCanvas.getContext('2d');

    this.scoreEl     = document.getElementById('score');
    this.bestEl      = document.getElementById('best-score');
    this.levelEl     = document.getElementById('level');
    this.linesEl     = document.getElementById('lines');
    this.comboEl     = document.getElementById('combo');
    this.b2bEl       = document.getElementById('b2b');
    this.overlay     = document.getElementById('overlay');
    this.overlayTitle= document.getElementById('overlay-title');
    this.overlaySub  = document.getElementById('overlay-sub');
    this.overlayBtn  = document.getElementById('overlay-btn');
    this.actionEl    = document.getElementById('action-display');

    this.bestScore = parseInt(localStorage.getItem('tetris_best') || '0', 10);
    this.bestEl.textContent = this.bestScore;

    this.overlayBtn.addEventListener('click', () => this.start());
    document.addEventListener('keydown', (e) => this.onKey(e));

    this.rafId = null;
    this.state = 'idle'; // idle | playing | paused | gameover
    this.showMenu('TETRIS', 'Press any key or click START', 'START');
  }

  // ── Initialise / Reset ────────────────────────────────────────────────
  start() {
    this.board      = Array.from({length: ROWS + HIDDEN_ROWS}, () => new Array(COLS).fill(0));
    this.score      = 0;
    this.level      = 1;
    this.lines      = 0;
    this.combo      = -1;
    this.b2b        = -1;    // back-to-back counter
    this.held       = null;
    this.holdUsed   = false;
    this.bag        = [];
    this.queue      = [];
    this.lastAction = null;  // last rotation action for T-spin detection
    this.lastKickIdx= -1;    // which kick index was used

    for (let i = 0; i < NEXT_COUNT + 1; i++) this.fillQueue();
    this.spawn();

    this.updateUI();
    this.hideOverlay();
    this.state = 'playing';

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.lastTime = null;
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockMoves = 0;
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  fillQueue() {
    if (this.bag.length === 0) this.bag = randomBag();
    this.queue.push(this.bag.shift());
  }

  spawn() {
    const type = this.queue.shift();
    this.fillQueue();
    this.current = this.makePiece(type);
    this.lastAction = null;
    this.lastKickIdx = -1;

    // Check immediately for game over (overlap on spawn)
    if (!this.isValid(this.current.cells, this.current.row, this.current.col)) {
      this.gameOver();
    }
  }

  makePiece(type) {
    const cells = PIECES[type][0];
    // Centre horizontally; start at hidden rows area
    const col = Math.floor((COLS - 4) / 2);
    const row = 0; // top of hidden rows
    return { type, rot: 0, row, col, cells: cells.map(c => [...c]) };
  }

  // ── Game Loop ─────────────────────────────────────────────────────────
  loop(timestamp) {
    if (this.state !== 'playing') return;

    const dt = this.lastTime ? Math.min(timestamp - this.lastTime, 200) : 16;
    this.lastTime = timestamp;

    this.dropTimer += dt;
    const dropInterval = this.getDropInterval();

    if (this.dropTimer >= dropInterval) {
      this.dropTimer -= dropInterval;
      this.moveDown(false);
    }

    // Lock-down timer: runs every frame when piece is grounded
    const p = this.current;
    if (p && !this.isValid(p.cells, p.row + 1, p.col)) {
      this.lockTimer += dt;
      if (this.lockTimer >= 500) {
        this.lock();
      }
    } else {
      // Piece is airborne; reset lock timer
      this.lockTimer = 0;
    }

    this.render();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  getDropInterval() {
    // Guideline gravity: level 1 = ~1s, level 15 = ~0.02s
    return Math.max(50, 1000 * Math.pow(0.8 - (this.level - 1) * 0.007, this.level - 1));
  }

  // ── Movement & Rotation ───────────────────────────────────────────────
  isValid(cells, row, col) {
    for (const [r, c] of cells) {
      const nr = row + r;
      const nc = col + c;
      if (nc < 0 || nc >= COLS || nr >= ROWS + HIDDEN_ROWS) return false;
      if (nr >= 0 && this.board[nr][nc] !== 0) return false;
    }
    return true;
  }

  moveLeft()  { this.shift(0, -1); }
  moveRight() { this.shift(0, +1); }

  shift(dr, dc) {
    const p = this.current;
    if (this.isValid(p.cells, p.row + dr, p.col + dc)) {
      p.row += dr;
      p.col += dc;
      this.lastAction = null; // movement resets rotation flag but not T-spin count
      this.resetLock();
    }
  }

  // Soft / Hard drop
  moveDown(soft = true) {
    const p = this.current;
    if (this.isValid(p.cells, p.row + 1, p.col)) {
      p.row++;
      if (soft) {
        this.score += SOFT_DROP_SCORE;
        this.updateUI();
        this.lastAction = null; // soft drop resets rotation flag
      }
      // auto-gravity does NOT reset lastAction (T-spin flag kept)
      this.lockTimer = 0;
    }
    // grounded case: lock-down timer handled by the main loop
  }

  hardDrop() {
    const p = this.current;
    let dist = 0;
    while (this.isValid(p.cells, p.row + 1, p.col)) {
      p.row++;
      dist++;
    }
    this.score += HARD_DROP_SCORE * dist;
    this.updateUI();
    this.lock();
  }

  rotate(dir) {
    // dir: +1=CW, -1=CCW, 2=180
    const p = this.current;
    const fromRot = p.rot;
    const toRot = (fromRot + (dir === 2 ? 2 : dir === -1 ? 3 : 1)) % 4;
    const newCells = PIECES[p.type][toRot].map(c => [...c]);
    const kicks = getKickTable(p.type, fromRot, dir);

    for (let i = 0; i < kicks.length; i++) {
      const [dr, dc] = kicks[i];
      if (this.isValid(newCells, p.row + dr, p.col + dc)) {
        p.row += dr;
        p.col += dc;
        p.rot = toRot;
        p.cells = newCells;
        this.lastAction = { type: 'rotate', dir, fromRot, toRot, kickIdx: i };
        this.lastKickIdx = i;
        this.resetLock();
        return true;
      }
    }
    return false; // rotation failed
  }

  resetLock() {
    if (this.lockMoves < 15) {
      this.lockTimer = 0;
      this.lockMoves++;
    }
  }

  // ── Locking & Line Clear ──────────────────────────────────────────────
  lock() {
    const p = this.current;

    // Place piece on board
    for (const [r, c] of p.cells) {
      const nr = p.row + r;
      const nc = p.col + c;
      if (nr >= 0 && nr < ROWS + HIDDEN_ROWS) {
        this.board[nr][nc] = PIECE_INDEX[p.type];
      }
    }

    // T-spin detection
    const tspinResult = this.detectTSpin(p);

    // Clear lines
    const cleared = this.clearLines();

    // Scoring
    this.calcScore(cleared, tspinResult);

    // Hold unlock
    this.holdUsed = false;
    this.lockTimer = 0;
    this.lockMoves = 0;

    // Spawn next
    this.spawn();
    this.updateUI();
    this.renderHold();
    this.renderNext();
  }

  clearLines() {
    let cleared = 0;
    for (let r = ROWS + HIDDEN_ROWS - 1; r >= 0; r--) {
      if (this.board[r].every(c => c !== 0)) {
        this.board.splice(r, 1);
        this.board.unshift(new Array(COLS).fill(0));
        cleared++;
        r++; // re-check same index
      }
    }
    return cleared;
  }

  // ── T-spin Detection ─────────────────────────────────────────────────
  detectTSpin(p) {
    if (p.type !== 'T') return { type: 'none' };
    if (!this.lastAction || this.lastAction.type !== 'rotate') return { type: 'none' };

    // 3-corner rule: check all 4 corners of the T bounding box
    const corners = [
      [p.row,   p.col  ],   // top-left
      [p.row,   p.col+2],   // top-right
      [p.row+2, p.col  ],   // bottom-left
      [p.row+2, p.col+2],   // bottom-right
    ];

    let filled = 0;
    const filledArr = corners.map(([r, c]) => {
      const outOfBounds = r < 0 || r >= ROWS + HIDDEN_ROWS || c < 0 || c >= COLS;
      const v = outOfBounds || this.board[r][c] !== 0;
      if (v) filled++;
      return v;
    });

    if (filled < 3) return { type: 'none' };

    // Determine "front" corners based on rotation state
    // Rotation: 0=flat-top(front=top), 1=right(front=right), 2=flat-bottom(front=bottom), 3=left(front=left)
    const frontCorners = {
      0: [0, 1], // top-left, top-right
      1: [1, 3], // top-right, bottom-right
      2: [2, 3], // bottom-left, bottom-right
      3: [0, 2], // top-left, bottom-left
    };
    const front = frontCorners[p.rot];
    const frontFilled = front.filter(i => filledArr[i]).length;

    if (frontFilled === 2) {
      // Full T-spin (both front corners filled)
      return { type: 'tspin' };
    } else {
      // T-spin mini (only 1 front corner or last kick was kick 4/5 for I which doesn't apply)
      // Also: if the last kick index was 4 (5th kick), it's a full T-spin regardless
      if (this.lastKickIdx === 4) return { type: 'tspin' };
      return { type: 'tspin-mini' };
    }
  }

  // ── Score Calculation ──────────────────────────────────────────────────
  calcScore(cleared, tspinResult) {
    const lvl = this.level;
    let points = 0;
    let isBtBEligible = false;
    let actionName = '';

    if (tspinResult.type === 'tspin') {
      points = TSPIN_SCORES[cleared] * lvl;
      isBtBEligible = true;
      actionName = ['T-SPIN', 'T-SPIN SINGLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE'][cleared] || 'T-SPIN';
    } else if (tspinResult.type === 'tspin-mini') {
      const miniPoints = TSPIN_MINI_SCORES[Math.min(cleared, 1)] || 0;
      points = miniPoints * lvl;
      isBtBEligible = cleared > 0;
      actionName = cleared === 0 ? 'T-SPIN MINI' : 'T-SPIN MINI SINGLE';
    } else {
      points = LINE_SCORES[cleared] * lvl;
      isBtBEligible = cleared === 4; // Tetris
      if (cleared === 4) actionName = 'TETRIS';
      else if (cleared === 3) actionName = 'TRIPLE';
      else if (cleared === 2) actionName = 'DOUBLE';
      else if (cleared === 1) actionName = 'SINGLE';
      else if (tspinResult.type === 'tspin') actionName = 'T-SPIN';
    }

    // Back-to-back
    if (isBtBEligible && cleared > 0) {
      if (this.b2b >= 0) {
        points = Math.floor(points * 1.5);
        this.b2b++;
        actionName += '\nBACK-TO-BACK';
      } else {
        this.b2b = 0;
      }
    } else if (cleared > 0) {
      this.b2b = -1; // reset B2B
    }

    // Combo
    if (cleared > 0) {
      this.combo++;
      points += 50 * this.combo * lvl;
      if (this.combo > 0) actionName += (actionName ? '\n' : '') + `COMBO x${this.combo}`;
    } else {
      this.combo = -1;
    }

    // Perfect clear bonus
    const isPerfect = this.board.every(row => row.every(c => c === 0));
    if (isPerfect && cleared > 0) {
      points += 3500 * lvl;
      actionName += '\nPERFECT CLEAR!';
    }

    this.score += points;
    this.lines += cleared;

    // Level up every 10 lines
    this.level = Math.floor(this.lines / 10) + 1;

    // Best score
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('tetris_best', this.bestScore);
    }

    if (actionName) this.showAction(actionName);
  }

  // ── Hold ──────────────────────────────────────────────────────────────
  hold() {
    if (this.holdUsed) return;
    const p = this.current;
    const prevHeld = this.held;
    this.held = p.type;
    this.holdUsed = true;
    if (prevHeld) {
      this.current = this.makePiece(prevHeld);
      if (!this.isValid(this.current.cells, this.current.row, this.current.col)) {
        this.gameOver();
        return;
      }
    } else {
      this.spawn();
    }
    this.lastAction = null;
    this.renderHold();
  }

  // ── Ghost Piece ────────────────────────────────────────────────────────
  getGhostRow() {
    const p = this.current;
    let gr = p.row;
    while (this.isValid(p.cells, gr + 1, p.col)) gr++;
    return gr;
  }

  // ── Rendering ─────────────────────────────────────────────────────────
  render() {
    const ctx = this.bctx;
    ctx.clearRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);

    this.drawGrid(ctx);
    this.drawBoard(ctx);
    this.drawGhost(ctx);
    this.drawPiece(ctx, this.current, this.current.row - HIDDEN_ROWS, this.current.col);

    // Lock-down flash when piece is about to lock
    const p = this.current;
    if (!this.isValid(p.cells, p.row + 1, p.col) && this.lockTimer > 300) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);
    }
  }

  drawGrid(ctx) {
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 0.5;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.strokeRect(c * CELL, r * CELL, CELL, CELL);
      }
    }
  }

  drawBoard(ctx) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = this.board[r + HIDDEN_ROWS][c];
        if (val) this.drawCell(ctx, r, c, COLORS[val]);
      }
    }
  }

  drawGhost(ctx) {
    const p = this.current;
    const gr = this.getGhostRow();
    if (gr === p.row) return; // on top of current piece
    const color = COLORS[PIECE_INDEX[p.type]];
    for (const [r, c] of p.cells) {
      const nr = gr + r - HIDDEN_ROWS;
      const nc = p.col + c;
      if (nr >= 0 && nr < ROWS) {
        this.drawCellGhost(ctx, nr, nc, color);
      }
    }
  }

  drawPiece(ctx, piece, rowOffset, colOffset) {
    const color = COLORS[PIECE_INDEX[piece.type]];
    for (const [r, c] of piece.cells) {
      const nr = rowOffset + r;
      const nc = colOffset + c;
      if (nr >= 0 && nr < ROWS) {
        this.drawCell(ctx, nr, nc, color);
      }
    }
  }

  drawCell(ctx, row, col, color) {
    const x = col * CELL;
    const y = row * CELL;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 1, y + 1, CELL - 2, 4);
    ctx.fillRect(x + 1, y + 1, 4, CELL - 2);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 1, y + CELL - 5, CELL - 2, 4);
    ctx.fillRect(x + CELL - 5, y + 1, 4, CELL - 2);
  }

  drawCellGhost(ctx, row, col, color) {
    const x = col * CELL;
    const y = row * CELL;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
    ctx.globalAlpha = 1;
  }

  renderHold() {
    const ctx = this.hctx;
    ctx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
    if (!this.held) return;
    this.drawMiniPiece(ctx, this.held, this.holdCanvas.width, this.holdCanvas.height, this.holdUsed);
  }

  renderNext() {
    const ctx = this.nctx;
    ctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    for (let i = 0; i < NEXT_COUNT; i++) {
      const type = this.queue[i];
      if (!type) continue;
      this.drawMiniPieceAt(ctx, type, this.nextCanvas.width, i * 108 + 54, false);
    }
  }

  drawMiniPiece(ctx, type, canvasW, canvasH, dimmed) {
    this.drawMiniPieceAt(ctx, type, canvasW, canvasH / 2, dimmed);
  }

  drawMiniPieceAt(ctx, type, canvasW, centerY, dimmed) {
    const cells = PIECES[type][0];
    const size = type === 'I' ? 22 : 24;
    const gap = 2;
    const color = COLORS[PIECE_INDEX[type]];
    const alpha = dimmed ? 0.35 : 1.0;

    // Bounding box
    const minR = Math.min(...cells.map(c => c[0]));
    const maxR = Math.max(...cells.map(c => c[0]));
    const minC = Math.min(...cells.map(c => c[1]));
    const maxC = Math.max(...cells.map(c => c[1]));
    const w = (maxC - minC + 1) * (size + gap);
    const h = (maxR - minR + 1) * (size + gap);
    const ox = (canvasW - w) / 2 - minC * (size + gap);
    const oy = centerY - h / 2 - minR * (size + gap);

    ctx.globalAlpha = alpha;
    for (const [r, c] of cells) {
      const x = ox + c * (size + gap);
      const y = oy + r * (size + gap);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, size, 4);
      ctx.fillRect(x, y, 4, size);
    }
    ctx.globalAlpha = 1;
  }

  // ── UI ────────────────────────────────────────────────────────────────
  updateUI() {
    this.scoreEl.textContent = this.score.toLocaleString();
    this.bestEl.textContent  = this.bestScore.toLocaleString();
    this.levelEl.textContent = this.level;
    this.linesEl.textContent = this.lines;
    this.comboEl.textContent = this.combo >= 0 ? `x${this.combo + 1}` : '-';
    this.b2bEl.textContent   = this.b2b >= 0 ? `x${this.b2b + 1}` : '-';
  }

  showAction(text) {
    this.actionEl.innerHTML = text.replace(/\n/g, '<br>');
    this.actionEl.classList.add('show');
    clearTimeout(this._actionTimer);
    this._actionTimer = setTimeout(() => {
      this.actionEl.classList.remove('show');
    }, 1800);
  }

  showMenu(title, sub, btnText) {
    this.overlayTitle.textContent = title;
    this.overlaySub.textContent   = sub;
    this.overlayBtn.textContent   = btnText;
    this.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.overlay.classList.add('hidden');
  }

  // ── Game Over / Pause ─────────────────────────────────────────────────
  gameOver() {
    this.state = 'gameover';
    cancelAnimationFrame(this.rafId);
    this.showMenu('GAME OVER', `Score: ${this.score.toLocaleString()}  Best: ${this.bestScore.toLocaleString()}`, 'RETRY');
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      cancelAnimationFrame(this.rafId);
      this.showMenu('PAUSED', 'Press P or Esc to resume', 'RESUME');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hideOverlay();
      this.lastTime = null;
      this.rafId = requestAnimationFrame((t) => this.loop(t));
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────
  onKey(e) {
    if (this.state === 'idle') {
      if (e.code !== 'Tab') {
        this.start();
        e.preventDefault();
      }
      return;
    }

    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.state === 'gameover') return;
      this.togglePause();
      e.preventDefault();
      return;
    }

    if (this.state !== 'playing') return;

    switch (e.code) {
      case 'ArrowLeft':
        this.moveLeft();
        e.preventDefault();
        break;
      case 'ArrowRight':
        this.moveRight();
        e.preventDefault();
        break;
      case 'ArrowDown':
        this.moveDown(true);
        this.dropTimer = 0;
        e.preventDefault();
        break;
      case 'Space':
        this.hardDrop();
        e.preventDefault();
        break;
      case 'ArrowUp':
      case 'KeyX':
        this.rotate(+1);
        e.preventDefault();
        break;
      case 'KeyZ':
      case 'ControlLeft':
      case 'ControlRight':
        this.rotate(-1);
        e.preventDefault();
        break;
      case 'KeyA':
        this.rotate(2);
        e.preventDefault();
        break;
      case 'KeyC':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.hold();
        e.preventDefault();
        break;
    }
  }
}

// ── Key repeat (DAS/ARR) ───────────────────────────────────────────────────
// Delayed Auto Shift: 167ms delay, 33ms repeat (approx Guideline defaults)
const DAS = 167;
const ARR = 33;
const held = {};
const dasTimers = {};
const arrIntervals = {};

document.addEventListener('keydown', (e) => {
  if (held[e.code]) return;
  held[e.code] = true;

  if (['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.code)) {
    dasTimers[e.code] = setTimeout(() => {
      arrIntervals[e.code] = setInterval(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: e.code, bubbles: true }));
      }, ARR);
    }, DAS);
  }
});

document.addEventListener('keyup', (e) => {
  held[e.code] = false;
  clearTimeout(dasTimers[e.code]);
  clearInterval(arrIntervals[e.code]);
  delete dasTimers[e.code];
  delete arrIntervals[e.code];
});

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  window._tetris = new Tetris();
  // Initial renders
  window._tetris.renderHold();
  window._tetris.renderNext();
});
