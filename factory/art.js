export const factoryScene = new URL('./art/scene.png', import.meta.url).href;

export function locationArt(locationId) {
  return new URL(`./art/locations/${locationId}.png`, import.meta.url).href;
}

export function workerArt(characterId, view = 'front') {
  return new URL(`./art/workers/${characterId}-${view}.png`, import.meta.url).href;
}
