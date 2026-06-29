// ============================================================
// ANIM.JS - Canvas overlay animations (troop movements, planes, battles)
// ============================================================

const ANIM = {
  _canvas: null,
  _ctx: null,
  _items: [],
  _raf: null,

  init() {
    const container = document.getElementById('map-container');
    if (!container) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'anim-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:20;';
    container.appendChild(canvas);
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  },

  _resize() {
    if (!this._canvas) return;
    const c = document.getElementById('map-container');
    if (!c) return;
    this._canvas.width  = c.clientWidth;
    this._canvas.height = c.clientHeight;
  },

  _loop() {
    if (!this._ctx || !this._canvas) return;
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const now = performance.now();
    this._items = this._items.filter(a => {
      const t = Math.min(1, (now - a.start) / a.duration);
      a.draw(this._ctx, t);
      if (t >= 1 && a.onDone) { a.onDone(); }
      return t < 1;
    });
    if (this._items.length > 0) {
      this._raf = requestAnimationFrame(() => this._loop());
    } else {
      this._raf = null;
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
  },

  _add(item) {
    item.start = performance.now();
    this._items.push(item);
    if (!this._raf) this._raf = requestAnimationFrame(() => this._loop());
  },

  // Quadratic bezier point
  _bezier(from, to, t) {
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2 - Math.hypot(to.x - from.x, to.y - from.y) * 0.25;
    return {
      x: (1-t)*(1-t)*from.x + 2*(1-t)*t*mx + t*t*to.x,
      y: (1-t)*(1-t)*from.y + 2*(1-t)*t*my + t*t*to.y,
      mx, my,
    };
  },

  // ── PLANE / SUPPLY AIRLIFT ───────────────────────────────

  showPlane(fromId, toId, { emoji = '✈️', label = '', color = '#c9a227', duration = 3500, onDone = null } = {}) {
    const from = MAP.getCountryCenter(fromId);
    const to   = MAP.getCountryCenter(toId);
    if (!from || !to) { if (onDone) onDone(); return; }
    const eta  = Math.ceil(duration / 1000);

    this._add({
      duration,
      onDone,
      draw: (ctx, t) => {
        const { x: px, y: py, mx, my } = this._bezier(from, to, t);

        // Trail line
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(mx, my, to.x, to.y);
        ctx.strokeStyle = `rgba(${color === '#c9a227' ? '201,162,39' : '255,80,80'},${0.55 - t * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.restore();

        // Origin dot
        ctx.beginPath();
        ctx.arc(from.x, from.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Moving icon
        ctx.font = '18px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, px, py);

        // Label + ETA
        if (label) {
          const remaining = Math.ceil((1 - t) * eta);
          ctx.font = 'bold 9px "Courier New"';
          ctx.fillStyle = color;
          ctx.fillText(`${label} · ${remaining}s`, px, py - 16);
        }
      },
    });
  },

  // ── TROOP MOVEMENT ───────────────────────────────────────

  showTroops(fromId, toId, { count = 0, onDone = null, duration = 4000 } = {}) {
    const from = MAP.getCountryCenter(fromId);
    const to   = MAP.getCountryCenter(toId);
    if (!from || !to) { if (onDone) onDone(); return; }

    this._add({
      duration,
      onDone,
      draw: (ctx, t) => {
        const { x: px, y: py, mx, my } = this._bezier(from, to, t);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(mx, my, to.x, to.y);
        ctx.strokeStyle = `rgba(255,60,60,${0.6 - t * 0.4})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();

        // Multiple soldiers offset slightly
        const offsets = [[-8,-4],[0,0],[8,4]];
        const num = count > 500 ? 3 : count > 100 ? 2 : 1;
        for (let i = 0; i < num; i++) {
          const [ox, oy] = offsets[i];
          ctx.font = '13px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🪖', px + ox, py + oy);
        }

        if (count > 0) {
          ctx.font = 'bold 9px "Courier New"';
          ctx.fillStyle = '#ff6666';
          ctx.textAlign = 'center';
          ctx.fillText(count.toLocaleString() + ' soldados', px, py - 16);
        }
      },
    });
  },

  // ── BATTLE PULSE ────────────────────────────────────────

  showBattle(countryId, duration = 3000) {
    const pos = MAP.getCountryCenter(countryId);
    if (!pos) return;
    this._add({
      duration,
      draw: (ctx, t) => {
        const pulse = (Math.sin(t * Math.PI * 8) + 1) / 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 20 + pulse * 10, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,40,40,${0.08 * pulse})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,120,0,${0.7 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '20px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚔️', pos.x, pos.y);
      },
    });
  },

  // ── EXPLOSION / ARRIVAL ─────────────────────────────────

  showExplosion(countryId, emoji = '💥') {
    const pos = MAP.getCountryCenter(countryId);
    if (!pos) return;
    this._add({
      duration: 1200,
      draw: (ctx, t) => {
        const size = 16 + t * 22;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.font = `${Math.round(size)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, pos.x, pos.y - t * 20);
        ctx.restore();
      },
    });
  },

  // ── SPY INFILTRATION ────────────────────────────────────

  showSpy(fromId, toId) {
    this.showPlane(fromId, toId, { emoji: '🕵️', color: '#8844cc', duration: 2500, label: 'agente' });
  },
};
