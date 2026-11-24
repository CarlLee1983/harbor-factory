import { getCharacter } from './characters.js';
import { portrait } from './portraits.js';

export function renderStandings(state) {
  const tiedRanks = new Set(state.standings.filter(({ rank }, index, rows) => rows[index + 1]?.rank === rank)
    .map(({ rank }) => rank));
  const money = (amount) => amount.toLocaleString('zh-TW');
  const rows = state.standings.map(({ playerId, rank, cash, propertyValue, total }) => {
    const player = state.players[playerId - 1];
    const character = getCharacter(player.characterId);
    const rankLabel = tiedRanks.has(rank) ? `並列第 ${rank} 名` : `第 ${rank} 名`;
    return `<tr ${rank === 1 ? 'class="standings-first"' : ''}>
      <td>${rankLabel}</td>
      <th scope="row">${player.name}<strong>${character.name}</strong></th>
      <td>${money(cash)}</td>
      <td>${money(propertyValue)}</td>
      <td><strong>${money(total)}</strong></td>
    </tr>`;
  }).join('');

  const winners = state.standings.filter(row => row.rank === 1);
  const title = state.players.length === 1 ? '航程結算' : winners.length > 1 ? '共同奪冠' : '本局冠軍';
  const portraits = winners.map(({ playerId }) => {
    const { characterId } = state.players[playerId - 1];
    return `<figure>${portrait(characterId)}<figcaption>${getCharacter(characterId).name}</figcaption></figure>`;
  }).join('');
  return `<section class="character-deck standings">
    <header class="victory-display">
      <div class="victory-title"><h2>${title}</h2><p>總資產 <strong>${money(winners[0].total)}</strong> 元</p></div>
      <div class="victory-portraits">${portraits}</div>
    </header>
    <table>
      <caption>金額以元計。總資產為現金加地產買價。</caption>
      <thead><tr>
        <th scope="col">名次</th><th scope="col">玩家</th><th scope="col">現金</th>
        <th scope="col">地產買價</th><th scope="col">總資產</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="standings-actions">
      <button type="button" class="primary" data-standings-new>開始新局 <span aria-hidden="true">→</span></button>
      <button type="button" class="text-button" data-standings-home>返回首頁</button>
    </div>
  </section>`;
}
