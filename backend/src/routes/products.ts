import { Router } from 'express';

export const router = Router();

// In-memory products for now
let products = [
  {
    productCode: 'P001',
    productName: 'Sample Product',
    weightPerPiece: 10.0,
    quantityPerMeasurement: 5,
    tolerance: 1.0,
    unit: 'g',
    description: 'Demo product',
  },
];

router.get('/', (_req, res) => {
  res.json(products);
});

router.post('/', (req, res) => {
  const p = req.body;
  products.push(p);
  res.status(201).json(p);
});
