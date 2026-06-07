/**
 * LiquidBackdrop Engine v1.0.0
 * 
 * @author AngryMark
 * @license MIT
 */

// Essential CSS rules auto-injected into document head on engine start
// Using CSS Variables (--lb-*) avoids triggering expensive DOM style recalculations from JS
// Z-index hierarchy isolates parent container and shine effect
const CORE_CSS = `
:root { --lb-angle: 165deg; --lb-opacity: 0.5; --lb-quality: 1.0; }
.lb-container { position: absolute; inset: 0; pointer-events: none; z-index: -1; overflow: hidden; border-radius: inherit; background: transparent; }
.lb-shine { position: absolute; inset: 0; pointer-events: none; z-index: 2; border-radius: inherit; overflow: hidden; will-change: opacity, mask-image; opacity: 0; }
.lb-debug { position: absolute; inset: 0; z-index: 10000; opacity: 0.8; pointer-events: none; border: 2px solid rgba(255, 0, 0, 0.5); background-size: 100% 100%; border-radius: inherit; }
`;

export default class LiquidBackdrop {
    // WeakMap stores internal instances (svg, container, cached values) tied to DOM nodes
    // Prevents memory leaks by allowing Garbage Collector to remove data if host element is deleted
    static elements = new WeakMap();
    // A Set tracking elements managed by engine for global forced updates
    static activeElements = new Set();
    static filters = new Map();
    static running = false;
    
    // Global configuration overrides
    static config = {
        fallback: false, // Forces CSS blur fallback
        debug: false,    // Renders raw heightmap overlays
        motion: false    // Globally enables gyroscope monitoring for shine effect
    };
    
    static resizeObserver = null;
    static mutationObserver = null;
    static intersectionObserver = null;

    static CSS_PROP = '--liquid-backdrop';
    static ANGLE_PROP = '--lb-angle';
    static OPACITY_PROP = '--lb-opacity';
    static QUALITY_PROP = '--lb-quality';

    // State variables for gyroscope lerping
    static motionActive = false;
    static targetBeta = 0;
    static targetGamma = 0;
    static currentBeta = 0;
    static currentGamma = 0;

    /**
     * Bootstraps engine, injects core CSS, registers Houdini properties, sets up DOM observers and parses initial elements
     */
    static start() {
        if (this.running) return;
        this.running = true;
        console.log('💧 LiquidBackdrop v1.0.0 Started');

        // Inject core styles if not present
        if (!document.getElementById('liquid-backdrop-css')) {
            const style = document.createElement('style');
            style.id = 'liquid-backdrop-css';
            style.textContent = CORE_CSS;
            document.head.prepend(style);
        }

        // Register custom properties via CSS Houdini API to allow hardware accelerated CSS transitions of variables
        if ('CSS' in window && 'registerProperty' in CSS) {
            try {
                CSS.registerProperty({ name: this.CSS_PROP, syntax: '*', inherits: false, initialValue: '' });
                CSS.registerProperty({ name: this.ANGLE_PROP, syntax: '<angle>', inherits: true, initialValue: '165deg' });
                CSS.registerProperty({ name: this.QUALITY_PROP, syntax: '<number>', inherits: true, initialValue: '1' });
            } catch (e) {}
        }

        this.#registerCore();
        this.#setupObservers();
        this.#scanInitialDOM();
    }

    /**
     * Public API to manually observe dynamically injected elements
     * Bypasses MutationObserver wait cycle for immediate rendering
     * @param {HTMLElement} element - DOM node to evaluate and attach to
     */
    static observe(element) {
        if (element && element.nodeType === 1) {
            this.#checkAndAttach(element);
        }
    }

    // Global configuration setters that trigger full redraw of all active elements
    static setFallback(val) { this.config.fallback = !!val; this.updateAll(); }
    static setDebug(val) { this.config.debug = !!val; this.updateAll(); }
    static setMotion(val) { 
        this.config.motion = !!val; 
        if (val) this.#enableMotion(); 
        this.updateAll(); 
    }

    /**
     * Forces recalculation of displacement maps across all visible tracked elements
     * Required when global quality scaling or fallback states change
     */
    static updateAll() {
        this.activeElements.forEach(el => {
            const st = this.elements.get(el);
            if (st && st.isVisible) {
                const style = getComputedStyle(el);
                this.#updateContainer(el, st.currentVal, style.borderRadius, style.getPropertyValue(this.QUALITY_PROP).trim());
            }
        });
    }

