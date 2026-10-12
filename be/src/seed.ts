import type { Product } from './types.js';

export const seedProducts = (): Product[] => [
  { id: 'widget',   name: 'Widget',                  priceCents: 1999,  inventory: 100 },
  { id: 'gadget',   name: 'Gadget',                  priceCents: 4950,  inventory: 50 },
  { id: 'gizmo',    name: 'Gizmo',                   priceCents: 999,   inventory: 200 },
  { id: 'doohickey',name: 'Doohickey',               priceCents: 12500, inventory: 20 },
  { id: 'thingamajig', name: 'Thingamajig',          priceCents: 333,   inventory: 1000 },
  { id: 'sneaker',  name: 'Limited Edition Sneaker', priceCents: 15000, inventory: 3 },
];
