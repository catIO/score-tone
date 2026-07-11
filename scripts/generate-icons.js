const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconDir = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// Custom SVG App Logo
const svgData = `
  <svg xmlns="http://www.w3.org/2000/svg" height="1000" viewBox="0 -960 960 960" width="1000">
    <path fill="#ffffff" d="M500-360q42 0 71-29t29-71v-220h120v-80H560v220q-13-10-28-15t-32-5q-42 0-71 29t-29 71q0 42 29 71t71 29ZM320-240q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z"/>
  </svg>
`;

const bgHex = '#000000'; // Pure black

async function generateIcons() {
  // 1. Android/PWA icons (square, full-bleed black background)
  const sizes = [192, 512];
  for (const size of sizes) {
    try {
      const padding = Math.round(size * 0.2);
      const innerSize = size - padding * 2;

      const innerIcon = await sharp(Buffer.from(svgData))
        .resize(innerSize, innerSize)
        .toBuffer();

      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: bgHex
        }
      })
        .composite([{ input: innerIcon, gravity: 'center' }])
        .png()
        .toFile(path.join(iconDir, `icon-${size}x${size}.png`));

      console.log(`Generated icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`Error generating icon-${size}x${size}.png:`, error);
    }
  }

  // 2. Apple Touch Icon (180x180, full-bleed black background)
  try {
    const size = 180;
    const padding = Math.round(size * 0.15);
    const innerSize = size - padding * 2;

    const innerIcon = await sharp(Buffer.from(svgData))
      .resize(innerSize, innerSize)
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: bgHex
      }
    })
      .composite([{ input: innerIcon, gravity: 'center' }])
      .png()
      .toFile(path.join(iconDir, 'apple-touch-icon.png'));

    console.log('Generated apple-touch-icon.png');
  } catch (error) {
    console.error('Error generating apple-touch-icon.png:', error);
  }

  // 3. Standalone Mac icon (512x512, transparent with rounded black rect)
  try {
    const size = 512;
    const innerSize = 400;
    const innerPadding = 80;
    const iconSize = innerSize - innerPadding * 2;
    const rx = 80;

    const bgSvg = `
      <svg width="${innerSize}" height="${innerSize}">
        <rect width="${innerSize}" height="${innerSize}" rx="${rx}" fill="${bgHex}" />
      </svg>
    `;

    const bgBuffer = await sharp(Buffer.from(bgSvg)).toBuffer();

    const innerIcon = await sharp(Buffer.from(svgData))
      .resize(iconSize, iconSize)
      .toBuffer();

    const roundedSquare = await sharp(bgBuffer)
      .composite([{ input: innerIcon, gravity: 'center' }])
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: roundedSquare, gravity: 'center' }])
      .png()
      .toFile(path.join(iconDir, 'icon-mac.png'));

    console.log('Generated icon-mac.png');
  } catch (error) {
    console.error('Error generating icon-mac.png:', error);
  }

  console.log('Done!');
}

generateIcons().catch(console.error);
