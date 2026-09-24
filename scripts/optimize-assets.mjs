import sharp from 'sharp';
import { resolve } from 'node:path';

const source = resolve('public/archive-hero-v1.png');
const destination = resolve('public/archive-hero-v1.webp');

await sharp(source)
  .webp({ quality: 82, effort: 6 })
  .toFile(destination);

console.log(destination);