    /**
     * Initializes gyroscope event listener and interpolation loop for shine effect
     * Uses a low-pass filter to translate raw device tilt into smooth reflection movement
     */
    static #enableMotion() {
        if (this.motionActive) return;
        
        const handler = (e) => {
            if (e.beta === null) return;
            this.targetBeta = e.beta;
            this.targetGamma = e.gamma;
        };

        const loop = () => {
            const k = 0.15; // Low-pass filter interpolation factor, determines smoothing speed, lower = smoother but decrease reactivity
            
            // Lerp current values towards target gyroscope values to prevent physical sensor jitter
            this.currentBeta += (this.targetBeta - this.currentBeta) * k;
            this.currentGamma += (this.targetGamma - this.currentGamma) * k;

            // Calculate movement magnitude (Pythagorean theorem) to determine light intensity and angle limits
            const mag = Math.sqrt(this.currentBeta**2 + this.currentGamma**2);
            if (mag > 2.0) {
                // Convert radians to CSS degrees for procedural shine gradient angle
                const rad = Math.atan2(this.currentGamma, this.currentBeta);
                const deg = -(rad * (180 / Math.PI)) + 180;
                document.documentElement.style.setProperty(this.ANGLE_PROP, `${deg}deg`);
                
                // Adjust global opacity dynamically based on tilt magnitude (steeper tilt = brighter reflection)
                const op = 0.5 + (Math.min(mag, 50) / 50) * 0.4;
                document.documentElement.style.setProperty(this.OPACITY_PROP, op.toFixed(2));
            }
            requestAnimationFrame(loop);
        };

