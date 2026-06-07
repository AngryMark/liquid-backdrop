
<div align="center" dir="auto">
  <a target="_blank" rel="noopener noreferrer" href="assets/logo.png">
    <img src="assets/logo.png" alt="LiquidBackdrop Logo" width="120" style="max-width: 100%;">
  </a>
  <div class="markdown-heading" dir="auto">
    <h1 tabindex="-1" class="heading-element" dir="auto">LiquidBackdrop</h1>
  </div>
  <p dir="auto">
    <strong>Liquid Glass Effect & Components for the Web</strong>
  </p>
  <a target="_blank" rel="noopener noreferrer nofollow" href="https://github.com/AngryMark/liquid-backdrop/releases/tag/1.0.0"><img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version" style="max-width: 100%;"></a>
  <a target="_blank" rel="noopener noreferrer nofollow" href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" style="max-width: 100%;"></a>
  <a target="_blank" rel="noopener noreferrer nofollow" href="https://github.com/AngryMark"><img src="https://img.shields.io/badge/author-AngryMark-red.svg" alt="Author" style="max-width: 100%;"></a>
</div>

---

<div align="center" dir="auto">
	<img width="720" height="540" alt="LiquidBackdrop Demo" src="https://github.com/user-attachments/assets/c066844d-a9f7-45d7-a60d-6f69a37701a1" />
</div>

## 💧 Overview

**LiquidBackdrop** is a simple to use, all-in-one modular JavaScript library for creating modern "Liquid Glass" visual effect and elements directly in the browser while maintaining best possible quality, also featuring a dedicated Hooke's Law spring physics engine and native Web Components.

It works by dynamically calculating a **2D Signed Distance Field (SDF)** to generate real-time **SVG Displacement Maps**, simulates physically accurate light refraction, convex lens magnification, single-pass chromatic dispersion (RGB split) and reactive edge bevels based on the exact geometry of the element.

---

## ✨ Features

* 🧩 **Simplicity & Modularity**
Complex effects applying instantly via a single CSS variable (`--liquid-backdrop`). Modular ES architecture: import only the core, physics, or specific component needed.
* 🪟 **Native SVG Compositing**
Injects dynamically generated SVG displacement maps directly into the CSS `backdrop-filter` property. Browser's native GPU compositor perfectly refracts all underlying DOM layers without WebGL canvas hacks.
* 💧 **Physically Accurate Refraction**
2D SDF math is used to calculate exact geometry of the element. Accurately simulates spherical bevels, convex lenses, and single-pass chromatic aberration for realistic liquid glass.
* ✨ **Dynamic Gyroscope Lighting**
Procedural edge lighting (`shine()`) which reacts to device orientation (iOS/Android) using optimized mathematical lerping for smooth interactive reflections.
* 🌊 **Built-in LiquidPhysics Engine**
Lightweight Hooke's Law spring module. Replaces rigid CSS transitions with calculated tension, friction, and velocity for natural liquid feeling, FPS independent animations.
* 🧱 **Native Web Components Ecosystem**
Custom Elements (like `<liquid-toggle>`) in Shadow DOM. Combines visual refraction, pointer tracking, and full use of the physics engine.
* 🚀 **Performance, Debug & Fallbacks**
Dynamic resolution scaling (`--lb-quality`), smart off-screen pausing via `IntersectionObserver`, visual SDF debug maps and CSS blur fallback.

---

## 🔬 Library Under the Hood

LiquidBackdrop is built on a custom JavaScript matrix engine that dynamically calculates a **2D Signed Distance Field (SDF)** to generate real-time SVG Displacement Maps. These maps are then injected into the native CSS `backdrop-filter` property.

While most advanced web visual effects rely on WebGL, LiquidBackdrop runs directly inside the browser's native compositor. It natively refracts all HTML DOM elements, playing `<video>` tags, CSS animations, scrolling text and etc.

Here is a deep dive into the mathematics and the rendering pipeline:

#### 1. Signed Distance Field (SDF) Matrix calculation
For every tracked element, the engine generates an off-screen HTML5 Canvas. A nested `for` loop iterates over every pixel, calculating its exact geometric distance to the element's rounded rectangle boundary using Pythagorean distance algorithms (`Math.sqrt(qx*qx + qy*qy)`). This mathematical field allows the engine to determine exactly where the flat surface ends and the curved bevel begins.

