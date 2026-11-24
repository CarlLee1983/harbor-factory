const marketStall = { price: 100, rent: 30 };
const shopfront = { price: 200, rent: 60 };
const landmark = { price: 300, rent: 90 };

const locations = [
  ['start', '啟航廣場', 'start', { startBonus: 100 }],
  ['lighthouse', '燈塔街', 'property', marketStall],
  ['salt', '鹽埕街', 'property', shopfront],
  ['flower', '花市', 'property', landmark],
  ['fish', '魚市場', 'property', marketStall],
  ['customs', '海關街', 'property', shopfront],
  ['ferry', '渡船口', 'property', landmark],
  ['tide', '潮汐消息', 'event', { eventCash: -40 }],
  ['warehouse', '紅磚倉庫', 'property', marketStall],
  ['dock', '船塢', 'property', shopfront],
  ['harbor-road', '港邊路', 'property', landmark],
  ['wind', '海風來信', 'event', { eventCash: 60 }],
  ['tea', '茶香巷', 'property', marketStall],
  ['pier', '白帆碼頭', 'property', shopfront],
  ['book', '舊書街', 'property', landmark],
  ['festival', '港灣慶典', 'event', { eventCash: 50 }],
  ['tin', '鐵皮工坊', 'property', marketStall],
  ['market', '南岸市集', 'property', shopfront],
  ['clock', '鐘樓前', 'property', landmark],
  ['parcel', '遠方郵件', 'event', { eventCash: -30 }],
  ['embankment', '石堤步道', 'property', marketStall],
  ['watchtower', '瞭望臺', 'property', shopfront],
  ['bakery', '麵包小路', 'property', landmark],
  ['neighbors', '街坊互助', 'event', { eventCash: 40 }],
  ['rope', '繩結工坊', 'property', marketStall],
  ['alley', '漁網巷', 'property', shopfront],
  ['bridge', '月光橋', 'property', landmark],
  ['storm', '浪潮插曲', 'event', { eventCash: -50 }],
  ['station', '海港車站', 'property', marketStall],
  ['square', '榕樹廣場', 'property', shopfront],
  ['gallery', '海景畫廊', 'property', landmark],
  ['delivery', '港區小報', 'event', { eventCash: 30 }],
  ['ferry-road', '渡輪大道', 'property', marketStall],
  ['paper', '紙燈籠街', 'property', shopfront],
  ['hill', '山丘公園', 'property', landmark],
  ['rain', '午後陣雨', 'event', { eventCash: -20 }],
  ['ramp', '石板坡', 'property', marketStall],
  ['sunset', '夕陽露臺', 'property', shopfront],
  ['ocean-news', '海上快訊', 'event', { eventCash: 60 }],
  ['wharf', '北側埠頭', 'property', landmark],
];

function coordinates(index) {
  if (index <= 10) return [index, 10];
  if (index <= 20) return [10, 20 - index];
  if (index <= 30) return [30 - index, 0];
  return [0, index - 30];
}

export const HARBOR = {
  id: 'harbor',
  version: 1,
  name: '港灣街區',
  startId: 'start',
  locations: locations.map(([id, name, type, rules], index) => {
    const [x, z] = coordinates(index);
    return { id, name, type, x, z, ...rules, exits: [locations[(index + 1) % locations.length][0]] };
  }),
};

export function getLocation(map, id) {
  return map.locations.find((location) => location.id === id);
}
