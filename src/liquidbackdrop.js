/**
 * LiquidBackdrop Engine v0.8.0
 * Update: Render Modes, Core Improvements & Sandbox Overhaul 
 * 
 * @author AngryMark
 * @license MIT
 */

const CORE_CSS = `
:root { --lb-angle: 165deg; --lb-opacity: 0.5; }
.lb-container { position: absolute; inset: 0; pointer-events: none; z-index: -1; overflow: hidden; border-radius: inherit; background: transparent; }
.lb-shine { position: absolute; inset: 0; pointer-events: none; z-index: 2; border-radius: inherit; overflow: hidden; will-change: opacity, mask-image; opacity: 0; }
.lb-debug { position: absolute; inset: 0; z-index: 10000; opacity: 0.8; pointer-events: none; border: 2px solid rgba(255, 0, 0, 0.5); background-size: 100% 100%; border-radius: inherit; }
`;

export default class LiquidBackdrop {
    static elements = new WeakMap();
    static activeElements = new Set();
    static filters = new Map();
    static running = false;
    
    static config = {
        fallback: false,
        debug: false,
        performance: false,
        motion: false
    };
    
    static resizeObserver = null;
    static mutationObserver = null;
    static intersectionObserver = null;

    static CSS_PROP = '--liquid-backdrop';
    static ANGLE_PROP = '--lb-angle';
    static OPACITY_PROP = '--lb-opacity';

    static motionActive = false;
    static targetBeta = 0;
    static targetGamma = 0;
    static currentBeta = 0;
    static currentGamma = 0;

    static start() {
        if (this.running) return;
        this.running = true;
        console.log('💧 LiquidBackdrop v0.8.0 Started');

        if (!document.getElementById('liquid-backdrop-css')) {
            const style = document.createElement('style');
            style.id = 'liquid-backdrop-css';
            style.textContent = CORE_CSS;
            document.head.prepend(style);
        }

        if ('CSS' in window && 'registerProperty' in CSS) {
            try {
                CSS.registerProperty({ name: this.CSS_PROP, syntax: '*', inherits: false, initialValue: '' });
                CSS.registerProperty({ name: this.ANGLE_PROP, syntax: '<angle>', inherits: true, initialValue: '165deg' });
            } catch (e) {}
        }

        this.#registerCore();
        this.#setupObservers();
        this.#scanInitialDOM();
    }

    static setFallback(val) { this.config.fallback = !!val; this.#forceUpdateAll(); }
    static setDebug(val) { this.config.debug = !!val; this.#forceUpdateAll(); }
    static setPerformance(val) { this.config.performance = !!val; this.#forceUpdateAll(); }
    static setMotion(val) { 
        this.config.motion = !!val; 
        if (val) this.#enableMotion(); 
        this.#forceUpdateAll(); 
    }

    static #forceUpdateAll() {
        this.activeElements.forEach(el => {
            const st = this.elements.get(el);
            if (st && st.isVisible) {
                const currentRadius = getComputedStyle(el).borderRadius;
                this.#updateContainer(el, st.currentVal, currentRadius);
            }
        });
    }

    static #enableMotion() {
        if (this.motionActive) return;
        
        const handler = (e) => {
            if (e.beta === null) return;
            this.targetBeta = e.beta;
            this.targetGamma = e.gamma;
        };

        const loop = () => {
            const k = 0.15;
            this.currentBeta += (this.targetBeta - this.currentBeta) * k;
            this.currentGamma += (this.targetGamma - this.currentGamma) * k;

            const mag = Math.sqrt(this.currentBeta**2 + this.currentGamma**2);
            if (mag > 2.0) {
                const rad = Math.atan2(this.currentGamma, this.currentBeta);
                const deg = -(rad * (180 / Math.PI)) + 180;
                document.documentElement.style.setProperty(this.ANGLE_PROP, `${deg}deg`);
                
                const op = 0.5 + (Math.min(mag, 50) / 50) * 0.4;
                document.documentElement.style.setProperty(this.OPACITY_PROP, op.toFixed(2));
            }
            requestAnimationFrame(loop);
        };

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
            document.body.addEventListener('click', req, { capture: true, once: true });
        } else {
            window.addEventListener('deviceorientation', handler);
            this.motionActive = true;
            loop();
        }
    }

    static #setupObservers() {
        this.resizeObserver = new ResizeObserver(entries => {
            requestAnimationFrame(() => {
                for (const entry of entries) {
                    const el = entry.target;
                    const st = this.elements.get(el);
                    if (st && st.isVisible) {
                        const currentRadius = getComputedStyle(el).borderRadius;
                        this.#updateContainer(el, st.currentVal, currentRadius);
                    }
                }
            });
        });

