// ============================================================
// MAP.JS - Interactive SVG world map (D3 + topojson)
// ============================================================

const MAP = {
  _world: null,
  svg: null,
  g: null,
  zoom: null,
  projection: null,
  geoPath: null,
  initialized: false,

  // ISO numeric → game country ID
  ISO_TO_GAME: {
    // América del Norte
    840: 'usa',       124: 'canada',      484: 'mexico',
    // América Central
    192: 'cuba',
    // América del Sur
    862: 'venezuela', 170: 'colombia',     76: 'brazil',
     32: 'argentina', 152: 'chile',       604: 'peru',
    // Europa
    826: 'uk',        276: 'germany',     250: 'france',
    724: 'spain',     380: 'italy',       616: 'poland',
    643: 'russia',    804: 'ukraine',     792: 'turkey',
    // Medio Oriente
    364: 'iran',      376: 'israel',      682: 'saudi_arabia',    818: 'egypt',
    // Asia
    156: 'china',     392: 'japan',       410: 'south_korea',     408: 'north_korea',
    356: 'india',     586: 'pakistan',
    // Asia del Sudeste
    360: 'indonesia',
    // Oceanía
     36: 'australia',
    // África
    566: 'nigeria',   231: 'ethiopia',    710: 'south_africa',
  },

  init() {
    this._world = WORLD_TOPO;
    this._build();
    this.initialized = true;
    document.getElementById('map-loading').classList.add('hidden');
    if (typeof ANIM !== 'undefined') ANIM.init();
  },

  getCountryCenter(gameId) {
    if (!this.geoPath || !this._world || !this.svg) return null;
    const isoEntry = Object.entries(this.ISO_TO_GAME).find(([, gid]) => gid === gameId);
    if (!isoEntry) return null;
    const isoNum   = +isoEntry[0];
    const features = topojson.feature(this._world, this._world.objects.countries).features;
    const feat     = features.find(f => +f.id === isoNum);
    if (!feat) return null;
    const [cx, cy] = this.geoPath.centroid(feat);
    if (isNaN(cx) || isNaN(cy)) return null;
    const t = d3.zoomTransform(this.svg.node());
    return { x: t.applyX(cx), y: t.applyY(cy) };
  },

  _container() {
    return document.getElementById('map-container');
  },

  _dims() {
    const c = this._container();
    return { W: c.clientWidth || 900, H: c.clientHeight || 520 };
  },

  _build() {
    const { W, H } = this._dims();

    this.projection = d3.geoNaturalEarth1()
      .scale(W / 6.4)
      .translate([W / 2, H / 2]);

    this.geoPath = d3.geoPath().projection(this.projection);

    this.svg = d3.select('#map-svg')
      .attr('width', W)
      .attr('height', H);

    // Ocean background
    this.svg.append('rect')
      .attr('class', 'map-ocean')
      .attr('width', W)
      .attr('height', H);

    // Graticule (grid lines)
    const graticule = d3.geoGraticule()();
    this.svg.append('path')
      .datum(graticule)
      .attr('class', 'graticule')
      .attr('d', this.geoPath);

    this.g = this.svg.append('g').attr('class', 'map-g');

    const features = topojson.feature(this._world, this._world.objects.countries).features;

    // Country fills
    this.g.selectAll('path.country-path')
      .data(features)
      .enter()
      .append('path')
      .attr('class', 'country-path')
      .attr('d', this.geoPath)
      .on('click', (event, d) => {
        const gid = this.ISO_TO_GAME[+d.id];
        if (gid && UI.game) UI.selectGameCountry(gid);
      })
      .on('mousemove', (event, d) => {
        this._showTooltip(event, +d.id);
      })
      .on('mouseout', () => this._hideTooltip());

    // Country borders
    this.g.append('path')
      .datum(topojson.mesh(this._world, this._world.objects.countries, (a, b) => a !== b))
      .attr('class', 'country-border')
      .attr('d', this.geoPath);

    // Country labels for game countries
    this.g.selectAll('text.country-label')
      .data(features.filter(d => this.ISO_TO_GAME[+d.id]))
      .enter()
      .append('text')
      .attr('class', 'country-label')
      .attr('transform', d => {
        const c = this.geoPath.centroid(d);
        return isNaN(c[0]) ? 'translate(-9999,-9999)' : `translate(${c})`;
      })
      .attr('data-gid', d => this.ISO_TO_GAME[+d.id])
      .text(d => {
        const gid = this.ISO_TO_GAME[+d.id];
        return UI.game?.countries[gid]?.flag ?? '';
      });

    // Zoom behavior
    this.zoom = d3.zoom()
      .scaleExtent([0.6, 12])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
        // Hide labels when zoomed out, show when zoomed in
        const k = event.transform.k;
        this.g.selectAll('text.country-label')
          .style('display', k > 2.5 ? 'block' : 'none')
          .attr('font-size', `${Math.max(6, 11 / k)}px`);
      });

    this.svg.call(this.zoom);
    this.g.selectAll('text.country-label').style('display', 'none');

    this.colorAll();
  },

  colorAll() {
    if (!this.svg || !UI.game) return;
    const g = UI.game;
    const pc = g.countries[g.playerCountryId];
    const sel = g.selectedCountryId;
    const humanCountries = g.playerCountries || {};

    // ── RADAR MODE: all green phosphorescent, no ally/enemy distinction ──
    const radarActive = typeof UI !== 'undefined' && UI._mpRadarActive;
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) mapContainer.classList.toggle('radar-mode', !!radarActive);

    // Change ocean/graticule fill to match radar mode
    this.svg.selectAll('path.map-ocean').attr('fill', radarActive ? '#001400' : '#06101e');
    this.svg.selectAll('path.graticule').attr('stroke', radarActive ? 'rgba(255,255,255,0.06)' : '#0d1c2e');

    // Inject/remove radar overlay elements (sweep + rings + center dot)
    if (mapContainer) this._syncRadarOverlay(radarActive, mapContainer);

    if (radarActive) {
      this.svg.selectAll('path.country-path')
        .attr('fill', (d) => {
          const id = this.ISO_TO_GAME[+d.id];
          if (!id) return '#001400';
          if (id === g.playerCountryId) return '#003300';
          return '#001800';
        })
        .attr('stroke', (d) => {
          const id = this.ISO_TO_GAME[+d.id];
          if (!id) return '#004d00';
          if (id === sel || id === g.playerCountryId) return '#39ff14';
          return '#00cc44';
        })
        .attr('stroke-width', (d) => {
          const id = this.ISO_TO_GAME[+d.id];
          if (!id) return 0.3;
          if (id === sel || id === g.playerCountryId) return 2.5;
          return 1.0;
        })
        .classed('pulsing-war', false)
        .classed('country-game', d => !!this.ISO_TO_GAME[+d.id]);
    } else {

    // ── COLOR SCHEME ─────────────────────────────────────────
    // Player:    gold (#1e1600 fill / #c9a227 border)
    // Ally:      light blue (#0a1e30 fill / #29b6f6 border)
    // At war:    red  (#2a0000 fill / #cc2200 border)
    // Enemy ally (won't join): purple (#150a24 fill / #8844cc border)
    // Enemy ally (also at war with us): red (same as at war)
    // Our allies (while at war): vibrant dark blue (#001a33 fill / #1565c0 border)
    // Hostile:   orange (#1f0e00 fill / #e65100 border)
    // Neutral:   dark navy (#0d1824 fill / #162030 border)
    // Selected:  yellow border (#c9a227)
    const atWar = pc.atWar || [];
    const allies = pc.allies || [];
    const weAreAtWar = atWar.length > 0;

    this.svg.selectAll('path.country-path')
      .attr('fill', (d) => {
        const id = this.ISO_TO_GAME[+d.id];
        if (!id) return '#0d1824';
        const country = g.countries[id];
        if (id === g.playerCountryId)   return '#1e1600';
        if (country?.merged && country.mergedInto === g.playerCountryId) return '#1e1600';
        if (country?.conquered && country.conqueror === g.playerCountryId) {
          const res = country.resistanceLevel || 0;
          if (res > 70) return '#2a0800';
          if (res > 40) return '#200a00';
          return '#1e1600';
        }
        if (atWar.includes(id))         return '#2a0000';
        if (allies.includes(id))        return weAreAtWar ? '#001a33' : '#0a1e30';
        const isEnemyAlly = atWar.some(eid => g.countries[eid]?.allies?.includes(id));
        if (isEnemyAlly)                return '#150a24';
        const rel = g.getRelation(g.playerCountryId, id);
        if (rel < -30)                  return '#1f0e00';
        return '#0d1824';
      })
      .attr('stroke', (d) => {
        const id = this.ISO_TO_GAME[+d.id];
        if (!id) return '#162030';
        const country = g.countries[id];
        if (id === sel)                 return '#c9a227';
        if (id === g.playerCountryId)   return '#c9a227';
        if (country?.merged && country.mergedInto === g.playerCountryId)  return '#c9a227';
        if (country?.conquered && country.conqueror === g.playerCountryId) return '#c9a227';
        if (atWar.includes(id))         return '#cc2200';
        if (allies.includes(id))        return weAreAtWar ? '#1565c0' : '#29b6f6';
        const isEnemyAlly = atWar.some(eid => g.countries[eid]?.allies?.includes(id));
        if (isEnemyAlly)                return '#8844cc';
        const rel = g.getRelation(g.playerCountryId, id);
        if (rel < -30)                  return '#e65100';
        return '#162030';
      })
      .attr('stroke-width', (d) => {
        const id = this.ISO_TO_GAME[+d.id];
        if (!id) return 0.3;
        const country = g.countries[id];
        if (id === sel)                 return 2.2;
        if (id === g.playerCountryId)   return 2;
        if (country?.conquered)         return 1.5;
        if (atWar.includes(id))         return 1.6;
        if (allies.includes(id))        return 1.4;
        const isEnemyAllyW = atWar.some(eid => g.countries[eid]?.allies?.includes(id));
        if (isEnemyAllyW)               return 1.2;
        const rel = g.getRelation(g.playerCountryId, id);
        if (rel < -30)                  return 1.1;
        return 0.5;
      })
      .classed('pulsing-war', (d) => {
        const id = this.ISO_TO_GAME[+d.id];
        if (!id || !atWar.includes(id)) return false;
        const war = g.wars.find(w =>
          (w.attacker === g.playerCountryId && w.defender === id) ||
          (w.attacker === id && w.defender === g.playerCountryId)
        );
        return !war || (war.progress || 0) < 50;
      })
      .classed('country-game', d => !!this.ISO_TO_GAME[+d.id]);

    } // end normal mode

    // Refresh labels: human player countries show their NAME in white (always visible)
    this.svg.selectAll('text.country-label')
      .text(d => {
        const gid = this.ISO_TO_GAME[+d.id];
        if (!gid || !g.countries[gid]) return '';
        if (humanCountries[gid] && gid !== g.playerCountryId) return g.countries[gid].name;
        return g.countries[gid].flag ?? '';
      })
      .attr('fill', d => {
        const gid = this.ISO_TO_GAME[+d.id];
        return (humanCountries[gid] && gid !== g.playerCountryId) ? '#ffffff' : 'rgba(201,162,39,0.65)';
      })
      .classed('human-country-label', d => {
        const gid = this.ISO_TO_GAME[+d.id];
        return !!(humanCountries[gid] && gid !== g.playerCountryId);
      });
  },

  zoomToCountry(gameId, duration = 700) {
    if (!this.svg || !this.geoPath || !this._world) return;
    const isoEntry = Object.entries(this.ISO_TO_GAME).find(([, gid]) => gid === gameId);
    if (!isoEntry) return;
    const isoNum = +isoEntry[0];
    const features = topojson.feature(this._world, this._world.objects.countries).features;
    const feat = features.find(f => +f.id === isoNum);
    if (!feat) return;
    const { W, H } = this._dims();
    const [[x0, y0], [x1, y1]] = this.geoPath.bounds(feat);
    const dx = x1 - x0, dy = y1 - y0;
    if (dx === 0 || dy === 0) return;
    const scale = Math.min(6, 0.75 / Math.max(dx / W, dy / H));
    const tx = W / 2 - scale * (x0 + x1) / 2;
    const ty = H / 2 - scale * (y0 + y1) / 2;
    this.svg.transition().duration(duration).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  },

  zoomIn()    { this.svg?.transition().duration(250).call(this.zoom.scaleBy, 1.6); },
  zoomOut()   { this.svg?.transition().duration(250).call(this.zoom.scaleBy, 0.625); },
  resetZoom() {
    this.svg?.transition().duration(450).call(this.zoom.transform, d3.zoomIdentity);
  },

  resize() {
    if (!this.initialized) return;
    const { W, H } = this._dims();
    this.svg.attr('width', W).attr('height', H);
    this.svg.select('rect.map-ocean').attr('width', W).attr('height', H);
    this.projection.scale(W / 6.4).translate([W / 2, H / 2]);
    this.geoPath.projection(this.projection);
    this.svg.selectAll('path').attr('d', this.geoPath);
    this.svg.selectAll('text.country-label').attr('transform', d => {
      const c = this.geoPath.centroid(d);
      return isNaN(c[0]) ? 'translate(-9999,-9999)' : `translate(${c})`;
    });
  },

  _showTooltip(event, isoNum) {
    const gameId = this.ISO_TO_GAME[isoNum];
    let html = '';
    if (gameId && UI.game) {
      const c = UI.game.countries[gameId];
      const pc = UI.game.countries[UI.game.playerCountryId];
      const rel = UI.game.getRelation(UI.game.playerCountryId, gameId);
      const status = gameId === UI.game.playerCountryId ? '⭐ Tu país'
        : pc.atWar.includes(gameId) ? '⚔️ En guerra'
        : pc.allies.includes(gameId) ? '🤝 Aliado'
        : rel < -30 ? '⚡ Hostil' : '';
      html = `<span class="tt-flag">${c.flag}</span> <strong>${c.name}</strong>${status ? ` <span class="tt-status">${status}</span>` : ''}
              <br><span class="tt-stats">MIL:${c.military} ECO:${c.economy} EST:${c.stability}</span>`;
    } else {
      const name = ISO_NAMES[isoNum];
      if (!name) return;
      html = `<strong>${name}</strong>`;
    }
    const t = document.getElementById('map-tooltip');
    if (!t) return;
    t.innerHTML = html;
    t.style.display = 'block';
    t.style.left = (event.clientX + 16) + 'px';
    t.style.top  = (event.clientY - 36) + 'px';
  },

  _hideTooltip() {
    const t = document.getElementById('map-tooltip');
    if (t) t.style.display = 'none';
  },

  // ── RADAR OVERLAY (sweep + rings + center dot) ────────────
  _syncRadarOverlay(active, container) {
    if (active) {
      if (!document.getElementById('radar-sweep')) {
        const sweep = document.createElement('div');
        sweep.id = 'radar-sweep';
        container.appendChild(sweep);
      }
      if (!document.getElementById('radar-center')) {
        const dot = document.createElement('div');
        dot.id = 'radar-center';
        container.appendChild(dot);
      }
      if (!document.getElementById('radar-rings')) {
        const rings = document.createElement('div');
        rings.id = 'radar-rings';
        const sizes = [80, 160, 240, 340];
        sizes.forEach(s => {
          const r = document.createElement('div');
          r.className = 'radar-ring';
          r.style.cssText = `width:${s}px; height:${s}px; left:50%; top:50%;`;
          rings.appendChild(r);
        });
        container.appendChild(rings);
      }
    } else {
      ['radar-sweep', 'radar-center', 'radar-rings'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    }
  },

  // ── RADAR ATTACK BLIPS ────────────────────────────────────
  // Shows incoming attacks as moving blips on the map (radar mode)
  _activeBlips: {},   // attackId → { el, trailEl, interval }

  showAttackBlip(attack) {
    const container = document.getElementById('map-container');
    if (!container || !this.projection) return;
    const id = attack.id || (attack.type + '_' + Date.now());
    if (this._activeBlips[id]) return;   // already shown

    // Get target country centroid in pixel coords
    const fromCountry = UI.game?.countries?.[attack.fromId];
    const toCountry   = UI.game?.countries?.[attack.toId];
    if (!toCountry) return;

    // Approximate country centroids using capital lat/lon from countries.js or fallback
    const centroids = this._getCountryCentroid(attack.toId);
    const fromCentr = this._getCountryCentroid(attack.fromId);
    if (!centroids) return;

    // Convert geo coords to screen coords (accounting for current map transform)
    const toXY   = this._geoToScreen(centroids[0], centroids[1]);
    const fromXY = fromCentr ? this._geoToScreen(fromCentr[0], fromCentr[1]) : null;

    if (!toXY) return;

    // Create blip element
    const blip = document.createElement('div');
    blip.className = 'map-attack-blip interceptable';
    blip.dataset.attackId = id;
    const icons = { aerial:'✈', naval:'⚓', missiles:'🚀', nuclear:'☢' };
    blip.innerHTML = `<div class="blip-icon">${icons[attack.type] || '⚠'}</div>
                      <div class="blip-label">${(attack.type || 'ATAQUE').toUpperCase()}</div>`;

    // Animate from edge → target
    const startX = fromXY ? fromXY.x : (toXY.x + (Math.random() - 0.5) * 200);
    const startY = fromXY ? fromXY.y : (toXY.y + (Math.random() - 0.5) * 200);
    blip.style.cssText = `left:${startX - 12}px; top:${startY - 12}px; transition: left 3s linear, top 3s linear;`;
    container.appendChild(blip);

    // Add intercept button next to blip
    const interceptBtn = document.createElement('button');
    interceptBtn.className = 'intercept-now-btn';
    interceptBtn.textContent = '[ INTERCEPTAR ]';
    interceptBtn.style.cssText = `left:${startX + 14}px; top:${startY - 10}px; position:absolute; transition: left 3s linear, top 3s linear;`;
    container.appendChild(interceptBtn);

    // Move to target after brief delay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        blip.style.left = (toXY.x - 12) + 'px';
        blip.style.top  = (toXY.y - 12) + 'px';
        interceptBtn.style.left = (toXY.x + 14) + 'px';
        interceptBtn.style.top  = (toXY.y - 10) + 'px';
      });
    });

    // Intercept on click (both the blip icon and the button)
    const doIntercept = () => {
      this.removeAttackBlip(id);
      if (attack.onIntercept) attack.onIntercept();
      else if (typeof MP !== 'undefined' && MP.enabled) {
        MP.sendAction({ cat: 'mp_war', id: 'intercept', targetId: attack.fromId, params: { attackId: id } });
      }
    };
    interceptBtn.addEventListener('click', doIntercept);
    blip.addEventListener('click', doIntercept);

    // Auto-remove when attack lands (after 3s travel)
    const timeout = setTimeout(() => {
      this.removeAttackBlip(id);
      if (attack.onImpact) attack.onImpact();
    }, 3200);

    this._activeBlips[id] = { blip, interceptBtn, timeout };
  },

  removeAttackBlip(id) {
    const entry = this._activeBlips[id];
    if (!entry) return;
    clearTimeout(entry.timeout);
    entry.blip?.remove();
    entry.interceptBtn?.remove();
    delete this._activeBlips[id];
  },

  clearAllBlips() {
    Object.keys(this._activeBlips).forEach(id => this.removeAttackBlip(id));
  },

  _geoToScreen(lon, lat) {
    if (!this.projection) return null;
    try {
      const svgEl = document.getElementById('map-svg');
      const svgRect = svgEl?.getBoundingClientRect();
      const container = document.getElementById('map-container');
      const contRect  = container?.getBoundingClientRect();
      if (!svgRect || !contRect) return null;

      const [px, py] = this.projection([lon, lat]);
      // Current D3 zoom transform
      const t = d3.zoomTransform(svgEl);
      const sx = t.x + px * t.k;
      const sy = t.y + py * t.k;
      // Offset from container
      const offX = svgRect.left - contRect.left;
      const offY = svgRect.top  - contRect.top;
      return { x: sx + offX, y: sy + offY };
    } catch(e) { return null; }
  },

  // Approximate centroids for key countries (lon, lat)
  _CENTROIDS: {
    usa:[-100,38], china:[104,35], russia:[90,60], germany:[10,51], france:[2,46],
    uk:[-2,54], japan:[138,36], india:[78,22], brazil:[-52,-10], australia:[134,-25],
    canada:[-95,60], mexico:[-102,24], argentina:[-64,-34], saudi_arabia:[45,24],
    iran:[53,32], turkey:[35,39], south_korea:[128,37], indonesia:[118,-5],
    nigeria:[8,10], south_africa:[25,-29], egypt:[30,27], israel:[35,31],
    ukraine:[31,49], poland:[20,52], spain:[-4,40], italy:[12,42],
    north_korea:[127,40], pakistan:[69,30], vietnam:[108,14], thailand:[101,15],
    colombia:[-74,4], venezuela:[-66,8], chile:[-71,-30], peru:[-76,-10],
    ethiopia:[38,8], kenya:[37,1],
  },

  _getCountryCentroid(countryId) {
    return this._CENTROIDS[countryId] || null;
  },
};

