/**
 * LiquidToggle Component v1.0.0
 * 
 * @author AngryMark
 * @license MIT
 */

import LiquidBackdrop from '../liquidbackdrop.js';
import { Spring } from '../liquidphysics.js';

/**
 * Helper function to parse standard CSS HEX colors into RGBA arrays
 * Required since physics engine interpolates (lerps) color values frame by frame by math
 * @param {string} hex - color string
 * @param {Array} fallback - RGBA array if parsing fails
 * @returns {Array} array representing [R, G, B, A]
 */
function parseHexColor(hex, fallback) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return fallback;
    let cleanHex = hex.slice(1);
    if (cleanHex.length === 3) cleanHex = cleanHex.split('').map(c => c + c).join('');
    if (cleanHex.length === 6) cleanHex += 'ff'; // Default alpha to 100% if omitted
    if (cleanHex.length === 8) {
        const r = parseInt(cleanHex.slice(0, 2), 16);
        const g = parseInt(cleanHex.slice(2, 4), 16);
        const b = parseInt(cleanHex.slice(4, 6), 16);
        const a = parseInt(cleanHex.slice(6, 8), 16) / 255;
        if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return fallback;
        return [r, g, b, a];
    }
    return fallback;
}

// Base shadow DOM styles encapsulating component layout and internal LiquidBackdrop rules
const COMPONENT_STYLES = `
    /* Host acts as custom element boundary */
    :host {
        display: block; position: relative;
        width: 100px; height: 50px;
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        touch-action: none; overflow: visible; box-sizing: border-box; user-select: none;
    }

    .track {
        position: absolute; inset: 0;
        background-color: rgba(120, 120, 128, 0.36);
        border-radius: 999px;
    }

    .thumb {
        position: absolute; background-color: #ffffff;
        border-radius: 999px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        transform-origin: center center; will-change: transform, background-color;
        z-index: 20; user-drag: none; -webkit-user-drag: none;
        /* Custom property applying LiquidBackdrop filter dynamically to inner thumb */
        /* Because Shadow DOM encapsulates styles, LiquidBackdrop needs to explicitly observe this element */
        --liquid-backdrop: liquid-glass(15, 8, 1, -0.5);
    }

    /* Core internal layers required by LiquidBackdrop Engine for refraction mapping */
    .lb-container { position: absolute; inset: 0; pointer-events: none; z-index: -1; overflow: hidden; border-radius: inherit; background: transparent; opacity: 0; transition: opacity 0.1s; }
    .lb-shine { position: absolute; inset: 0; pointer-events: none; z-index: 2; border-radius: inherit; overflow: hidden; opacity: 0; will-change: opacity, mask-image; }
    
    .lb-debug { position: absolute; inset: 0; z-index: 10000; opacity: 0.8; pointer-events: none; border: 2px solid rgba(255, 0, 0, 0.5); background-size: 100% 100%; border-radius: inherit; }
`;

export default class LiquidToggle extends HTMLElement {
    constructor() {
        super();
        // Attach Shadow DOM to encapsulate styles and prevent external CSS leakage
        this.attachShadow({ mode: 'open' });

        // Initialize internal Spring physics engine driving the slide motion and deformation
        this.motionSpring = new Spring({ stiffness: 0.08, damping: 0.75 });
        this.isOn = false;
        this.pressProgress = 0; // Tracks visual "flattening" when pressed
        this.clickEffectActive = false;

        // Interaction state tracking for dragging gestures
        this.activePointerId = null;
        this.dragStartX = 0;
        this.dragStartVal = 0;
        this.dragMaxDist = 0; 
        this.rafId = null;

        // Dimension metrics calculated on resize to support responsive instances
        this.metrics = { padding: 3, maxTravel: 1 };
        
        // Default hex color values converted to RGBA arrays
        this.colorOff = [120, 120, 128, 0.36];
        this.colorOn = [48, 209, 88, 1];

        // Bind event handlers to maintain correct class context inside event listeners
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handlePointerCancel = this.handlePointerCancel.bind(this);
    }

    // Called automatically when component is inserted into DOM
    connectedCallback() {
        this.render();
        this.track = this.shadowRoot.querySelector('.track');
        this.thumb = this.shadowRoot.querySelector('.thumb');

        // Attach modern Pointer Events for mouse and touch tracking
        this.addEventListener('pointerdown', this.handlePointerDown);
        this.addEventListener('pointermove', this.handlePointerMove);
        this.addEventListener('pointerup', this.handlePointerUp);
        
        // Handle edge cases where browser interrupts interaction
        this.addEventListener('pointercancel', this.handlePointerCancel);
        this.addEventListener('lostpointercapture', this.handlePointerCancel);
        
        // Prevent default HTML drag API behavior
        this.addEventListener('dragstart', (e) => e.preventDefault());

        // Defer initial layout calculation to ensure dimensions are fully computed by browser renderer
        requestAnimationFrame(() => {
            this.calculateLayout();
            // Instruct core engine to explicitly observe this shadow-dom embedded element, 
            // since the global MutationObserver cannot go inside of shadow boundaries
            LiquidBackdrop.observe(this.thumb);
            if (this.thumb) this.startLoop(); 
        });
        
        // Setup ResizeObserver to adapt internal dimensions and travel distances if inline styles change
        this.resizeObserver = new ResizeObserver(() => {
            this.calculateLayout();
            this.startLoop();
        });
        this.resizeObserver.observe(this);
    }

