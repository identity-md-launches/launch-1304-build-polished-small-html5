import { COLS, ROWS, HOP_DURATION, COIN_POINTS, hasPad, type GameState, type GameEvent } from './game.js';

/** The drawing uses logical pixels so gameplay remains the same at every screen size. */
export const SCENE_WIDTH = 900;
export const SCENE_HEIGHT = 620;

const PALETTE = {
  waterDeep: '#143e3b',
  water: '#20554e',
  waterLight: '#2c6559',
  ripple: '#78a991',
  padEdge: '#4f8061',
  pad: '#92bc72',
  padLight: '#aed187',
  frog: '#bde477',
  frogShade: '#82b653',
  frogBelly: '#d6ee9c',
  ink: '#173e35',
  cream: '#f7f4df',
  coin: '#f1c65f',
  coinEdge: '#bd853c',
  danger: '#e9977f',
  dangerDeep: '#9f544c',
};

type Effect = { kind: 'coin' | 'hit' | 'hop'; x: number; y: number; started: number };

function cellPoint(x: number, y: number) {
  return { x: 126 + x * 108, y: 98 + y * 84 };
}

/** Original vector pond artwork, with no downloaded images or runtime requests. */
export class PondRenderer {
  private readonly context: CanvasRenderingContext2D;
  private effects: Effect[] = [];
  private width = 0;
  private height = 0;
  private frame = { left: 0, top: 0, right: SCENE_WIDTH, bottom: SCENE_HEIGHT };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser does not support the pond canvas.');
    this.context = context;
    this.resize();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (width !== this.width || height !== this.height) {
      this.width = this.canvas.width = width;
      this.height = this.canvas.height = height;
    }
  }

  addEffects(events: GameEvent[], visualTime: number) {
    for (const event of events) {
      if (event.type === 'coin' || event.type === 'hit' || event.type === 'hop') {
        const point = cellPoint(event.x, event.y);
        this.effects.push({ kind: event.type, ...point, started: visualTime });
      }
    }
    this.effects = this.effects.slice(-30);
  }

  /** Round time starts at zero again after a restart; discard the previous round's particles. */
  clearEffects() {
    this.effects = [];
  }

  draw(state: GameState, visualTime: number, reducedMotion = false) {
    this.resize();
    const ctx = this.context;
    ctx.setTransform(this.width / SCENE_WIDTH, 0, 0, this.height / SCENE_HEIGHT, 0, 0);
    ctx.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.waterBackground();
    // Fit the illustration without stretching circles or cropping playable pads.
    // Any spare space remains part of the full-bleed pond behind the artwork.
    const scale = Math.min(this.width / SCENE_WIDTH, this.height / SCENE_HEIGHT);
    const offsetX = (this.width - SCENE_WIDTH * scale) / 2;
    const offsetY = (this.height - SCENE_HEIGHT * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    this.frame = {
      left: -offsetX / scale,
      top: -offsetY / scale,
      right: (this.width - offsetX) / scale,
      bottom: (this.height - offsetY) / scale,
    };
    const ambient = reducedMotion ? 0 : state.elapsed;
    this.waterDetails(ambient, state.phase === 'title');
    if (state.phase === 'title') {
      this.titlePond();
      return;
    }
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const { x, y } = cellPoint(col, row);
        if (hasPad(col, row)) {
          const seed = (col * 13 + row * 7) % 11;
          const bob = Math.sin(ambient * 1.5 + seed) * 1.25;
          this.pad(x, y + bob, 43 + seed % 4, 31 + seed % 3, seed * 0.63, seed % 2 === 0);
        } else {
          this.ripple(x, y, 33, 14, 0.17);
          this.ellipse(x, y, 3, 1.5, '#6e9a85', 0.55);
        }
      }
    }
    for (const coin of state.coins) {
      const point = cellPoint(coin.x, coin.y);
      const bob = reducedMotion ? 0 : Math.sin(ambient * 3 + coin.id) * 3;
      this.coin(point.x, point.y - 13 + bob, 14);
    }
    for (const hazard of state.hazards) {
      const point = cellPoint(hazard.x, hazard.y);
      this.beetle(point.x, point.y - 7, hazard.speed < 0 ? -1 : 1, ambient);
    }
    const progress = Math.min(1, state.frog.hopElapsed / HOP_DURATION);
    const eased = progress * progress * (3 - 2 * progress);
    const from = cellPoint(state.frog.previousX, state.frog.previousY);
    const to = cellPoint(state.frog.x, state.frog.y);
    const x = reducedMotion ? to.x : from.x + (to.x - from.x) * eased;
    const y = reducedMotion ? to.y : from.y + (to.y - from.y) * eased;
    const lift = reducedMotion ? 0 : Math.sin(progress * Math.PI) * 27;
    if (state.invulnerableRemaining > 0) {
      this.ripple(x, y, 39, 25, 0.9, PALETTE.cream, 2.5);
    }
    this.ellipse(x, y + 4, 24 - lift * 0.2, 10 - lift * 0.06, PALETTE.waterDeep, 0.4);
    this.frog(x, y - 12 - lift, 0.76, ambient);
    if (!reducedMotion) this.drawEffects(visualTime);
    else this.effects = [];
  }

  private ellipse(x: number, y: number, rx: number, ry: number, color: string, alpha = 1) {
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private ripple(x: number, y: number, rx: number, ry: number, alpha = 0.3, color = PALETTE.ripple, width = 1.5) {
    const ctx = this.context;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.05, Math.PI * 0.08, Math.PI * 0.86);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.05, Math.PI * 1.1, Math.PI * 1.86);
    ctx.stroke();
    ctx.restore();
  }

  private waterBackground() {
    const ctx = this.context;
    const gradient = ctx.createLinearGradient(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    gradient.addColorStop(0, PALETTE.waterDeep);
    gradient.addColorStop(0.65, PALETTE.water);
    gradient.addColorStop(1, '#1a4842');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    // Broad underwater silhouettes give the flat illustration a little depth.
    ctx.fillStyle = '#2b6054';
    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    ctx.moveTo(370, -40);
    ctx.bezierCurveTo(720, 38, 570, 260, 910, 300);
    ctx.lineTo(940, -40);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-80, 415);
    ctx.bezierCurveTo(160, 250, 235, 690, 640, 650);
    ctx.lineTo(-80, 680);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private waterDetails(time: number, title: boolean) {
    const ripples = title
      ? [[575, 115, 51, 14], [785, 225, 46, 13], [685, 492, 96, 25], [330, 520, 44, 10], [467, 388, 28, 8], [155, 550, 28, 8]]
      : [[244, 48, 45, 10], [620, 569, 62, 13], [47, 267, 28, 13], [841, 369, 26, 12]];
    for (let index = 0; index < ripples.length; index++) {
      const [x, y, rx, ry] = ripples[index];
      this.ripple(x + Math.sin(time * 0.2 + index) * 2, y, rx, ry, 0.28);
    }
    for (let index = 0; index < 38; index++) {
      const x = (index * 197 + 51) % SCENE_WIDTH;
      const y = (index * 139 + 23) % SCENE_HEIGHT;
      this.ellipse(x, y + Math.sin(time * 0.6 + index) * 2, index % 4 === 0 ? 2.2 : 1.2, index % 4 === 0 ? 1.3 : 0.8, '#bfd39b', 0.18 + index % 3 * 0.08);
    }
    // Edge vegetation stays away from every playable cell.
    this.reeds(this.frame.left - 5, this.frame.top + 112, 1, -0.18);
    this.reeds(this.frame.right + 2, this.frame.bottom - 46, 1.08, 0.35);
    this.reeds(this.frame.left + 16, this.frame.bottom + 2, 0.66, -0.35);
    this.lotus(this.frame.right - 54, this.frame.top + 59, 0.62, -0.2);
    this.lotus(this.frame.left + 45, this.frame.bottom - 154, 0.44, 0.2);
    this.pad(this.frame.right - 19, this.frame.top + 164, 35, 24, 0.4, false, 0.56);
    this.pad(this.frame.left + 66, this.frame.top + 46, 34, 23, 2.8, false, 0.54);
  }

  private pad(x: number, y: number, rx: number, ry: number, rotation = 0, light = false, alpha = 1) {
    const ctx = this.context;
    this.ellipse(x + 1, y + 7, rx + 3, ry + 2, '#102e2c', 0.29 * alpha);
    this.ripple(x, y + 4, rx + 10, ry + 5, 0.13 * alpha);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    // A small open wedge makes the landing surface unmistakably a lily pad.
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.arc(0, 0, rx, 0.21, Math.PI * 2 - 0.2);
    ctx.closePath();
    ctx.fillStyle = light ? PALETTE.padLight : PALETTE.pad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#bed58d';
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, rx - 4, 0.3, 2.95);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.padEdge;
    ctx.globalAlpha = alpha * 0.27;
    ctx.lineWidth = 1.5;
    for (const angle of [1.15, 2.2, 3.3, 4.4, 5.3]) {
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.quadraticCurveTo(Math.cos(angle) * rx * 0.3, Math.sin(angle) * rx * 0.55, Math.cos(angle) * rx * 0.81, Math.sin(angle) * rx * 0.81);
      ctx.stroke();
    }
    ctx.restore();
  }

  private frog(x: number, y: number, scale: number, time = 0) {
    const ctx = this.context;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // Back feet and palms make the silhouette readable even at a small size.
    this.ellipse(-29, 24, 15, 9, PALETTE.frogShade);
    this.ellipse(29, 24, 15, 9, PALETTE.frogShade);
    this.ellipse(-27, 28, 17, 6.5, PALETTE.frog);
    this.ellipse(27, 28, 17, 6.5, PALETTE.frog);
    this.ellipse(0, 8, 35, 31, PALETTE.frogShade);
    this.ellipse(0, 3, 34, 31, PALETTE.frog);
    this.ellipse(0, 15, 23, 15, PALETTE.frogBelly);
    this.ellipse(-21, -22, 16, 17, PALETTE.frogShade);
    this.ellipse(21, -22, 16, 17, PALETTE.frogShade);
    this.ellipse(-21, -24, 15, 16, PALETTE.frog);
    this.ellipse(21, -24, 15, 16, PALETTE.frog);
    const blink = time > 0 && time % 6.7 > 6.56;
    if (blink) {
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 3;
      for (const eye of [-21, 21]) {
        ctx.beginPath();
        ctx.moveTo(eye - 6, -24);
        ctx.lineTo(eye + 6, -24);
        ctx.stroke();
      }
    } else {
      this.ellipse(-21, -25, 10, 11, PALETTE.cream);
      this.ellipse(21, -25, 10, 11, PALETTE.cream);
      this.ellipse(-19, -24, 4.8, 6.2, PALETTE.ink);
      this.ellipse(23, -24, 4.8, 6.2, PALETTE.ink);
      this.ellipse(-20, -27, 1.7, 2, '#ffffff');
      this.ellipse(22, -27, 1.7, 2, '#ffffff');
    }
    this.ellipse(-22, 2, 6, 3.5, '#dcaa76', 0.66);
    this.ellipse(22, 2, 6, 3.5, '#dcaa76', 0.66);
    this.ellipse(-5.5, -4, 1.6, 1.8, PALETTE.ink);
    this.ellipse(5.5, -4, 1.6, 1.8, PALETTE.ink);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-12, 6);
    ctx.quadraticCurveTo(0, 17, 12, 6);
    ctx.stroke();
    this.ellipse(-19, 21, 6, 8, PALETTE.frog);
    this.ellipse(19, 21, 6, 8, PALETTE.frog);
    ctx.restore();
  }

  private coin(x: number, y: number, radius: number) {
    const ctx = this.context;
    this.ellipse(x, y + radius + 6, radius * 0.75, 3, '#102e2c', 0.19);
    this.ellipse(x, y + 2.5, radius, radius, PALETTE.coinEdge);
    this.ellipse(x, y, radius, radius, PALETTE.coin);
    ctx.save();
    ctx.strokeStyle = '#ffe7a3';
    ctx.lineWidth = Math.max(1.3, radius * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.71, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#a97931';
    ctx.lineWidth = Math.max(2, radius * 0.16);
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.32);
    ctx.lineTo(x, y + radius * 0.32);
    ctx.stroke();
    ctx.restore();
  }

  private beetle(x: number, y: number, direction: number, time: number) {
    const ctx = this.context;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(direction, 1);
    this.ripple(-12, 10, 37, 16, 0.37);
    ctx.strokeStyle = PALETTE.danger;
    ctx.lineWidth = 3.5;
    for (const side of [-1, 1]) {
      for (let leg = -1; leg <= 1; leg++) {
        const flick = Math.sin(time * 13 + leg * 1.4) * 2;
        ctx.beginPath();
        ctx.moveTo(leg * 10, side * 7);
        ctx.lineTo(leg * 14 - 5, side * 17 + flick);
        ctx.lineTo(leg * 18 + 1, side * 21 + flick);
        ctx.stroke();
      }
    }
    this.ellipse(-2, 3, 23, 15, '#102e2c', 0.36);
    this.ellipse(-3, 0, 21, 14, PALETTE.dangerDeep);
    this.ellipse(-5, -3, 20, 13, PALETTE.danger);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = PALETTE.dangerDeep;
    ctx.beginPath();
    ctx.moveTo(-24, -2);
    ctx.lineTo(11, -2);
    ctx.stroke();
    this.ellipse(-13, -7, 3, 2.5, '#f6c3a1', 0.9);
    this.ellipse(13, -3, 8, 11, '#b76858');
    this.ellipse(18, -9, 4, 4, PALETTE.cream);
    this.ellipse(18, 2, 4, 4, PALETTE.cream);
    this.ellipse(20, -9, 1.8, 2.2, PALETTE.ink);
    this.ellipse(20, 2, 1.8, 2.2, PALETTE.ink);
    ctx.restore();
  }

  private lotus(x: number, y: number, scale: number, rotation: number) {
    const ctx = this.context;
    this.pad(x, y + 14 * scale, 44 * scale, 25 * scale, 2.7, false, 0.8);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    for (let index = -2; index <= 2; index++) {
      ctx.save();
      ctx.rotate(index * 0.4);
      ctx.fillStyle = index % 2 === 0 ? '#e4b6a9' : '#f5d5bb';
      ctx.beginPath();
      ctx.moveTo(0, 9);
      ctx.bezierCurveTo(-21, -2, -11, -24, 0, -33);
      ctx.bezierCurveTo(11, -24, 21, -2, 0, 9);
      ctx.fill();
      ctx.restore();
    }
    this.ellipse(0, 4, 11, 5, '#edc766');
    ctx.restore();
  }

  private reeds(x: number, y: number, scale: number, rotation: number) {
    const ctx = this.context;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    for (let index = -2; index <= 2; index++) {
      ctx.fillStyle = index % 2 ? '#719877' : '#5d856d';
      ctx.beginPath();
      ctx.moveTo(index * 9, 30);
      ctx.quadraticCurveTo(index * 17 - 15, -20, index * 24 - 6, -72 + Math.abs(index) * 12);
      ctx.quadraticCurveTo(index * 15 + 11, -24, index * 9 + 5, 30);
      ctx.fill();
    }
    ctx.restore();
  }

  private titlePond() {
    const ctx = this.context;
    this.pad(632, 108, 44, 28, 4.3, true);
    this.coin(633, 88, 19);
    this.pad(492, 461, 48, 32, 0.6, false);
    this.pad(812, 440, 43, 29, 1.4, true);
    this.coin(812, 417, 17);
    this.pad(795, 124, 25, 16, 1.8, false, 0.6);
    this.lotus(489, 197, 0.9, -0.18);
    this.ripple(673, 388, 144, 60, 0.29);
    this.ripple(673, 389, 162, 68, 0.15);
    this.pad(673, 356, 124, 78, 0.63, true);
    this.ellipse(678, 361, 61, 24, '#49775a', 0.35);
    this.frog(674, 314, 2.4);
    this.beetle(582, 553, 1, 0);
    // Small hand-drawn glints guide the eye toward the frog without UI clutter.
    ctx.save();
    ctx.strokeStyle = '#c3d3a0';
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2.3;
    for (const [x, y, length] of [[782, 264, 8], [549, 290, 5], [735, 180, 5]]) {
      ctx.beginPath();
      ctx.moveTo(x - length, y);
      ctx.lineTo(x + length, y);
      ctx.moveTo(x, y - length);
      ctx.lineTo(x, y + length);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEffects(visualTime: number) {
    const ctx = this.context;
    this.effects = this.effects.filter(effect => visualTime - effect.started < 0.65);
    for (const effect of this.effects) {
      const t = Math.max(0, (visualTime - effect.started) / 0.65);
      if (effect.kind === 'hop') {
        this.ripple(effect.x, effect.y, 22 + t * 20, 10 + t * 8, (1 - t) * 0.6);
        continue;
      }
      for (let index = 0; index < 7; index++) {
        const angle = (index / 7) * Math.PI * 2;
        const distance = 12 + t * 35;
        const px = effect.x + Math.cos(angle) * distance;
        const py = effect.y + Math.sin(angle) * distance * 0.7 - t * 15;
        this.ellipse(px, py, (1 - t) * 3.5, (1 - t) * 3.5, effect.kind === 'coin' ? PALETTE.coin : '#b3d5c0', 1 - t);
      }
      if (effect.kind === 'coin') {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t * 1.1);
        ctx.font = '700 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.cream;
        ctx.fillText(`+${COIN_POINTS}`, effect.x, effect.y - 30 - t * 28);
        ctx.restore();
      } else {
        this.ripple(effect.x, effect.y, 20 + t * 38, 10 + t * 17, (1 - t) * 0.75, '#bfd9c5', 2);
      }
    }
  }
}