// Country name lookup for non-game countries
const ISO_NAMES = {
  4:'Afganistán',8:'Albania',12:'Argelia',24:'Angola',36:'Australia',40:'Austria',
  50:'Bangladesh',56:'Bélgica',64:'Bután',68:'Bolivia',72:'Botsuana',
  100:'Bulgaria',116:'Camboya',120:'Camerún',144:'Sri Lanka',152:'Chile',
  /* 170: Colombia — now a game country */178:'Congo',192:'Cuba',196:'Chipre',203:'Rep. Checa',
  204:'Benín',208:'Dinamarca',218:'Ecuador',818:'Egipto',222:'El Salvador',
  231:'Etiopía',238:'Malvinas',246:'Finlandia',266:'Gabón',288:'Ghana',
  300:'Grecia',320:'Guatemala',332:'Haití',340:'Honduras',348:'Hungría',
  360:'Indonesia',368:'Irak',372:'Irlanda',380:'Italia',388:'Jamaica',
  400:'Jordania',398:'Kazajistán',404:'Kenia',418:'Laos',422:'Líbano',
  434:'Libia',442:'Luxemburgo',450:'Madagascar',454:'Malaui',458:'Malasia',
  504:'Marruecos',508:'Mozambique',524:'Nepal',528:'Países Bajos',
  566:'Nigeria',578:'Noruega',600:'Paraguay',604:'Perú',608:'Filipinas',
  616:'Polonia',620:'Portugal',634:'Catar',642:'Rumanía',646:'Ruanda',
  686:'Senegal',694:'Sierra Leona',706:'Somalia',724:'España',
  729:'Sudán',752:'Suecia',756:'Suiza',760:'Siria',764:'Tailandia',
  792:'Turquía',800:'Uganda',784:'Emiratos Árabes Unidos',858:'Uruguay',
  860:'Uzbekistán',862:'Venezuela',704:'Vietnam',887:'Yemen',894:'Zambia',
  716:'Zimbabue',104:'Birmania',116:'Camboya',450:'Madagascar',
  862:'Venezuela',70:'Bosnia',191:'Croacia',703:'Eslovaquia',
  705:'Eslovenia',428:'Letonia',440:'Lituania',233:'Estonia',
  112:'Bielorrusia',498:'Moldavia',688:'Serbia',807:'Macedonia del Norte',
  8:'Albania',792:'Turquía',300:'Grecia',51:'Armenia',31:'Azerbaiyán',268:'Georgia',
};