        this.intersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const el = entry.target;
                const st = this.elements.get(el);
                if (st) {
                    st.isVisible = entry.isIntersecting;
                    if (st.isVisible) {
                        this.#updateContainer(el, st.currentVal, st.cachedRadius);
                    }
                }
            });
        }, { rootMargin: '200px' });

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

    static #scanInitialDOM() {
        document.querySelectorAll('*').forEach(el => this.#checkAndAttach(el));
    }

    static #checkAndAttach(el) {
        if (el.classList.contains('lb-container') || el.classList.contains('lb-debug') || el.tagName === 'svg') return;
        
        const style = getComputedStyle(el);
        const val = style.getPropertyValue(this.CSS_PROP).trim();
        const currentRadius = style.borderRadius;
        const st = this.elements.get(el);

        if (val && val !== 'none') {
            if (!st || st.currentVal !== val || st.cachedRadius !== currentRadius) {
                if (!st) this.#initElement(el, val, currentRadius);
                else this.#updateContainer(el, val, currentRadius);
            }
        } else if (st) {
            this.#cleanupElement(el);
        }
    }

    static #initElement(el, val, radius) {
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

        this.elements.set(el, { currentVal: val, cachedRadius: radius, svg, container, shine, isVisible: true });
        this.activeElements.add(el);

        this.resizeObserver.observe(el);
        this.intersectionObserver.observe(el);
        this.#updateContainer(el, val, radius);
    }

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

    static #handleDebug(el, mapUrl) {
        let ov = el.querySelector('.lb-debug');
        if (ov) ov.remove();
        if (!mapUrl || !this.config.debug) return;
        ov = document.createElement('div');
        ov.className = 'lb-debug';
        ov.style.backgroundImage = `url(${mapUrl})`;
        el.appendChild(ov);
    }

    static #updateContainer(el, val, radius) {
        const st = this.elements.get(el);
        if (!st) return;

        st.currentVal = val;
        st.cachedRadius = radius;
        const parsed = this.#parse(val);
        
        let svgHTML = '';
        const filters =[];
        let hasBlur = false;
        let debugMapUrl = null;
        
        st.shine.style.background = 'none';
        st.shine.style.boxShadow = 'none';
        st.shine.style.webkitMask = 'none';
        st.shine.style.opacity = '1';

        parsed.forEach(item => {
            if (item.name === 'blur') hasBlur = true;

            if (item.name === 'shine') {
                const[intensity = 0.2, angle = 40, motionOverride = 0] = item.args;
                const motion = this.config.motion || motionOverride === 1;
                
                if (motion) this.#enableMotion();

                st.shine.style.webkitMask = `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`;
                st.shine.style.webkitMaskComposite = 'xor';
                st.shine.style.maskComposite = 'exclude';
                st.shine.style.padding = '1px';
                st.shine.style.boxShadow = `0 0 15px 1px rgba(255, 255, 255, 0.05) inset`;

                const angleStr = motion ? `var(${this.ANGLE_PROP})` : (isNaN(angle) ? angle : `${angle}deg`);
                const gradMain = `linear-gradient(${angleStr}, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.25) 25%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.0) 60%)`;
                const gradSec = `linear-gradient(calc(${angleStr} + 180deg), rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.0) 50%)`;

                st.shine.style.background = `${gradMain}, ${gradSec}`;
                
                if (motion) {
                    st.shine.style.opacity = `calc(var(${this.OPACITY_PROP}, 0.5) * ${intensity})`;
                    st.shine.style.transition = `${this.ANGLE_PROP} 0.12s linear, opacity 0.2s ease`;
                } else {
                    st.shine.style.opacity = intensity;
                    st.shine.style.transition = 'none';
                }
                return;
            }

            if (item.type === 'custom') {
                if (this.config.fallback) return;
                const fn = this.filters.get(item.name);
                if (fn) {
                    const id = `lb-${item.name}-${Math.random().toString(36).substr(2, 6)}`;
                    const res = fn(el, radius, ...item.args);
                    if (res) {
                        svgHTML += `<filter id="${id}" x="0%" y="0%" width="100%" height="100%" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${res.filterStr}</filter>`;
                        filters.push(`url(#${id})`);
                        if (res.mapUrl) debugMapUrl = res.mapUrl;
                    }
                }
            } else {
                filters.push(item.raw);
            }
        });

        if (this.config.fallback && !hasBlur) {
            filters.push('blur(4px)');
        }

        this.#handleDebug(el, debugMapUrl);

        st.svg.innerHTML = svgHTML;
        const finalFilter = filters.join(' ');
        if (finalFilter.trim()) {
            st.container.style.backdropFilter = finalFilter;
            st.container.style.webkitBackdropFilter = finalFilter;
        }
    }

    static #parse(str) {
        const tokens = [];
        const re = /(\w+(?:-\w+)*)\s*\(([^)]*)\)/g;
        let m;
        while ((m = re.exec(str)) !== null) {
            const name = m[1];
            if (this.filters.has(name) || name === 'shine') {
                const args = m[2] ? m[2].split(',').map(s => parseFloat(s.trim()) || s.trim()) :[];
                tokens.push({ type: 'custom', name, args, raw: m[0] });
            } else {
                tokens.push({ type: 'css', name, raw: m[0] });
            }
        }
        return tokens;
    }

    static #parseRadius(radiusStr, w, h) {
        let val = parseFloat(radiusStr) || 0;
        if (radiusStr && radiusStr.includes('%')) {
            val = (parseFloat(radiusStr) / 100) * Math.min(w, h);
        }
        return Math.min(val, w/2, h/2);
    }

    static #registerCore() {
        this.filters.set('liquid-glass', (element, radiusStr, refVal = 25, bevVal = 15, chrVal = 0, magVal = 0) => {
            const w = Math.round(element.offsetWidth);
            const h = Math.round(element.offsetHeight);
            if (w < 1 || h < 1) return null;
            
            const scaleFac = this.config.performance ? 0.70 : 1.0;
            const cw = Math.max(1, Math.round(w * scaleFac));
            const ch = Math.max(1, Math.round(h * scaleFac));
            const cbr = this.#parseRadius(radiusStr, w, h) * scaleFac;
            
            const cvs = document.createElement('canvas');
            cvs.width = cw; cvs.height = ch;
            const ctx = cvs.getContext('2d'), d = ctx.createImageData(cw, ch).data;
            const cx = cw/2, cy = ch/2, bx = cx-cbr, by = cy-cbr;
            const limit = Math.max(1, bevVal * scaleFac), magS = Math.max(-1.5, Math.min(1.5, magVal)) * 0.75;
            
            const aaWidth = 1.0; 

            for (let y = 0; y < ch; y++) {
                for (let x = 0; x < cw; x++) {
                    const idx = (y * cw + x) * 4, nxG = (x-cx)/cx, nyG = (y-cy)/cy;
                    
                    const px = x-cx, py = y-cy, dx = Math.abs(px)-bx, dy = Math.abs(py)-by;
                    const qx = dx>0?dx:0, qy = dy>0?dy:0;
                    
                    const dSurf = (Math.sqrt(qx*qx + qy*qy) + Math.min(Math.max(dx, dy), 0)) - cbr;

                    let magMultiplier = 1.0;
                    if (magS < 0) {
                        let maxDepth = Math.min(cx, cy);
                        let normDepth = dSurf < 0 ? Math.max(0, Math.min(1, -dSurf / maxDepth)) : 0;
                        magMultiplier = Math.sin(normDepth * Math.PI / 2);
                    }
                    
                    let offX = -nxG * magS * magMultiplier;
                    let offY = -nyG * magS * magMultiplier;

                    let finalDispX = 127;
                    let finalDispY = 127;
                    let alpha = 0;

                    if (dSurf < aaWidth) {
                        if (dSurf <= -aaWidth) {
                            alpha = 255;
                        } else {
                            const t = 1.0 - ((dSurf + aaWidth) / (2 * aaWidth));
                            const val = t * t * (3 - 2 * t);
                            alpha = Math.floor(val * 255);
                        }

                        if (alpha > 0 && dSurf >= -limit) {
                            const prog = 1 - (Math.abs(dSurf)/limit);
                            const curve = (prog>=1) ? 1 : (prog<=0 ? 0 : 1 - Math.sqrt(1 - prog*prog));
                            let nx=0, ny=0;
                            if (px>bx && py>by) { nx=px-bx; ny=py-by; }
                            else if (px<-bx && py>by) { nx=px+bx; ny=py-by; }
                            else if (px>bx && py<-by) { nx=px-bx; ny=py+by; }
                            else if (px<-bx && py<-by) { nx=px+bx; ny=py+by; }
                            else { if (dx>dy) { nx=px>0?1:-1; } else { ny=py>0?1:-1; } }
                            const len = Math.sqrt(nx*nx + ny*ny)||1;
                            offX -= (nx/len)*curve; offY -= (ny/len)*curve;
                        }

                        finalDispX = 127 + offX*127;
                        finalDispY = 127 + offY*127;
                    }

                    d[idx] = Math.max(0, Math.min(255, finalDispX));
                    d[idx+1] = 0;
                    d[idx+2] = Math.max(0, Math.min(255, finalDispY));
                    d[idx+3] = alpha;
                }
            }
            ctx.putImageData(new ImageData(d, cw, ch), 0, 0);

            const mapUrl = cvs.toDataURL(), scale = refVal * 2;
            let filterStr = '';
            
            if (chrVal === 0) {
                filterStr = `<feImage result="MAP" href="${mapUrl}" width="${w}" height="${h}" preserveAspectRatio="none" />
                        <feDisplacementMap in="SourceGraphic" in2="MAP" scale="${scale}" xChannelSelector="R" yChannelSelector="B"/>`;
            } else {
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