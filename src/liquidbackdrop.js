/**
 * LiquidBackdrop Engine v0.5.0
 * Render update: Single-pass chromatic aberration, SDF Magnification, Dynamic Border Radius.
 * 
 * @author AngryMark
 * @license MIT
 */

export default class LiquidBackdrop {
    static elements = new WeakMap();
    static filters = new Map();
    static running = false;
    
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
        console.log('💧 LiquidBackdrop v0.5.0 (Endgame Liquid Glass) Started');

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

    static #enableMotion() {
        if (this.motionActive) return;
        
        const handler = (e) => {
            if (e.beta === null) return;
            this.targetBeta = e.beta;
            this.targetGamma = e.gamma;
        };

        const loop = () => {
            const k = 0.08;
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
                } else if (m.type === 'attributes' && m.attributeName === 'style') {
                    this.#checkAndAttach(m.target);
                }
            });
        });
        this.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }

    static #scanInitialDOM() {
        document.querySelectorAll('*').forEach(el => this.#checkAndAttach(el));
    }

    static #checkAndAttach(el) {
        if (el.classList.contains('lb-container') || el.tagName === 'svg') return;
        
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
        container.style.cssText = "position: absolute; inset: 0; background: transparent; pointer-events: none; z-index: -1; overflow: hidden; border-radius: inherit;";

        const shine = document.createElement('div');
        shine.className = 'lb-shine';
        shine.style.cssText = "position: absolute; inset: 0; pointer-events: none; z-index: 2; border-radius: inherit; overflow: hidden; will-change: opacity, mask-image;";

        el.appendChild(svg);
        el.appendChild(container);
        el.appendChild(shine);

        this.elements.set(el, { currentVal: val, cachedRadius: radius, svg, container, shine, isVisible: true });

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
        this.elements.delete(el);
    }

    static #updateContainer(el, val, radius) {
        const st = this.elements.get(el);
        if (!st) return;

        st.currentVal = val;
        st.cachedRadius = radius;
        const parsed = this.#parse(val);
        
        let svgHTML = '';
        const filters =[];
        
        st.shine.style.background = 'none';
        st.shine.style.boxShadow = 'none';
        st.shine.style.webkitMask = 'none';
        st.shine.style.opacity = '1';

        parsed.forEach(item => {
            if (item.name === 'shine') {
                const[intensity = 0.2, angle = 40, motion = 0] = item.args;
                
                if (motion === 1) this.#enableMotion();

                st.shine.style.webkitMask = `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`;
                st.shine.style.webkitMaskComposite = 'xor';
                st.shine.style.maskComposite = 'exclude';
                st.shine.style.padding = '1px';
                st.shine.style.boxShadow = `0 0 15px 1px rgba(255, 255, 255, 0.05) inset`;

                const angleStr = (motion === 1) ? `var(${this.ANGLE_PROP})` : `${angle}deg`;
                const gradMain = `linear-gradient(${angleStr}, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.25) 25%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.0) 60%)`;
                const gradSec = `linear-gradient(calc(${angleStr} + 180deg), rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.0) 50%)`;

                st.shine.style.background = `${gradMain}, ${gradSec}`;
                
                if (motion === 1) {
                    st.shine.style.opacity = `calc(var(${this.OPACITY_PROP}, 0.5) * ${intensity})`;
                    st.shine.style.transition = `${this.ANGLE_PROP} 0.3s linear, opacity 0.6s ease`;
                } else {
                    st.shine.style.opacity = intensity;
                    st.shine.style.transition = 'none';
                }
                return;
            }

            if (item.type === 'custom') {
                const fn = this.filters.get(item.name);
                if (fn) {
                    const id = `lb-${item.name}-${Math.random().toString(36).substr(2, 6)}`;
                    const content = fn(el, radius, ...item.args);
                    if (content) {
                        svgHTML += `<filter id="${id}" x="0%" y="0%" width="100%" height="100%" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${content}</filter>`;
                        filters.push(`url(#${id})`);
                    }
                }
            } else {
                filters.push(item.raw);
            }
        });

        st.svg.innerHTML = svgHTML;
        const finalFilter = filters.join(' ');
        if (finalFilter.trim()) {
            st.container.style.backdropFilter = finalFilter;
            st.container.style.webkitBackdropFilter = finalFilter;
        }
    }

    static #parse(str) {
        const tokens =[];
        const re = /(\w+(?:-\w+)*)\s*\(([^)]*)\)/g;
        let m;
        while ((m = re.exec(str)) !== null) {
            const name = m[1];
            if (this.filters.has(name) || name === 'shine') {
                const args = m[2] ? m[2].split(',').map(s => parseFloat(s.trim()) || s.trim()) :[];
                tokens.push({ type: 'custom', name, args });
            } else {
                tokens.push({ type: 'css', raw: m[0] });
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
            const w = Math.round(element.offsetWidth), h = Math.round(element.offsetHeight);
            if (w < 1 || h < 1) return '';
            
            const br = this.#parseRadius(radiusStr, w, h);
            
            const cvs = document.createElement('canvas');
            cvs.width = w; cvs.height = h;
            const ctx = cvs.getContext('2d'), d = ctx.createImageData(w, h).data;
            const cx = w/2, cy = h/2, bx = cx-br, by = cy-br;
            const limit = Math.max(1, bevVal), magS = Math.max(-1.5, Math.min(1.5, magVal)) * 0.75;
            
            const aaWidth = 1.0; 

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4, nxG = (x-cx)/cx, nyG = (y-cy)/cy;
                    
                    let offX = -nxG * magS, offY = -nyG * magS;
                    
                    const px = x-cx, py = y-cy, dx = Math.abs(px)-bx, dy = Math.abs(py)-by;
                    const qx = dx>0?dx:0, qy = dy>0?dy:0;
                    
                    const dSurf = (Math.sqrt(qx*qx + qy*qy) + Math.min(Math.max(dx, dy), 0)) - br;

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
            ctx.putImageData(new ImageData(d, w, h), 0, 0);

            const mapUrl = cvs.toDataURL(), scale = refVal * 2;
            
            if (chrVal === 0) {
                return `<feImage result="MAP" href="${mapUrl}" width="${w}" height="${h}" />
                        <feDisplacementMap in="SourceGraphic" in2="MAP" scale="${scale}" xChannelSelector="R" yChannelSelector="B"/>`;
            } else {
                const rS = scale + (chrVal * 2), bS = Math.max(0, scale - (chrVal * 2));
                return `<feImage result="MAP" href="${mapUrl}" width="${w}" height="${h}" />
                    <feDisplacementMap in="SourceGraphic" in2="MAP" scale="${rS}" xChannelSelector="R" yChannelSelector="B" result="RD"/>
                    <feComponentTransfer in="RD" result="RL"><feFuncR type="identity"/><feFuncG type="discrete" tableValues="0"/><feFuncB type="discrete" tableValues="0"/><feFuncA type="identity"/></feComponentTransfer>
                    <feDisplacementMap in="SourceGraphic" in2="MAP" scale="${scale}" xChannelSelector="R" yChannelSelector="B" result="GD"/>
                    <feComponentTransfer in="GD" result="GL"><feFuncR type="discrete" tableValues="0"/><feFuncG type="identity"/><feFuncB type="discrete" tableValues="0"/><feFuncA type="identity"/></feComponentTransfer>
                    <feDisplacementMap in="SourceGraphic" in2="MAP" scale="${bS}" xChannelSelector="R" yChannelSelector="B" result="BD"/>
                    <feComponentTransfer in="BD" result="BL"><feFuncR type="discrete" tableValues="0"/><feFuncG type="discrete" tableValues="0"/><feFuncB type="identity"/><feFuncA type="identity"/></feComponentTransfer>
                    <feComposite in="RL" in2="GL" operator="arithmetic" k2="1" k3="1" result="RG"/><feComposite in="RG" in2="BL" operator="arithmetic" k2="1" k3="1"/>`;
            }
        });
    }
}