# gilTree

Librairie JavaScript de création d'arbres généalogiques interactifs avec zoom, drag et centrage automatique.

## Fonctionnalités

- **Arbre généalogique interactif** : Affichage d'un arbre généalogique avec cartes personnalisées
- **Navigation fluide** : Zoom, déplacement par glisser-déposer, centrage automatique
- **Focus dynamique** : Changement de perspective en cliquant sur une personne
- **Recherche intégrée** : Barre de recherche pour trouver et naviguer vers une personne
- **Affichage optimisé** : Seule la branche active est affichée (ascendants et descendants)
- **Styles personnalisables** : Couleurs différenciées par genre, images de profil
- **Contrôles intégrés** : Boutons de zoom et de centrage

## Installation

Incluez les fichiers CSS et JavaScript dans votre page HTML :

```html
<link rel="stylesheet" href="./lib/gilTree.css">
<script src="./lib/gilTree.js"></script>
```

## Utilisation

### Exemple basique

```html
<div id="container"></div>

<script>
const data = [
  {
    id: "1",
    name: "Jean Dupont",
    genre: "H",
    img: "path/to/photo.jpg",
    parentIds: ["2", "3"]
  },
  // ... autres membres
];

const tree = new SimpleFamilyTree('#container', data, {
  rootId: "1"
});
</script>
```

### Structure des données

Chaque membre de la famille doit avoir :

- `id` : Identifiant unique (string)
- `name` : Nom complet de la personne
- `genre` : "H" pour homme, "F" pour femme (optionnel, affecte les couleurs)
- `img` : URL de l'image de profil (optionnel)
- `parentIds` : Tableau des IDs des parents (optionnel)

### Options de configuration

```javascript
const options = {
  cardWidth: 180,        // Largeur des cartes en pixels
  cardHeight: 70,        // Hauteur des cartes en pixels
  cardGapX: 40,         // Espacement horizontal entre cartes
  cardGapY: 80,         // Espacement vertical entre cartes
  background: '#f8f9fa', // Couleur de fond
  linkColor: '#bbb',     // Couleur des liens
  zoomMin: 0.3,         // Zoom minimum
  zoomMax: 2,           // Zoom maximum
  initialZoom: 1,       // Zoom initial
  rootId: null          // ID de la personne racine (focus initial)
};
```

## API

### Méthodes principales

#### `updateData(newData)`
Met à jour les données de l'arbre avec de nouvelles données.

```javascript
tree.updateData(nouveauxDonnees);
```

#### `setFocus(id)`
Change le focus sur une personne spécifique et recentre l'arbre.

```javascript
tree.setFocus("personneid");
```

#### `center()`
Centre l'arbre dans le conteneur.

```javascript
tree.center();
```

### Interactions utilisateur

- **Clic sur une carte** : Change le focus sur cette personne
- **Barre de recherche** : Tape le nom d'une personne pour la rechercher et naviguer vers elle
- **Glisser-déposer** : Déplace l'arbre
- **Molette de la souris** : Zoom avant/arrière
- **Double-clic** : Centre l'arbre
- **Boutons de contrôle** : Zoom +/-, centrage

## Algorithme d'affichage

La librairie utilise un algorithme optimisé basé sur Reingold-Tilford pour :

1. **Sélection de branche** : Affiche uniquement les ascendants et descendants de la personne focalisée, incluant leur fratrie
2. **Placement hiérarchique** : Organise les générations en niveaux (parents vers le haut, enfants vers le bas)
3. **Centrage automatique** : Centre chaque sous-arbre pour un affichage équilibré
4. **Liens intelligents** : Dessine les connexions parent-enfant avec des courbes SVG

## Styles CSS

Les styles peuvent être personnalisés via les classes CSS :

- `.sft-container` : Conteneur principal
- `.sft-card` : Cartes individuelles
- `.sft-card:hover` : État de survol
- `.sft-img` : Images de profil
- `.sft-name` : Noms des personnes
- `.sft-focus` : Personne actuellement focalisée
- `.sft-search` : Conteneur de la barre de recherche
- `.sft-search-input` : Champ de saisie de recherche
- `.sft-search-results` : Conteneur des résultats de recherche
- `.sft-search-result` : Élément de résultat individuel

## Exemple complet

Voir le fichier `index.html` pour un exemple d'implémentation complète avec données de test.

## Compatibilité

- Navigateurs modernes supportant ES6
- SVG pour les liens
- CSS Flexbox pour la mise en page
