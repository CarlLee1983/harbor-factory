export const CHARACTERS = [
  { id: 'captain', name: '阿海船長', role: '船長', color: '#bb593b', art: '⚓', style: 'captain', skin: '#bd7e5f', hair: '#ede6d1' },
  { id: 'florist', name: '小棠', role: '花藝師', color: '#347956', art: '✿', style: 'bun', skin: '#e9a680', hair: '#3d282a' },
  { id: 'courier', name: '阿哲', role: '單車信差', color: '#275a8a', art: '◇', style: 'cap', skin: '#c8855c', hair: '#312923' },
  { id: 'auntie', name: '美珠阿嬤', role: '茶館老闆', color: '#874b75', art: '☕', style: 'silver', skin: '#f0b79b', hair: '#d9d6cf' },
  { id: 'engineer', name: '以安', role: '造船工程師', color: '#a75423', art: '✦', style: 'helmet', skin: '#916044', hair: '#302721' },
  { id: 'painter', name: '南川', role: '街頭畫家', color: '#596794', art: '◒', style: 'beret', skin: '#e3a47f', hair: '#5a3f2f' },
  { id: 'diver', name: '可晴', role: '潛水教練', color: '#14787b', art: '≋', style: 'goggles', skin: '#b87e61', hair: '#2c251d' },
  { id: 'baker', name: '老林', role: '麵包師', color: '#8a4e3a', art: '◍', style: 'toque', skin: '#d39872', hair: '#898174' },
];

export function getCharacter(id) {
  return CHARACTERS.find((character) => character.id === id);
}
