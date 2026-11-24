import { getCharacter } from './characters.js';
import { getLocation } from './map.js';
import { placeSource } from './place-art.js';
import './board.css';

export function mountDeed(container, map, onSelection) {
  let location;
  const panel = document.createElement('div');
  panel.className = 'board-deed';
  panel.innerHTML = `
    <label>查看地塊 <select><option value="">選取地塊</option></select></label>
    <div class="board-deed-details" role="status"></div>`;
  const picker = panel.querySelector('select');
  const details = panel.querySelector('[role="status"]');
  function select(nextLocation) {
    location = nextLocation;
    onSelection(location);
  }
  for (const { id, name } of map.locations) picker.add(new Option(name, id));
  picker.addEventListener('change', () => select(getLocation(map, picker.value)));
  container.prepend(panel);

  return {
    get location() { return location; },
    select,
    render(owner) {
      picker.value = location?.id ?? '';
      const money = (value) => Number.isFinite(value) ? `${value} 元` : '—';
      const values = location?.type === 'property'
        ? [owner ? `${owner.name}・${getCharacter(owner.characterId).name}` : '無主地',
          money(location.price), money(location.rent)]
        : null;
      const type = location?.type === 'start' ? '起點' : '事件';
      const summary = values ? [location.name, ...values].join('/') : location?.name;
      if (details.dataset.summary === summary) return;
      details.dataset.summary = summary ?? '';
      details.replaceChildren();
      if (!location) return;
      const landmark = new Image(64, 64);
      landmark.className = 'deed-landmark';
      landmark.src = placeSource(location.id);
      landmark.alt = '';
      const name = document.createElement('strong');
      name.textContent = location.name;
      details.append(landmark, name);
      if (values) {
        const lease = document.createElement('dl');
        for (const [index, label] of ['地主', '地價', '租金'].entries()) {
          const pair = document.createElement('div');
          const term = document.createElement('dt');
          const value = document.createElement('dd');
          term.textContent = label;
          value.textContent = values[index];
          pair.append(term, value);
          lease.append(pair);
        }
        details.append(lease);
      } else {
        const label = document.createElement('span');
        label.textContent = type;
        details.append(label);
      }
    },
    destroy() { panel.remove(); },
  };
}

