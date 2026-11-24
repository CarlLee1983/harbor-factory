const sprites = import.meta.glob('./assets/places/*.webp', {
  eager: true,
  import: 'default',
  query: '?inline',
});

export function placeSource(id) {
  return sprites[`./assets/places/${id}.webp`];
}
