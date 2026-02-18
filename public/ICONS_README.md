# Icons for Stream Recorder

This directory contains SVG and PNG icons for the Stream Recorder application.

## Icon Files

### Main Logo
- **stream-recorder-logo.svg** - Full application logo with text (200x200)
  - Features a video camera icon with stream indicators and a recording button
  - Includes animated recording indicator
  - Best for use in documentation, about pages, or splash screens

### App Icons
- **icon.svg** - Primary app icon source (128x128, located in `src/app/`)
  - Used by Next.js for automatic favicon generation
  - Optimized for web display at various sizes
  - Features simplified camera and record button design

### Favicon
- **favicon.svg** - SVG favicon (32x32)
  - Optimized for browser tabs
  - Simplified design for small display sizes
  - Includes animated recording indicator

### PNG Icons (Generated)
- **icon-192.png** - 192x192 PNG icon for web manifest
- **icon-512.png** - 512x512 PNG icon for web manifest
- **apple-touch-icon.png** - 180x180 PNG for iOS devices

### Source SVGs
- **icon-192.svg** - SVG source for 192x192 icon
- **icon-512.svg** - SVG source for 512x512 icon

## Design

The icons feature:
- **Blue gradient background** (#1976d2 to #0d47a1) - represents the stream/video theme
- **Video camera icon** - represents the streaming/recording functionality
- **Stream indicators** - wavy lines indicating active streaming
- **Red recording button** - prominent recording indicator with pulsing animation
- **Clean, modern design** - suitable for both light and dark themes

## Regenerating PNG Icons

If you need to regenerate the PNG icons from the SVG sources, you can use the following methods:

### Using Node.js (Recommended)
```bash
# Install sharp if not already installed
npm install --no-save sharp

# Create and run conversion script
cat > generate-icons.mjs << 'EOF'
import sharp from 'sharp';
import { join } from 'path';

async function convertSvg(inputPath, outputPath, size) {
  await sharp(inputPath)
    .resize(size, size)
    .png()
    .toFile(outputPath);
  console.log(`✓ Created ${outputPath}`);
}

await convertSvg('src/app/icon.svg', 'public/icon-192.png', 192);
await convertSvg('src/app/icon.svg', 'public/icon-512.png', 512);
await convertSvg('src/app/icon.svg', 'public/apple-touch-icon.png', 180);
EOF

node generate-icons.mjs
rm generate-icons.mjs
```

### Using ImageMagick
```bash
convert src/app/icon.svg -resize 192x192 public/icon-192.png
convert src/app/icon.svg -resize 512x512 public/icon-512.png
convert src/app/icon.svg -resize 180x180 public/apple-touch-icon.png
```

### Using Inkscape
```bash
inkscape src/app/icon.svg --export-type=png --export-width=192 -o public/icon-192.png
inkscape src/app/icon.svg --export-type=png --export-width=512 -o public/icon-512.png
inkscape src/app/icon.svg --export-type=png --export-width=180 -o public/apple-touch-icon.png
```

## Web Manifest

The `site.webmanifest` file references these icons for Progressive Web App (PWA) functionality:
- Enables "Add to Home Screen" on mobile devices
- Provides proper app icons for all platforms
- Configured with app name, description, and theme colors

## Usage in Next.js

The icons are automatically configured in `src/app/layout.tsx`:
- SVG favicon for modern browsers
- PNG fallbacks for compatibility
- Apple touch icon for iOS devices
- Web manifest for PWA support

## Animation

The recording indicator in the SVG icons includes a CSS animation that pulses the opacity, creating a "live recording" effect. This animation works in modern browsers that support SVG animations.
