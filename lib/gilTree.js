// Librairie d'arbre généalogique interactif (zoom, drag, centrage)

class SimpleFamilyTree {
  constructor(container, data, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.data = data;
    this.options = Object.assign({
      cardWidth: 230,
      cardHeight: 70,
      cardGapX: 40,
      cardGapY: 80,
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
    
    // Gérer l'ID depuis l'URL ou utiliser la valeur par défaut
    this.focusId = this._getIdFromUrl() || this.options.rootId || (this.data.length ? this.data[0].id : null);
    
    this._init();
    this._setupUrlHandling();
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
      
      // Dessiner les liens entre conjoints/partenaires
      this._drawPartnerLinks(branchNodes);
      
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
    
    // Ajouter les conjoints de la personne focalisée
    const focusPartners = new Set();
    if (focus.pids && Array.isArray(focus.pids)) {
      focus.pids.forEach(partnerId => {
        const partner = this.nodes[partnerId];
        if (partner) {
          focusPartners.add(partnerId);
        }
      });
    }
    
    // Ensemble des nœuds à afficher
    const branchNodes = new Set([...ascendants, ...descendants, ...focusPartners]);
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
    
    // Placer les conjoints de la personne focalisée au même niveau
    focusPartners.forEach(partnerId => {
      const partner = this.nodes[partnerId];
      if (partner && !levels[0]) levels[0] = [];
      if (partner && !levels[0].includes(partner)) {
        partner.y = 0; // Même niveau que la personne focalisée
        levels[0].push(partner);
      }
    });
    
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
    
    // Positionner les conjoints et recalculer toutes les positions
    if (focusPartners.size > 0) {
      // D'abord, donner des positions temporaires aux conjoints
      const partners = Array.from(focusPartners).map(id => this.nodes[id]).filter(Boolean);
      partners.forEach((partner, index) => {
        // Position temporaire à côté de la personne focalisée
        partner.x = focus.x + (index + 1) * 1.5;
      });
      
      // Recalculer toutes les positions X en tenant compte des nouveaux nœuds
      this._redistributeXPositions(branchNodes);
    }
    
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

  _redistributeXPositions(branchNodes) {
    const minSpacing = 1.0;
    
    // Regrouper les nœuds par niveau
    const nodesByLevel = {};
    Array.from(branchNodes).forEach(nodeId => {
      const node = this.nodes[nodeId];
      if (node.y !== undefined) {
        if (!nodesByLevel[node.y]) nodesByLevel[node.y] = [];
        nodesByLevel[node.y].push(node);
      }
    });

    // Traiter chaque niveau
    Object.keys(nodesByLevel).forEach(level => {
      const nodesAtLevel = nodesByLevel[level];
      if (nodesAtLevel.length <= 1) return;

      // Trier les nœuds par position X actuelle
      nodesAtLevel.sort((a, b) => a.x - b.x);

      // Détecter et résoudre seulement les collisions
      let hasCollisions = true;
      let iterations = 0;
      const maxIterations = 10;

      while (hasCollisions && iterations < maxIterations) {
        hasCollisions = false;
        iterations++;

        for (let i = 0; i < nodesAtLevel.length - 1; i++) {
          const currentNode = nodesAtLevel[i];
          const nextNode = nodesAtLevel[i + 1];
          const distance = nextNode.x - currentNode.x;

          // Si collision détectée
          if (distance < minSpacing) {
            hasCollisions = true;
            const adjustment = (minSpacing - distance) / 2;
            
            // Pousser les nœuds dans des directions opposées
            currentNode.x -= adjustment;
            nextNode.x += adjustment;
          }
        }

        // Re-trier après les ajustements
        nodesAtLevel.sort((a, b) => a.x - b.x);
      }

      // Si on a encore des collisions après les itérations, forcer un espacement minimal
      if (hasCollisions) {
        for (let i = 1; i < nodesAtLevel.length; i++) {
          const prevNode = nodesAtLevel[i - 1];
          const currentNode = nodesAtLevel[i];
          if (currentNode.x - prevNode.x < minSpacing) {
            currentNode.x = prevNode.x + minSpacing;
          }
        }
      }
    });
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
    const formatDates = (born, died) => {
      if (!born && !died) return '';
      if (born && died) return `${born} - ${died}`;
      if (born) return `${born}`;
      if (died) return `${died}`;
      return '';
    };
    
    card.innerHTML = `
      ${node.img ? `<div class="sft-img" style="background-image:url('${node.img}')"></div>` : ''}
      <div class="sft-info">
        <div class="sft-name">${node.nom}</div>
        <div class="sft-dates">${formatDates(node.né, node.décédé)}</div>
      </div>
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

  _drawPartnerLinks(branchNodes) {
    // Parcourir tous les nœuds affichés pour trouver les liens de partenariat
    const drawnLinks = new Set(); // Pour éviter les doublons
    
    Array.from(branchNodes).forEach(nodeId => {
      const node = this.nodes[nodeId];
      
      // Vérifier si cette personne a des partenaires (pids)
      if (node.pids && Array.isArray(node.pids)) {
        node.pids.forEach(partnerId => {
          const partner = this.nodes[partnerId];
          
          // Vérifier que le partenaire existe et est affiché
          if (partner && branchNodes.has(partnerId) && 
              node.x !== undefined && node.y !== undefined &&
              partner.x !== undefined && partner.y !== undefined) {
            
            // Créer une clé unique pour éviter les doublons (ordre alphabétique)
            const linkKey = [nodeId, partnerId].sort().join('-');
            
            if (!drawnLinks.has(linkKey)) {
              drawnLinks.add(linkKey);
              
              // Calculer les positions des centres des cartes
              const x1 = node.x * (this.options.cardWidth + this.options.cardGapX) + this.options.cardWidth / 2;
              const y1 = node.y * (this.options.cardHeight + this.options.cardGapY) + this.options.cardHeight / 2;
              const x2 = partner.x * (this.options.cardWidth + this.options.cardGapX) + this.options.cardWidth / 2;
              const y2 = partner.y * (this.options.cardHeight + this.options.cardGapY) + this.options.cardHeight / 2;
              
              // Dessiner une ligne horizontale entre les partenaires
              const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
              line.setAttribute('x1', x1);
              line.setAttribute('y1', y1);
              line.setAttribute('x2', x2);
              line.setAttribute('y2', y2);
              line.setAttribute('stroke', '#e91e63'); // Couleur rose pour les liens de couple
              line.setAttribute('stroke-width', 2);
              line.setAttribute('stroke-dasharray', '5,5'); // Ligne pointillée
              this.svg.appendChild(line);
            }
          }
        });
      }
    });
  }

  _addControls() {
    // Ajoute la barre de recherche
    const searchBar = document.createElement('div');
    searchBar.className = 'sft-search';
    searchBar.style.position = 'absolute';
    searchBar.style.top = '10px';
    searchBar.style.left = '10px';
    searchBar.style.zIndex = 10;
    searchBar.innerHTML = `
      <input type="text" class="sft-search-input" placeholder="Rechercher une personne..." />
      <div class="sft-search-results"></div>
    `;
    this.container.appendChild(searchBar);
    
    const searchInput = searchBar.querySelector('.sft-search-input');
    const searchResults = searchBar.querySelector('.sft-search-results');
    
    // Gestion de la recherche
    searchInput.addEventListener('input', (e) => {
      this._handleSearch(e.target.value, searchResults);
    });
    
    // Masquer les résultats quand on clique ailleurs
    document.addEventListener('click', (e) => {
      if (!searchBar.contains(e.target)) {
        searchResults.style.display = 'none';
      }
    });

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

  _handleSearch(query, resultsContainer) {
    if (!query || query.length < 2) {
      resultsContainer.style.display = 'none';
      return;
    }

    // Recherche dans toutes les données (pas seulement les nœuds affichés)
    const matches = this.data.filter(person => 
      person.nom && person.nom.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5); // Limiter à 5 résultats

    if (matches.length === 0) {
      resultsContainer.innerHTML = '<div class="sft-search-no-result">Aucun résultat trouvé</div>';
      resultsContainer.style.display = 'block';
      return;
    }

    // Afficher les résultats
    resultsContainer.innerHTML = matches.map(person => `
      <div class="sft-search-result" data-id="${person.id}">
        <div class="sft-search-result-img" style="background-image:url('${person.img || ''}')"></div>
        <div class="sft-search-result-name">${person.nom}</div>
      </div>
    `).join('');

    // Ajouter les événements de clic
    resultsContainer.querySelectorAll('.sft-search-result').forEach(result => {
      result.addEventListener('click', (e) => {
        e.stopPropagation();
        const personId = result.dataset.id;
        this.setFocus(personId);
        resultsContainer.style.display = 'none';
        // Vider la barre de recherche
        const searchInput = this.container.querySelector('.sft-search-input');
        if (searchInput) searchInput.value = '';
      });
    });

    resultsContainer.style.display = 'block';
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
    this._updateUrl(id);
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

  _getIdFromUrl() {
    // Récupérer l'ID depuis le hash de l'URL
    const hash = window.location.hash;
    if (hash && hash.startsWith('#')) {
      const id = hash.substring(1);
      // Convertir en nombre si c'est un ID numérique
      return isNaN(id) ? id : parseInt(id, 10);
    }
    return null;
  }

  _updateUrl(id) {
    // Mettre à jour l'URL avec l'ID de la personne focalisée
    if (id) {
      const newHash = `#${id}`;
      if (window.location.hash !== newHash) {
        window.history.pushState(null, null, newHash);
      }
    }
  }

  _setupUrlHandling() {
    // Écouter les changements d'URL (bouton retour/avant du navigateur)
    window.addEventListener('hashchange', () => {
      const urlId = this._getIdFromUrl();
      if (urlId && urlId !== this.focusId) {
        // Vérifier que l'ID existe dans les données
        const person = this.data.find(p => p.id === urlId);
        if (person) {
          this.focusId = urlId;
          this._createTree();
          // Centrer sur la nouvelle personne
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
      }
    });

    // Mettre à jour l'URL avec l'ID initial
    if (this.focusId) {
      this._updateUrl(this.focusId);
    }
  }

  _updateSVGSize() {
    // Calcule la bounding box de toutes les cartes affichées
    const branchNodes = this._branchNodes || new Set();
    const nodes = Object.values(this.nodes).filter(node => 
      branchNodes.has(node.id) && 
      node.x !== undefined && 
      node.y !== undefined &&
      !isNaN(node.x) && 
      !isNaN(node.y)
    );
    if (nodes.length === 0) return;
    
    const cardW = this.options.cardWidth;
    const cardH = this.options.cardHeight;
    const gapX = this.options.cardGapX;
    const gapY = this.options.cardGapY;
    
    const xCoords = nodes.map(n => n.x * (cardW + gapX));
    const yCoords = nodes.map(n => n.y * (cardH + gapY));
    const xCoordsMax = nodes.map(n => n.x * (cardW + gapX) + cardW);
    const yCoordsMax = nodes.map(n => n.y * (cardH + gapY) + cardH);
    
    let minX = Math.min(...xCoords);
    let minY = Math.min(...yCoords);
    let maxX = Math.max(...xCoordsMax);
    let maxY = Math.max(...yCoordsMax);
    
    // Vérifier que les valeurs sont valides
    if (isNaN(minX) || isNaN(minY) || isNaN(maxX) || isNaN(maxY)) {
      console.warn('SVG size calculation resulted in NaN values, skipping update');
      return;
    }
    
    // Ajoute une marge
    const margin = 40;
    minX -= margin;
    minY -= margin;
    maxX += margin;
    maxY += margin;
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Vérifier que les dimensions finales sont valides
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
      console.warn('Invalid SVG dimensions calculated, skipping update');
      return;
    }
    
    this.svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', height);
    this.svg.style.width = width + 'px';
    this.svg.style.height = height + 'px';
    this.svg.style.left = minX + 'px';
    this.svg.style.top = minY + 'px';
  }
}
