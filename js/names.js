// Random permanent handles for models, e.g. "Copper Mongoose 47".
const ADJ = ['Copper', 'Velvet', 'Marble', 'Dusty', 'Nimble', 'Solemn', 'Brassy', 'Lucky', 'Frosty', 'Sly', 'Amber', 'Cobalt',
  'Grumpy', 'Gilded', 'Humble', 'Jaunty', 'Mossy', 'Nervous', 'Onyx', 'Patient', 'Quiet', 'Rusty', 'Silver', 'Tipsy',
  'Uncanny', 'Violet', 'Wily', 'Zesty', 'Bashful', 'Crimson', 'Dapper', 'Elastic', 'Feral', 'Glossy', 'Hasty', 'Indigo',
  'Jade', 'Keen', 'Loyal', 'Midnight', 'Noble', 'Ochre', 'Plucky', 'Rowdy', 'Sable', 'Thrifty', 'Umber', 'Vivid', 'Wistful', 'Ashen'];
const NOUN = ['Mongoose', 'Croupier', 'Heron', 'Badger', 'Sparrow', 'Walrus', 'Otter', 'Falcon', 'Marmot', 'Lynx', 'Ferret', 'Pelican',
  'Weasel', 'Magpie', 'Tortoise', 'Gecko', 'Ocelot', 'Puffin', 'Raccoon', 'Stoat', 'Tapir', 'Vole', 'Wombat', 'Yak',
  'Beaver', 'Coyote', 'Dingo', 'Egret', 'Gibbon', 'Hedgehog', 'Ibis', 'Jackal', 'Kestrel', 'Lemur', 'Moose', 'Newt',
  'Osprey', 'Panda', 'Quail', 'Robin', 'Salmon', 'Toucan', 'Urchin', 'Viper', 'Wren', 'Zebra', 'Bison', 'Cormorant', 'Donkey', 'Elk'];

export function randomHandle(rng = Math.random) {
  const a = ADJ[Math.floor(rng() * ADJ.length)];
  const n = NOUN[Math.floor(rng() * NOUN.length)];
  const num = 10 + Math.floor(rng() * 90);
  return `${a} ${n} ${num}`;
}
