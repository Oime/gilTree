// Librairie d'arbre généalogique interactif (zoom, drag, centrage)

class SimpleFamilyTree {
  constructor(container, data, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.data = data;
    this.options = Object.assign({
      cardWidth: 180,
      cardHeight: 70,
      cardGapX: 40,
      cardGapY: 80,
      background: '#f8f9fa',
      linkColor: '#bbb',
      zoomMin: 0.3,
      zoomMax: 2,
      initialZoom: 1,
      rootId: null, // id de départ (le plus jeune)
    }, options);
    this.zoom = this.options.initialZoom;
    this.offset = { x: 0, y: 0 };
    this.dragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.offsetStart = { x: 0, y: 0 };
    this.nodes = {};
    this.levels = {};
    this.focusId = this.options.rootId || (this.data.length ? this.data[0].id : null);
    this._init();
  }

  _init() {
    this.container.classList.add('sft-container');
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.background = this.options.background;
    // Créer le viewport qui contiendra SVG + cartes
    this.viewport = document.createElement('div');
    this.viewport.className = 'sft-viewport';
    this.viewport.style.position = 'absolute';
    this.viewport.style.top = 0;
    this.viewport.style.left = 0;
    this.viewport.style.width = '100%';
    this.viewport.style.height = '100%';
    this.viewport.style.transformOrigin = '0 0';
    this.container.appendChild(this.viewport);
    this._createSVG();
    this._createTree();
    this._addControls();
    this._addInteractions();
    this.center();
  }

  _createSVG() {
    // Ajouter le SVG dans le viewport (et non plus dans le container)
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('sft-svg');
    this.svg.style.position = 'absolute';
    this.svg.style.top = 0;
    this.svg.style.left = 0;
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.viewport.appendChild(this.svg);
  }

  _createTree() {
    this.svg.innerHTML = '';
    this.viewport.querySelectorAll('.sft-card').forEach(e => e.remove());
    this._computeLevels();
    // N'afficher que les nœuds de la branche courante
    const branchNodes = this._branchNodes || new Set();
    Object.values(this.nodes).forEach(node => {
      if (branchNodes.has(node.id)) this._createCard(node);
    });
    // Dessiner tous les liens parent-enfant entre nœuds affichés
    Object.values(this.nodes).forEach(node => {
      if (!branchNodes.has(node.id)) return;
      if (node.parents && node.parents.length) {
        node.parents.forEach(parent => {
          if (parent && branchNodes.has(parent.id)
            && parent.x !== undefined && parent.y !== undefined
            && node.x !== undefined && node.y !== undefined) {
            this._drawLink(parent, node);
          }
        });
      }
      if (node.children && node.children.length) {
        node.children.forEach(child => {
          if (child && branchNodes.has(child.id)
            && child.x !== undefined && child.y !== undefined
            && node.x !== undefined && node.y !== undefined) {
            this._drawLink(node, child);
          }
        });
      }
    });
    this._updateSVGSize();
    this._updateTransform();
  }