#### 2. Physical Refraction & Spherical Bevels
When a pixel falls within the defined `bevel` radius, the engine calculates a 2D surface normal based on its regional quadrant (corners vs. straight edges). Then applies a spherical curve equation (`1 - Math.sqrt(1 - prog*prog)`) to shift the UV coordinates. This simulates the exact physical behavior of light bending around thick, polished glass edges.

#### 3. Convex Lens Magnification
The `magnify` parameter introduces a Spherical Dome Lens model. By mapping the depth of the SDF through a sine wave (`Math.sin(normDepth * Math.PI / 2)`), it distorts the backdrop to simulate zoom-in or zoom-out effects. This prevents hard visual clipping at the element's edges, smoothly blending the magnified center back to a `1.0` scale at the borders.

#### 4. Mathematical Anti-Aliasing
Because the displacement map is a rasterized pixel matrix, sharp curves would normally look jagged and pixelated. LiquidBackdrop implements sub-pixel smoothing (anti-aliasing) directly inside the Alpha channel of the generated map. Using a smoothstep-like interpolation (`t * t * (3 - 2 * t)`), it gracefully fades the displacement intensity at the sub-pixel boundary.

#### 5. Single-Pass Chromatic Aberration
Generating three separate height maps for RGB color splitting destroys CPU performance. Instead, LiquidBackdrop uses a single-pass SVG optimization. One height map is generated, then passed through multiple `<feDisplacementMap>` nodes with slightly offset scales for the Red and Blue channels, and seamlessly stitch them back together using arithmetic `<feComposite>`.

#### 6. Dynamic Lighting & Mask Compositing
Interactive `shine()` effect uses procedurally generated CSS linear gradients with ability to be updated by Gyroscope lerping algorithms. To restrict the shine strictly to a 1px inner border (simulating edge lighting), CSS masking trick is used: `-webkit-mask-composite: xor` and `mask-composite: exclude`.

#### 7. Performance Matrix Scaling
Engine features dynamic resolution scaling via the `--lb-quality` CSS property. If set to `0.5`, the engine downsizes the internal matrix calculation by 50% (saving a ton of CPU cycles), generates the displacement map, and relies on the GPU's bilinear filtering to upscale it within the SVG node.

---

## 📦 Installation & Getting Started

LiquidBackdrop is distributed as ES Modules.

### Direct Download
1. Download the `src` folder from this repository.
2. Drop it into project.
3. Import it as a module:
```javascript
import LiquidBackdrop from './src/liquidbackdrop.js';
  
// Optional physics and components
import { Spring } from './src/liquidphysics.js';
import './src/components/liquidtoggle.js';

LiquidBackdrop.start();
```

### Via jsDelivr CDN
```html
<script type="module">
  // 1. Import Core Engine
  import LiquidBackdrop from 'https://cdn.jsdelivr.net/gh/AngryMark/liquid-backdrop@1.0.0/src/liquidbackdrop.js';
  
  // 2. Import Components (Browser automatically fetches physics module internally)
  import 'https://cdn.jsdelivr.net/gh/AngryMark/liquid-backdrop@1.0.0/src/components/liquidtoggle.js';

  // 3. OPTIONAL: Import Physics explicitly ONLY if there is a need to write custom spring animations in this script
  // import { Spring } from 'https://cdn.jsdelivr.net/gh/AngryMark/liquid-backdrop@1.0.0/src/liquidphysics.js';

  // Start the observer
  LiquidBackdrop.start();
</script>
```

### Basic Usage (HTML & CSS)
Once the engine is started, LiquidBackdrop automatically observes the DOM. Then simply apply the `--liquid-backdrop` CSS variable to any element.

```html
<div class="my-glass-panel">Liquid Glass!</div>

<style>
.my-glass-panel {
    width: 300px;
    height: 200px;
    border-radius: 40px;
    background: rgba(255, 255, 255, 0.05);
    
    /* Any CSS filter can be also added to the mix */
    --liquid-backdrop: brightness(1.2) blur(5px) liquid-glass(30, 15, 1, 0) shine(0.35, 160deg);
    
    /* Lower internal canvas resolution by 30% for FPS boost */
    --lb-quality: 0.7;
}
</style>
```

### JavaScript API & Configuration
There is a global engine settings and manual tracking of the elements using the JS API.

```javascript
// Global settings overrides
LiquidBackdrop.setFallback(true);    // Force basic CSS blur on all browsers
LiquidBackdrop.setDebug(true);       // Shows visual SDF height map layers
LiquidBackdrop.setMotion(true);      // Enables device gyroscope for dynamic shine effect
1. 
// Manual Element Tracking
const newElement = document.createElement('div');
newElement.style.setProperty('--liquid-backdrop', 'liquid-glass(25, 15, 0, 0)');
document.body.appendChild(newElement);

// Observers usually catch this automatically, but can be forced to immediate attachment:
LiquidBackdrop.observe(newElement); 
```
---