    // Lifecycle hook for cleanup to prevent memory leaks when element is removed
    disconnectedCallback() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        cancelAnimationFrame(this.rafId);
        this.removeEventListener('pointerdown', this.handlePointerDown);
        this.removeEventListener('pointermove', this.handlePointerMove);
        this.removeEventListener('pointerup', this.handlePointerUp);
        this.removeEventListener('pointercancel', this.handlePointerCancel);
        this.removeEventListener('lostpointercapture', this.handlePointerCancel);
    }

    // Expose specific HTML attributes to browser Mutation APIs
    static get observedAttributes() { return ['active', 'color-on', 'color-off']; }

    // Reacts to HTML attribute changes
    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'active') {
            const newState = newValue !== null;
            if (this.isOn !== newState) {
                this.isOn = newState;
                
                // If DOM is ready, animate state change using physics spring
                if (this.thumb) {
                    this.motionSpring.set(this.isOn ? 1 : 0);
                    this.startLoop();
                } else {
                    // Otherwise, hard reset for initial pre-render
                    this.motionSpring.reset(this.isOn ? 1 : 0);
                }
            }
        }
        // Handle dynamic color changes
        if (name === 'color-on') {
            this.colorOn = parseHexColor(newValue, [48, 209, 88, 1]);
            if (!this.rafId && this.thumb) this.draw();
        }
        if (name === 'color-off') {
            this.colorOff = parseHexColor(newValue, [120, 120, 128, 0.36]);
            if (!this.rafId && this.thumb) this.draw();
        }
    }

    // Dynamically computes thumb dimensions and movement bounds based on container size
    calculateLayout() {
        if (!this.thumb) return;
        const trackW = this.clientWidth || 100;
        const trackH = this.clientHeight || 44;
        const paddingVal = Math.max(3, Math.min(6, Math.round(trackH * 0.08)));
        const widthPercent = trackH < 40 ? 0.60 : 0.625; // Smaller toggles need proportionally wider thumbs
        const thumbW = trackW * widthPercent;

        this.thumb.style.top = `${paddingVal}px`;
        this.thumb.style.bottom = `${paddingVal}px`;
        this.thumb.style.left = `${paddingVal}px`;
        this.thumb.style.width = `${thumbW}px`;

        this.metrics.maxTravel = trackW - thumbW - (paddingVal * 2);
        if (this.metrics.maxTravel <= 0) this.metrics.maxTravel = 1; // Failsafe
        
        // Dynamically adjust LiquidBackdrop parameters relative to physical size for perfect optics
        const r = Math.round(1 + (trackH * 0.3));
        const b = Math.round(trackH * 0.12);
        this.thumb.style.setProperty('--liquid-backdrop', `liquid-glass(${r}, ${b}, 0.5, -1)`);
    }

    // Interaction handlers
    handlePointerDown(e) {
        if (this.activePointerId !== null || e.button !== 0) return;
        this.activePointerId = e.pointerId;
        
        // Lock pointer events to this element even if cursor leaves visual bounds
        // It is strictly essential on touch screens to prevent browser from losing gesture control 
        // if a finger slips outside toggle track while swiping
        this.setPointerCapture(this.activePointerId);

        this.clickEffectActive = false;
        this.dragStartX = e.clientX;
        this.dragStartVal = this.motionSpring.val; // Record current physics position
        this.dragMaxDist = 0; 
        this.startLoop();
    }

    handlePointerMove(e) {
        if (this.activePointerId !== e.pointerId) return;
        const deltaPx = e.clientX - this.dragStartX;
        this.dragMaxDist = Math.max(this.dragMaxDist, Math.abs(deltaPx));

        // Normalize pixel drag movement to 0-1 spring scale
        const deltaNorm = deltaPx / this.metrics.maxTravel;
        const nextVal = Math.max(0, Math.min(1, this.dragStartVal + deltaNorm));
        this.motionSpring.set(nextVal);
        this.startLoop();
    }

    handlePointerUp(e) {
        if (this.activePointerId !== e.pointerId) return;
        
        this.releasePointerCapture(this.activePointerId);
        this.activePointerId = null;

        const tolerance = e.pointerType === 'touch' ? 12 : 4; // Higher tolerance for fat fingers

        // If movement was negligible, treat as a click event
        if (this.dragMaxDist < tolerance) {
            this.toggle(); // toggle() handles dispatching event
        } else {
            // Otherwise, snap to nearest boundary based on drag progress
            const previousState = this.isOn;
            this.isOn = this.motionSpring.target > 0.5;
            this.motionSpring.set(this.isOn ? 1 : 0);
            
            // Dispatch event if drag gesture successfully changed toggle state
            if (previousState !== this.isOn) {
                this._dispatchChangeEvent();
            }
        }
        this.startLoop();
    }

    handlePointerCancel(e) {
        if (this.activePointerId !== e.pointerId) return;
        
        this.activePointerId = null;
        this.clickEffectActive = false;
        
        // Failsafe snap to nearest state on interrupted gestures
        const previousState = this.isOn;
        this.isOn = this.motionSpring.target > 0.5;
        this.motionSpring.set(this.isOn ? 1 : 0);
        
        if (previousState !== this.isOn) {
            this._dispatchChangeEvent();
        }
        
        this.startLoop();
    }

    toggle() {
        this.isOn = !this.isOn;
        this.motionSpring.set(this.isOn ? 1 : 0);
        this.clickEffectActive = true; 
        this.startLoop();
        this._dispatchChangeEvent();
    }


    // Helper to fire standard JS events for integration with Vanilla JS and React/Vue listeners
    _dispatchChangeEvent() {
        // Reflect internal state to DOM attributes
        if (this.isOn) {
            this.setAttribute('active', '');
        } else {
            this.removeAttribute('active');
        }
        
        this.dispatchEvent(new CustomEvent('change', {
            detail: { active: this.isOn },
            bubbles: true,
            composed: true // Allows event to bubble up through Shadow DOM barrier
        }));
    }

    startLoop() {
        if (!this.thumb) return;
        if (!this.rafId) this.loop();
    }

    // Core RequestAnimationFrame loop controls physics and visual updates
    loop() {
        const isMotionActive = this.motionSpring.update();
        
        // Target press value: 1 if user is holding down or clicked, 0 otherwise
        let targetPress = (this.activePointerId !== null || this.clickEffectActive) ? 1 : 0;

        if (this.clickEffectActive && Math.abs(this.motionSpring.target - this.motionSpring.val) < 0.01) {
            this.clickEffectActive = false;
            targetPress = 0; 
        }

        // Custom lerp calculation for visual "press" flattening state
        // Eases press progress towards targetPress value frame by frame
        const pressDiff = targetPress - this.pressProgress;
        this.pressProgress += pressDiff * (targetPress > this.pressProgress ? 0.40 : 0.08);

        this.draw();

        // Continue loop if physics are active or press state hasn't fully settled
        if (isMotionActive || Math.abs(pressDiff) > 0.001 || this.pressProgress > 0.01) {
            this.rafId = requestAnimationFrame(() => this.loop());
        } else {
            this.rafId = null;
            this.pressProgress = 0;
            this.draw(); // Final paint call to ensure precise resting state
        }
    }

    // Applies computed physics values to DOM style properties
    draw() {
        if (!this.thumb || !this.track) return;
        const progress = this.motionSpring.val;
        const xPx = progress * this.metrics.maxTravel;

        // Deformation logic: Squash and stretch scaling based directly on dynamic spring velocity
        // As thumb moves faster, it scales on the X-axis (stretching) and squashes on the Y-axis, resulting a physical fluid look
        // Scale values are capped to preserve visual boundaries
        const velocityScale = Math.min(Math.abs(this.motionSpring.velocity) * 1.5, 0.4);
        let scaleX = 1 + velocityScale + (this.pressProgress * 0.50);
        let scaleY = 1 - (velocityScale * 0.3) + (this.pressProgress * 0.50);
        
        // Apply composite transform for hardware acceleration, X translation + velocity scaling
        this.thumb.style.transform = `translate(${xPx.toFixed(2)}px, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`;

        // Interpolate background color mapping based on progress
        const r = Math.round(this.colorOff[0] + (this.colorOn[0] - this.colorOff[0]) * progress);
        const g = Math.round(this.colorOff[1] + (this.colorOn[1] - this.colorOff[1]) * progress);
        const b = Math.round(this.colorOff[2] + (this.colorOn[2] - this.colorOff[2]) * progress);
        const a = this.colorOff[3] + (this.colorOn[3] - this.colorOff[3]) * progress;
        this.track.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;

        // Manage thumb internal opacity based on press progress
        this.thumb.style.backgroundColor = `rgba(255, 255, 255, ${(1.0 - (this.pressProgress * 0.85)).toFixed(3)})`;

        // Sync visibility of LiquidBackdrop internal container to fade in during interactions
        const lbContainer = this.thumb.querySelector('.lb-container');
        if (lbContainer) {
            lbContainer.style.opacity = Math.max(0, this.pressProgress).toFixed(3);
            lbContainer.style.visibility = this.pressProgress === 0 ? 'hidden' : 'visible';
        }
    }

    // Initial DOM creation within Shadow Root
    render() {
        this.shadowRoot.innerHTML = `
            <style>${COMPONENT_STYLES}</style>
            <div class="track"></div>
            <div class="thumb"></div>
        `;
    }
}
// Register custom element natively with browser
customElements.define('liquid-toggle', LiquidToggle);