  _computeLevels() {
    this.nodes = {};
    this.levels = {};
    this.data.forEach(member => {
      this.nodes[member.id] = Object.assign({}, member, { children: [] });
    });
    this.data.forEach(member => {
      const parentIds = Array.isArray(member.parentIds) ? member.parentIds : (member.parentId ? [member.parentId] : []);
      this.nodes[member.id].parents = parentIds.map(pid => this.nodes[pid]).filter(Boolean);
      parentIds.forEach(pid => {
        if (this.nodes[pid]) {
          this.nodes[pid].children.push(this.nodes[member.id]);
        }
      });
    });
    const focus = this.nodes[this.focusId];
    if (!focus) return;
    let levels = {};
    let xIndex = 0;
    // Marquer ascendants élargis (tous les parents et leur fratrie)
    const ascendants = new Set();
    function markAscendants(node) {
      if (!node || ascendants.has(node.id)) return;
      ascendants.add(node.id);
      // Ajouter tous les parents
      if (node.parents && node.parents.length > 0) {
        node.parents.forEach(parent => {
          if (parent) {
            markAscendants(parent);
            // Ajouter toute la fratrie (tous les enfants de ce parent)
            if (parent.children && parent.children.length > 0) {
              parent.children.forEach(sibling => {
                if (sibling) ascendants.add(sibling.id);
              });
            }
          }
        });
      }
    }
    // Marquer descendants élargis (tous les enfants et leur fratrie)
    const descendants = new Set();
    function markDescendants(node) {
      if (!node || descendants.has(node.id)) return;
      descendants.add(node.id);
      // Ajouter tous les enfants
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          if (child) {
            markDescendants(child);
            // Ajouter toute la fratrie (tous les enfants des mêmes parents)
            if (child.parents && child.parents.length > 0) {
              child.parents.forEach(parent => {
                if (parent && parent.children && parent.children.length > 0) {
                  parent.children.forEach(sibling => {
                    if (sibling) descendants.add(sibling.id);
                  });
                }
              });
            }
          }
        });
      }
    }
    markAscendants(focus);
    markDescendants(focus);
    // Ensemble des nœuds à afficher
    const branchNodes = new Set([...ascendants, ...descendants]);
    // Placement récursif centré (Reingold-Tilford simplifié) sur la branche
    function place(node, level, placed = new Set()) {
      if (!node || placed.has(node.id) || !branchNodes.has(node.id)) return;
      placed.add(node.id);
      node.y = level;
      if (!levels[level]) levels[level] = [];
      // Parents (ascendants, niveaux négatifs)
      if (node.parents && node.parents.length > 0) {
        node.parents.forEach(parent => place(parent, level - 1, placed));
      }
      // Enfants (descendants, niveaux positifs)
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => place(child, level + 1, placed));
      }
      levels[level].push(node);
    }
    place(focus, 0);
    // Placement horizontal centré par sous-arbre
    let minLevel = Math.min(...Object.keys(levels).map(Number));
    let maxLevel = Math.max(...Object.keys(levels).map(Number));
    let x = 0;
    function assignX(node, visitedAssignX = new Set()) {
      if (!node || visitedAssignX.has(node.id) || !branchNodes.has(node.id)) return;
      visitedAssignX.add(node.id);
      // Parents d'abord
      if (node.parents && node.parents.length > 0) {
        node.parents.forEach(parent => assignX(parent, visitedAssignX));
      }
      // Enfants ensuite
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => assignX(child, visitedAssignX));
      }
      // Si feuille (pas d'enfants ni de parents dans la direction explorée)
      if ((!(node.children && node.children.length) && node.y >= 0) || (!(node.parents && node.parents.length) && node.y < 0)) {
        node.x = x++;
      } else {
        // Centrer sur les sous-arbres
        let xs = [];
        if (node.children && node.children.length > 0 && node.y >= 0) {
          xs = node.children.filter(c => branchNodes.has(c.id)).map(c => c.x).filter(v => v !== undefined);
        } else if (node.parents && node.parents.length > 0 && node.y < 0) {
          xs = node.parents.filter(p => branchNodes.has(p.id)).map(p => p.x).filter(v => v !== undefined);
        }
        if (xs.length) {
          node.x = (Math.min(...xs) + Math.max(...xs)) / 2;
        } else {
          node.x = x++;
        }
      }
      node._placedX = true;
    }
    assignX(focus);
    Object.values(this.nodes).forEach(n => { delete n._placedX; });
    // Regrouper les nodes par niveau pour l'affichage, mais uniquement ceux de branchNodes
    this.levels = {};
    Object.values(this.nodes).forEach(node => {
      if (node.y !== undefined && branchNodes.has(node.id)) {
        if (!this.levels[node.y]) this.levels[node.y] = [];
        this.levels[node.y].push(node);
      }
    });
    // Calcul dimensions
    let maxX = Math.max(...Array.from(branchNodes).map(id => this.nodes[id].x || 0));
    let minX = Math.min(...Array.from(branchNodes).map(id => this.nodes[id].x || 0));
    this.treeWidth = (maxX - minX + 1) * (this.options.cardWidth + this.options.cardGapX);
    this.treeHeight = (maxLevel - minLevel + 1) * (this.options.cardHeight + this.options.cardGapY);
    // Décaler tout l'arbre pour que le niveau 0 soit bien visible
    Array.from(branchNodes).forEach(id => {
      const node = this.nodes[id];
      node.x = node.x - minX;
      node.y = node.y - minLevel;
    });
    // Mémoriser les nœuds à afficher pour le rendu
    this._branchNodes = branchNodes;
  }

  _createCard(node) {
    const card = document.createElement('div');
    card.className = 'sft-card';
    if (node.id === this.focusId) card.classList.add('sft-focus');
    card.style.width = this.options.cardWidth + 'px';
    card.style.height = this.options.cardHeight + 'px';
    card.style.position = 'absolute';
    card.style.left = (node.x * (this.options.cardWidth + this.options.cardGapX)) + 'px';
    card.style.top = (node.y * (this.options.cardHeight + this.options.cardGapY)) + 'px';
    // Ajout du fond selon le genre
    if (node.genre === 'H') {
      card.style.background = 'linear-gradient(135deg, #b3e0ff 0%, #b2f7cc 100%)';
    } else if (node.genre === 'F') {
      card.style.background = 'linear-gradient(135deg, #ffd1e3 0%, #ffe0b2 100%)';
    }
    card.innerHTML = `
      <div class="sft-img" style="background-image:url('${node.img || ''}')"></div>
      <div class="sft-name">${node.name}</div>
    `;
    card.onclick = (e) => {
      e.stopPropagation();
      this.setFocus(node.id);
    };
    this.viewport.appendChild(card);
    node._card = card;
  } 

  _drawLink(parent, child) {
    const x1 = parent.x * (this.options.cardWidth + this.options.cardGapX) + this.options.cardWidth / 2;
    const y1 = parent.y * (this.options.cardHeight + this.options.cardGapY) + this.options.cardHeight;
    const x2 = child.x * (this.options.cardWidth + this.options.cardGapX) + this.options.cardWidth / 2;
    const y2 = child.y * (this.options.cardHeight + this.options.cardGapY);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${x1},${y1} C${x1},${y1 + 30} ${x2},${y2 - 30} ${x2},${y2}`);
    path.setAttribute('stroke', this.options.linkColor);
    path.setAttribute('stroke-width', 2);
    path.setAttribute('fill', 'none');
    this.svg.appendChild(path);
  }

  _addControls() {
    // Ajoute les boutons +, -, centrer
    const controls = document.createElement('div');
    controls.className = 'sft-controls';
    controls.style.position = 'absolute';
    controls.style.top = '10px';
    controls.style.right = '10px';
    controls.style.zIndex = 10;
    controls.innerHTML = `
      <button type="button" class="sft-zoom-in">+</button>
      <button type="button" class="sft-zoom-out">-</button>
      <button type="button" class="sft-center">⦿</button>
    `;
    this.container.appendChild(controls);
    controls.querySelector('.sft-zoom-in').onclick = () => this._zoomTo(this.zoom * 1.2);
    controls.querySelector('.sft-zoom-out').onclick = () => this._zoomTo(this.zoom / 1.2);
    controls.querySelector('.sft-center').onclick = () => this.center();
  }

  _zoomTo(newZoom) {
    const min = this.options.zoomMin || 0.2;
    const max = this.options.zoomMax || 2;
    const oldZoom = this.zoom;
    this.zoom = Math.max(min, Math.min(max, newZoom));
    // Zoom centré sur le centre du conteneur
    const rect = this.container.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    this.offset.x = mx - ((mx - this.offset.x) * (this.zoom / oldZoom));
    this.offset.y = my - ((my - this.offset.y) * (this.zoom / oldZoom));
    this._updateTransform();
  }

  _addInteractions() {
    // Drag
    this.container.addEventListener('mousedown', e => {
      if (e.target.classList.contains('sft-card') || e.target.closest('.sft-controls')) return;
      this.dragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.offsetStart = { ...this.offset };
      this.container.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!this.dragging) return;
      this.offset.x = this.offsetStart.x + (e.clientX - this.dragStart.x);
      this.offset.y = this.offsetStart.y + (e.clientY - this.dragStart.y);
      this._updateTransform();
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
      this.container.style.cursor = '';
    });
    // Zoom molette (centré sur le centre du conteneur)
    this.container.addEventListener('wheel', e => {
      e.preventDefault();
      const oldZoom = this.zoom;
      let newZoom = this.zoom;
      if (e.deltaY < 0) {
        newZoom = this.zoom * 1.1;
      } else {
        newZoom = this.zoom / 1.1;
      }
      this._zoomTo(newZoom);
    });
    // Centrage double-clic
    this.container.addEventListener('dblclick', () => {
      this.center();
    });
  }

  _updateTransform() {
    const t = `translate(${this.offset.x}px,${this.offset.y}px) scale(${this.zoom})`;
    this.viewport.style.transform = t;
  }

  center() {
    // Centrer l'arbre dans le conteneur
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    this.zoom = 1;
    this.offset.x = (cw - this.treeWidth) / 2;
    this.offset.y = (ch - this.treeHeight) / 2;
    this._updateTransform();
  }

  // Pour recharger les données dynamiquement
  updateData(newData) {
    this.data = newData;
    this._createTree();
    this.center();
  }

  setFocus(id) {
    this.focusId = id;
    this._createTree();
    // Centrer sur la personne sélectionnée
    const focus = this.nodes[this.focusId];
    if (focus && focus.x !== undefined && focus.y !== undefined) {
      const cx = this.container.clientWidth / 2;
      const cy = this.container.clientHeight / 2;
      const cardX = focus.x * (this.options.cardWidth + this.options.cardGapX) + this.options.cardWidth / 2;
      const cardY = focus.y * (this.options.cardHeight + this.options.cardGapY) + this.options.cardHeight / 2;
      this.offset.x = cx - cardX * this.zoom;
      this.offset.y = cy - cardY * this.zoom;
      this._updateTransform();
    } else {
      this.center();
    }
  }

  _updateSVGSize() {
    // Calcule la bounding box de toutes les cartes affichées
    const branchNodes = this._branchNodes || new Set();
    const nodes = Object.values(this.nodes).filter(node => branchNodes.has(node.id));
    if (nodes.length === 0) return;
    const cardW = this.options.cardWidth;
    const cardH = this.options.cardHeight;
    const gapX = this.options.cardGapX;
    const gapY = this.options.cardGapY;
    let minX = Math.min(...nodes.map(n => n.x * (cardW + gapX)));
    let minY = Math.min(...nodes.map(n => n.y * (cardH + gapY)));
    let maxX = Math.max(...nodes.map(n => n.x * (cardW + gapX) + cardW));
    let maxY = Math.max(...nodes.map(n => n.y * (cardH + gapY) + cardH));
    // Ajoute une marge
    const margin = 40;
    minX -= margin;
    minY -= margin;
    maxX += margin;
    maxY += margin;
    const width = maxX - minX;
    const height = maxY - minY;
    this.svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', height);
    this.svg.style.width = width + 'px';
    this.svg.style.height = height + 'px';
    this.svg.style.left = minX + 'px';
    this.svg.style.top = minY + 'px';
  }
}