## ⚛️ Physics & Components

LiquidBackdrop includes optional modules and components for building next-generation UIs.

### LiquidPhysics (`liquidphysics.js`)
A lightweight mathematical Hooke's Law spring physics engine. `LiquidPhysics` handles tension (`stiffness`), friction (`damping`), and momentum (`velocity`) to create organic liquid animations.

```javascript
import { Spring } from 'liquid-backdrop/physics';

// stiffness = snap speed, damping = friction/bounciness
const mySpring = new Spring({ stiffness: 0.08, damping: 0.75 });
mySpring.set(1); // Set target destination

// Inside requestAnimationFrame loop:
function loop() {
    const isMoving = mySpring.update(); // Computes current frame's velocity
    console.log(mySpring.val); // Apply this value to your DOM transform
    if (isMoving) requestAnimationFrame(loop);
}
loop();
```

### LiquidToggle Component (`<liquid-toggle>`)
Toggle Web Component. It combines `LiquidBackdrop` visual refraction with `LiquidPhysics` momentum. You can use it exactly like a standard HTML `<input>` checkbox. It supports custom colors, sizes, and emits native JavaScript events.

* **Pointer Events API:** It uses `setPointerCapture` to track a swipe even if a finger leaves the switch area.
* **Squash and Stretch:** It reads the `velocity` from the `LiquidPhysics` spring and applies it to the `scaleX` and `scaleY` CSS transforms. The faster is a swipe, the more the liquid thumb organically stretches.
* **Dynamic Refraction:** Internal `--liquid-backdrop` opacity fades in mathematically based on press progress.
* **Customizable Colors:** Accepts `color-on` and `color-off` HEX attributes (including 8-digit transparency).
* **Native State Handling:** Emits a standard `change` event just like a regular HTML `<input>` checkbox. The updated state is passed via `event.detail.active`.

#### 1. Customizing
Dimensions of the toggle can be set by using standart CSS properties. Also there is a way to pass custom HEX colors using the `color-on` and `color-off` attributes, which will be converted to RGBA the fly. For the last, set `active` attribute to initially show toggle with an active state.

```javascript
import 'liquid-backdrop/components/toggle';
```
```html
<liquid-toggle active color-on="#486ae1cc" color-off="#333333" style="width: 80px; height: 40px;"></liquid-toggle>
```

#### 2. Handling State Changes
The component emits a standard `change` event whenever the user clicks or swipes the toggle. The new state is passed inside `event.detail.active`.

```html
<liquid-toggle id="theme-switch"></liquid-toggle>

<script>
  const toggle = document.getElementById('theme-switch');
  
  toggle.addEventListener('change', (event) => {
      const isEnabled = event.detail.active;
      
      if (isEnabled) {
          document.body.classList.add('dark-theme');
      } else {
          document.body.classList.remove('dark-theme');
      }
  });
</script>
```

---

## ⚠️ Browser Compatibility

**Current Status:** Chromium-exclusive.

Because LiquidBackdrop pushes the absolute limits of CSS-to-SVG bridging, it relies on features currently fully implemented only in Chromium-based browsers (Chrome, Edge, Opera, etc).
* **WebKit (Safari / iOS):** Currently ignores SVG filters referenced inside the `backdrop-filter` property.
* **Gecko (Firefox):** Has limited support and fails to composite the displacement map correctly against the backdrop layer.

A Fallback Mode is built-in to degrade to standard `blur(4px)` on unsupported browsers/devices.

---

## 🚀 Roadmap
* 🔄 Add new components: LiquidButton, LiquidBottomTab, LiquidSlider
* 🔄 Move heavy SDF matrix calculations to a Web Worker (the nested `for` loops mapping every pixel)
* 🔄 Implement masked gradient blur near edges for better dispersion
* 🔄 Implement baked masked liquid glass (svg mask)
* 🔄 Implement liquid glass effect for text
* 🔄 Add optional multiple point-lights via dynamic SVG `<fePointLight>` generation 
* 🔄 Add reflection and highlights from the neighboring glass nearby
* 🔄 Improve fallback mode
* 🔄 Add Squircle border support for elements
* 🔄 Research to use SnapDOM as backdrop provider for wide browser support
* 🔄 Research Firefox Polyfill support with element()

---

