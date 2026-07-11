const sharp = require('sharp');
const path = require('path');

async function check() {
  const filePath = '/Users/catherina/Documents/apps/practice-mirror/icons/icon-mac.png';
  const image = sharp(filePath);
  const stats = await image.stats();
  console.log('Channels stats:', stats.channels);
}

check().catch(console.error);
