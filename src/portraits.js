// Embed the character art so both renderers can load it during offline play.
const characterArt = import.meta.glob('./assets/portraits/*.webp', {
  eager: true,
  import: 'default',
  query: '?inline',
});

export function portraitSource(id) {
  return characterArt[`./assets/portraits/${id}.webp`];
}

export function pawnSource(id) {
  return characterArt[`./assets/portraits/${id}-pawn.webp`];
}

export function portrait(id, className = '') {
  return `<img alt="" width="96" height="104" class="portrait ${className}" src="${portraitSource(id)}">`;
}
