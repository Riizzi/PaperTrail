import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Fundo cinza preenchendo o quadrado inteiro sem transparência -->
  <rect width="512" height="512" fill="#D6CFC4" />
  
  <!-- Símbolo preto monocromático: Folha com canto dobrado e trilha pontilhada -->
  <g stroke="#1C1917" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <!-- Folha de papel -->
    <!-- Contorno principal com canto superior direito chanfrado para a dobra -->
    <path d="M 180 120 L 310 120 L 370 180 L 370 340 L 180 340 Z" fill="#EBE5DC" stroke="#1C1917" stroke-width="16" />
    
    <!-- Canto dobrado -->
    <path d="M 310 120 L 310 180 L 370 180" fill="#D6CFC4" stroke="#1C1917" stroke-width="16" />
    
    <!-- Linhas de texto representativas no papel -->
    <line x1="220" y1="210" x2="330" y2="210" stroke="#1C1917" stroke-width="12" />
    <line x1="220" y1="250" x2="310" y2="250" stroke="#1C1917" stroke-width="12" />
    <line x1="220" y1="290" x2="270" y2="290" stroke="#1C1917" stroke-width="12" />
    
    <!-- Trilha pontilhada saindo da folha -->
    <path d="M 275 340 C 275 390, 220 400, 200 430 C 185 450, 195 470, 240 460 C 290 450, 340 430, 360 460" 
          stroke="#1C1917" 
          stroke-width="14" 
          stroke-linecap="round" 
          stroke-dasharray="4 22" />
  </g>
</svg>`;

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svg);

async function generate() {
  const svgBuffer = Buffer.from(svg);
  
  // 180px apple-touch-icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
    
  // 192px PWA
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
    
  // 512px PWA
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // 512px maskable
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  // favicon
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));

  console.log('Icons generated successfully!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
