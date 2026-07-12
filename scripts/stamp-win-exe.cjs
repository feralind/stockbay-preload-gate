const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const exePath = path.join(root, 'dist', 'win-unpacked', 'StockWay.exe');
const iconPath = path.join(root, 'assets', 'icon.ico');

if (!fs.existsSync(exePath)) {
  throw new Error(`Cannot stamp Windows resources; missing ${exePath}`);
}

if (!fs.existsSync(iconPath)) {
  throw new Error(`Cannot stamp Windows resources; missing ${iconPath}`);
}

async function main() {
  const { rcedit } = await import('rcedit');

  await rcedit(exePath, {
    icon: iconPath,
    'file-version': '1.0.0',
    'product-version': '1.0.0.0',
    'version-string': {
      FileDescription: 'StockWay',
      ProductName: 'StockWay',
      LegalCopyright: 'Copyright (c) 2026 Tom',
      InternalName: 'StockWay',
      OriginalFilename: 'StockWay.exe',
    },
  });

  console.log(`Stamped Windows resources on ${exePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