        // Handle strict iOS permission requirements for DeviceOrientationEvent
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            const req = () => {
                DeviceOrientationEvent.requestPermission().then(r => {
                    if (r === 'granted') {
                        window.addEventListener('deviceorientation', handler);
                        this.motionActive = true;
                        loop();
                    }
                }).catch(console.error);
                document.body.removeEventListener('click', req);
            };
            // Requires a user click to request permission on iOS
            document.body.addEventListener('click', req, { capture: true, once: true });
        } else {
            window.addEventListener('deviceorientation', handler);
            this.motionActive = true;
            loop();
        }
    }

    /**
     * Initializes Mutation, Resize, and Intersection observers to reactively update effect
     */
    static #setupObservers() {
        // Redraws SDF displacement map only when element dimensions change, preventing layout thrashing
        this.resizeObserver = new ResizeObserver(entries => {
            requestAnimationFrame(() => {
                for (const entry of entries) {
                    const el = entry.target;
                    const st = this.elements.get(el);
                    if (st && st.isVisible) {
                        const style = getComputedStyle(el);
                        this.#updateContainer(el, st.currentVal, style.borderRadius, style.getPropertyValue(this.QUALITY_PROP).trim());
                    }
                }
            });
        });

        // Suspends rendering and calculation for elements scrolled out of view to drastically save battery and CPU
        this.intersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const el = entry.target;
                const st = this.elements.get(el);
                if (st) {
                    st.isVisible = entry.isIntersecting;
                    // Resume rendering if scrolled back into view
                    if (st.isVisible) {
                        this.#updateContainer(el, st.currentVal, st.cachedRadius, st.cachedQuality);
                    }
                }
            });
        }, { rootMargin: '200px' }); // Pre-render before it enters viewport to prevent pop in

        // Monitors DOM changes to auto attach effect to new elements or update existing ones on inline style mutations
        this.mutationObserver = new MutationObserver(list => {
            list.forEach(m => {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(n => n.nodeType === 1 && this.#checkAndAttach(n));
                    m.removedNodes.forEach(n => n.nodeType === 1 && this.#cleanupElement(n));
                } else if (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')) {
                    this.#checkAndAttach(m.target);
                }
            });
        });
        this.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter:['style', 'class'] });
    }

    // Scans DOM immediately on script execution to attach to initial HTML elements
    static #scanInitialDOM() {
        document.querySelectorAll('*').forEach(el => this.#checkAndAttach(el));
    }

    /**
     * Validates an element to check if it possesses `--liquid-backdrop` property, evaluates cached states to prevent redundant redraws
     */
    static #checkAndAttach(el) {
        // Ignore internal engine nodes to prevent infinite mutation loops
        if (el.classList.contains('lb-container') || el.classList.contains('lb-debug') || el.tagName === 'svg') return;
        
        const style = getComputedStyle(el);
        const val = style.getPropertyValue(this.CSS_PROP).trim();
        const currentRadius = style.borderRadius;
        const currentQuality = style.getPropertyValue(this.QUALITY_PROP).trim() || '1';
        const st = this.elements.get(el);

        // If property exists and is valid, evaluate for initialization or update
        if (val && val !== 'none') {
            // Only update if filter string, border-radius, or quality scale has mutated
            if (!st || st.currentVal !== val || st.cachedRadius !== currentRadius || st.cachedQuality !== currentQuality) {
                if (!st) this.#initElement(el, val, currentRadius, currentQuality);
                else this.#updateContainer(el, val, currentRadius, currentQuality);
            }
        } else if (st) {
            // If CSS property was removed, clean up engine attachments
            this.#cleanupElement(el);
        }
    }

    /**
     * Bootstraps internal DOM structure (SVG definition, effect Container, shine overlay) into target element
     */
    static #initElement(el, val, radius, quality) {
        // Ensure parent has a positioning context for absolute children
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.cssText = "position: absolute; width: 0; height: 0; pointer-events: none;";
        
        const container = document.createElement('div');
        container.className = 'lb-container';

        const shine = document.createElement('div');
        shine.className = 'lb-shine';

        el.appendChild(svg);
        el.appendChild(container);
        el.appendChild(shine);

        // Store references in WeakMap for state tracking and cleanup
        this.elements.set(el, { currentVal: val, cachedRadius: radius, cachedQuality: quality, svg, container, shine, isVisible: true });
        this.activeElements.add(el);

        this.resizeObserver.observe(el);
        this.intersectionObserver.observe(el);
        this.#updateContainer(el, val, radius, quality);
    }

    /**
     * Unbinds and removes all generated nodes and trackers for element
     */
    static #cleanupElement(el) {
        if (!this.elements.has(el)) return;
        const st = this.elements.get(el);
        this.resizeObserver.unobserve(el);
        this.intersectionObserver.unobserve(el);
        st.container.remove(); st.svg.remove(); st.shine.remove();
        this.#handleDebug(el, null);
        this.elements.delete(el);
        this.activeElements.delete(el);
    }

    /**
     * Injects overlay div mapping raw Canvas output for visual debugging
     */
    static #handleDebug(el, mapUrl) {
        let ov = el.querySelector('.lb-debug');
        if (ov) ov.remove();
        if (!mapUrl || !this.config.debug) return;
        ov = document.createElement('div');
        ov.className = 'lb-debug';
        ov.style.backgroundImage = `url(${mapUrl})`;
        el.appendChild(ov);
    }

    /**
     * Main execution step: parses CSS value string, invokes custom SDF generation filters and applies native filters to backdrop layer
     */
    static #updateContainer(el, val, radius, quality) {
        const st = this.elements.get(el);
        if (!st) return;

        // Cache current values to avoid redundant redraws on future mutations
        st.currentVal = val;
        st.cachedRadius = radius;
        st.cachedQuality = quality;
        
        const parsed = this.#parse(val);
        let svgHTML = '';
        const filters = [];
        let hasBlur = false;
        let debugMapUrl = null;
        
        // Reset shine styles before processing to clear old procedural gradients
        st.shine.style.background = 'none';
        st.shine.style.boxShadow = 'none';
        st.shine.style.webkitMask = 'none';
        st.shine.style.opacity = '1';

        parsed.forEach(item => {
            if (item.name === 'blur') hasBlur = true;

            // Handle custom procedural 'shine' overlay definition
            if (item.name === 'shine') {
                const [intensity = 0.2, angle = 40, motionOverride = 0] = item.args;
                const motion = this.config.motion || motionOverride === 1;
                
                if (motion) this.#enableMotion();

                // CSS Mask Composite Trick
                st.shine.style.webkitMask = `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`;
                st.shine.style.webkitMaskComposite = 'xor';
                st.shine.style.maskComposite = 'exclude';
                st.shine.style.padding = '1px';
                st.shine.style.boxShadow = `0 0 15px 1px rgba(255, 255, 255, 0.05) inset`;

                // Calculate angle: static vs dynamic CSS variable driven
                const angleStr = motion ? `var(${this.ANGLE_PROP})` : (isNaN(angle) ? angle : `${angle}deg`);
                
                // Define multi layered linear gradients to simulate light reflection and specular falloff
                const gradMain = `linear-gradient(${angleStr}, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.25) 25%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.0) 60%)`;
                const gradSec = `linear-gradient(calc(${angleStr} + 180deg), rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.0) 50%)`;

                st.shine.style.background = `${gradMain}, ${gradSec}`;
                
                // Apply transition logic exclusively to dynamic motion states to interpolate CSS variable
                if (motion) {
                    st.shine.style.opacity = `calc(var(${this.OPACITY_PROP}, 0.5) * ${intensity})`;
                    st.shine.style.transition = `${this.ANGLE_PROP} 0.12s linear, opacity 0.2s ease`;
                } else {
                    st.shine.style.opacity = intensity;
                    st.shine.style.transition = 'none';
                }
                return;
            }

            // Handle custom filter execution
            if (item.type === 'custom') {
                if (this.config.fallback) return;
                const fn = this.filters.get(item.name);
                if (fn) {
                    // Generate unique ID to prevent SVG filter collisions in DOM
                    const id = `lb-${item.name}-${Math.random().toString(36).substr(2, 6)}`;
                    const res = fn(el, radius, quality, ...item.args);
                    if (res) {
                        // Generate SVG <filter> string block and link it via CSS url()
                        // "userSpaceOnUse" ensures coordinates map to element, not entire document
                        svgHTML += `<filter id="${id}" x="0%" y="0%" width="100%" height="100%" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${res.filterStr}</filter>`;
                        filters.push(`url(#${id})`);
                        if (res.mapUrl) debugMapUrl = res.mapUrl;
                    }
                }
            } else {
                // Standard CSS filters (brightness, saturate) are appended directly to filter chain
                filters.push(item.raw);
            }
        });

        // Enforce a base blur in fallback mode if none is explicitly defined
        if (this.config.fallback && !hasBlur) {
            filters.push('blur(4px)');
        }

        this.#handleDebug(el, debugMapUrl);

        // Inject generated SVG block into hidden SVG node and apply finalized CSS backdrop-filter string
        st.svg.innerHTML = svgHTML;
        const finalFilter = filters.join(' ');
        if (finalFilter.trim()) {
            st.container.style.backdropFilter = finalFilter;
            st.container.style.webkitBackdropFilter = finalFilter;
        }
    }

    /**
     * Utility Regex parser converting raw CSS value string into structured tokens
     */
    static #parse(str) {
        const tokens = [];
        const re = /(\w+(?:-\w+)*)\s*\(([^)]*)\)/g;
        let m;
        while ((m = re.exec(str)) !== null) {
            const name = m[1];
            if (this.filters.has(name) || name === 'shine') {
                const args = m[2] ? m[2].split(',').map(s => parseFloat(s.trim()) || s.trim()) : [];
                tokens.push({ type: 'custom', name, args, raw: m[0] });
            } else {
                tokens.push({ type: 'css', name, raw: m[0] });
            }
        }
        return tokens;
    }

    /**
     * Resolves border-radius strings (px or %) into normalized math radius value
     */
    static #parseRadius(radiusStr, w, h) {
        let val = parseFloat(radiusStr) || 0;
        if (radiusStr && radiusStr.includes('%')) {
            val = (parseFloat(radiusStr) / 100) * Math.min(w, h);
        }
        return Math.min(val, w/2, h/2);
    }

    /**
     * Core registration of actual 'liquid-glass' calculation engine
     * Generates 2D Signed Distance Field matrix to compute physical refraction and lens distortion
     */
    static #registerCore() {
        this.filters.set('liquid-glass', (element, radiusStr, qualityStr, refVal = 25, bevVal = 15, chrVal = 0, magVal = 0) => {
            const w = Math.round(element.offsetWidth);
            const h = Math.round(element.offsetHeight);
            if (w < 1 || h < 1) return null;
            
            // Parse quality string to a float; default to 1.0 if invalid
            let q = parseFloat(qualityStr);
            if (isNaN(q)) q = 1.0;
            // Clamp scaling factor to ensure it doesn't break rendering (min 0.1, max 1.0)
            const scaleFac = Math.max(0.1, Math.min(1.0, q));
            
            // Calculate internal canvas dimensions scaled by quality factor, reducing matrix loop iterations for performance gains on large panels
            // When scaled down, engine relies on GPU hardware bilinear upscaling inside browser compositor
            const cw = Math.max(1, Math.round(w * scaleFac));
            const ch = Math.max(1, Math.round(h * scaleFac));
            const cbr = this.#parseRadius(radiusStr, w, h) * scaleFac;
            
            // Initialize an off-screen HTML5 Canvas to compute Signed Distance Field
            const cvs = document.createElement('canvas');
            cvs.width = cw; cvs.height = ch;
            const ctx = cvs.getContext('2d'), d = ctx.createImageData(cw, ch).data;
            const cx = cw/2, cy = ch/2, bx = cx-cbr, by = cy-cbr;
            const limit = Math.max(1, bevVal * scaleFac), magS = Math.max(-1.5, Math.min(1.5, magVal)) * 0.75;
            
            const aaWidth = 1.0; // Defines sub-pixel boundary width for anti-aliasing channel

            // Matrix loop iterating over every scaled pixel to compute exact physical boundaries and refraction vectors
            for (let y = 0; y < ch; y++) {
                for (let x = 0; x < cw; x++) {
                    const idx = (y * cw + x) * 4, nxG = (x-cx)/cx, nyG = (y-cy)/cy;
                    
                    // Core SDF Mathematics:
                    // px, py: current pixel coordinates shifted relative to absolute center of canvas
                    // dx, dy: horizontal/vertical distances from pixel to border of inner "flat" core rectangle
                    //         (excluding rounded corner regions defined by 'cbr')
                    // qx, qy: clamp negative distances to 0 to exclusively isolate pixels located in outer quadrant corner regions
                    const px = x-cx, py = y-cy, dx = Math.abs(px)-bx, dy = Math.abs(py)-by;
                    const qx = dx>0?dx:0, qy = dy>0?dy:0;
                    
                    // Calculate 2D Signed Distance Field (SDF) value
                    // Computes exact geometric distance from current pixel (px, py) to rounded rectangle boundary
                    // Math.sqrt(qx*qx + qy*qy) computes Euclidean distance for pixels in external corner zones
                    // Math.min(Math.max(dx, dy), 0) handles internal pixels, giving a negative value equal to distance from nearest edge
                    // dSurf < 0: inside container shape
                    // dSurf > 0: outside container shape
                    // dSurf = 0: exactly on geometric boundary path
                    const dSurf = (Math.sqrt(qx*qx + qy*qy) + Math.min(Math.max(dx, dy), 0)) - cbr;

                    // Magnification (Convex Lens) logic: shifts UV coordinates relative to element center
                    let magMultiplier = 1.0;
                    if (magS < 0) {
                        // Implement a Spherical Dome Lens model for negative magnify to prevent hard edge clipping
                        // Maps normalized SDF depth [0, 1] through a sine wave to smooth transition magnification back to 1.0 at borders
                        let maxDepth = Math.min(cx, cy);
                        let normDepth = dSurf < 0 ? Math.max(0, Math.min(1, -dSurf / maxDepth)) : 0;
                        magMultiplier = Math.sin(normDepth * Math.PI / 2);
                    }
                    
                    let offX = -nxG * magS * magMultiplier;
                    let offY = -nyG * magS * magMultiplier;

                    // 127, 127 is neutral center of SVG Displacement map (representing zero UV shift, mapped from -1 to 1)
                    let finalDispX = 127;
                    let finalDispY = 127;
                    let alpha = 0;

                    if (dSurf < aaWidth) {
                        // Mathematical anti-aliasing logic inside Alpha channel
                        // Implements Hermite interpolation (Smoothstep cubic spline) to fade edge pixels without jagged aliasing:
                        // smoothstep: t_smooth = t * t * (3 - 2 * t)
                        if (dSurf <= -aaWidth) {
                            alpha = 255;
                        } else {
                            const t = 1.0 - ((dSurf + aaWidth) / (2 * aaWidth));
                            const val = t * t * (3 - 2 * t);
                            alpha = Math.floor(val * 255);
                        }

                        // Calculate Bevel refraction if pixel is within bevel 'limit' distance from edge
                        if (alpha > 0 && dSurf >= -limit) {
                            const prog = 1 - (Math.abs(dSurf)/limit);
                            // Apply spherical curve equation to simulate curved glass surface:
                            // z(x) = sqrt(R^2 - x^2) -> mapped to [0, 1] as: 1 - sqrt(1 - x^2)
                            const curve = (prog>=1) ? 1 : (prog<=0 ? 0 : 1 - Math.sqrt(1 - prog*prog));
                            let nx=0, ny=0;
                            
                            // Determine surface normal vector based on regional quadrant (corners vs straight edges)
                            // Corners: normalize vector originating from corner circle center to current pixel
                            // Edges: set a direct unit normal vector pointing straight outward (-1 or 1)
                            if (px>bx && py>by) { nx=px-bx; ny=py-by; }
                            else if (px<-bx && py>by) { nx=px+bx; ny=py-by; }
                            else if (px>bx && py<-by) { nx=px-bx; ny=py+by; }
                            else if (px<-bx && py<-by) { nx=px+bx; ny=py+by; }
                            else { if (dx>dy) { nx=px>0?1:-1; } else { ny=py>0?1:-1; } }
                            const len = Math.sqrt(nx*nx + ny*ny)||1;
                            
                            // Apply calculated normal shift to UV offset
                            offX -= (nx/len)*curve; offY -= (ny/len)*curve;
                        }

                        // Map standard -1 to 1 displacement offset to 0-255 RGB space expected by SVG engine
                        finalDispX = 127 + offX*127;
                        finalDispY = 127 + offY*127;
                    }

                    // Write computed displacement values to Red and Blue channels
                    d[idx] = Math.max(0, Math.min(255, finalDispX)); // X Displacement (Mapped to Red)
                    d[idx+1] = 0; // Green channel unused
                    d[idx+2] = Math.max(0, Math.min(255, finalDispY)); // Y Displacement (Mapped to Blue)
                    d[idx+3] = alpha; // Edge masking (Anti-aliasing data in Alpha channel)
                }
            }
            // Push processed pixel matrix to canvas
            ctx.putImageData(new ImageData(d, cw, ch), 0, 0);

            // Convert canvas output to a Base64 data URL for SVG reference
            const mapUrl = cvs.toDataURL(), scale = refVal * 2;
            let filterStr = '';
            
            // Generate standard SVG FeDisplacementMap node block
            if (chrVal === 0) {
                filterStr = `<feImage result="MAP" href="${mapUrl}" width="${w}" height="${h}" preserveAspectRatio="none" />
                        <feDisplacementMap in="SourceGraphic" in2="MAP" scale="${scale}" xChannelSelector="R" yChannelSelector="B"/>`;
            } else {
                // Chromatic Aberration pipeline with single-pass optimization
                const rS = scale + (chrVal * 2), bS = Math.max(0, scale - (chrVal * 2));
                filterStr = `<feImage result="MAP" href="${mapUrl}" width="${w}" height="${h}" preserveAspectRatio="none" />
                    <feDisplacementMap in="SourceGraphic" in2="MAP" scale="${rS}" xChannelSelector="R" yChannelSelector="B" result="RD"/>
                    <feComponentTransfer in="RD" result="RL"><feFuncR type="identity"/><feFuncG type="discrete" tableValues="0"/><feFuncB type="discrete" tableValues="0"/><feFuncA type="identity"/></feComponentTransfer>
                    <feDisplacementMap in="SourceGraphic" in2="MAP" scale="${scale}" xChannelSelector="R" yChannelSelector="B" result="GD"/>
                    <feComponentTransfer in="GD" result="GL"><feFuncR type="discrete" tableValues="0"/><feFuncG type="identity"/><feFuncB type="discrete" tableValues="0"/><feFuncA type="identity"/></feComponentTransfer>
                    <feDisplacementMap in="SourceGraphic" in2="MAP" scale="${bS}" xChannelSelector="R" yChannelSelector="B" result="BD"/>
                    <feComponentTransfer in="BD" result="BL"><feFuncR type="discrete" tableValues="0"/><feFuncG type="discrete" tableValues="0"/><feFuncB type="identity"/><feFuncA type="identity"/></feComponentTransfer>
                    <feComposite in="RL" in2="GL" operator="arithmetic" k2="1" k3="1" result="RG"/><feComposite in="RG" in2="BL" operator="arithmetic" k2="1" k3="1"/>`;
            }

            return { filterStr, mapUrl };
        });
    }
}