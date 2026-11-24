import { locationArt, workerArt } from './art.js';

export { locationArt as placeSource, workerArt as portraitSource, workerArt as pawnSource };

export function portrait(id, className = '') {
  return `<img alt="" width="96" height="104" class="portrait ${className}" src="${workerArt(id)}">`;
}
