const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function convert(name, subdir = '') {
  const input = path.join(__dirname, 'media', subdir, `${name}.svg`);
  const output = path.join(__dirname, 'media', subdir, `${name}.png`);
  if (!fs.existsSync(input)) {
    console.log(`Skipping ${name}.svg (not found)`);
    return;
  }
  await sharp(input).resize(1200, null).png().toFile(output);
  console.log(`Converted media/${subdir}${name}.svg to media/${subdir}${name}.png`);
}

(async () => {
  await convert('icon');
  await convert('full-layout', 'wireframes');
  await convert('approval-required', 'wireframes');
  console.log('Done converting SVGs to PNG');
})();
