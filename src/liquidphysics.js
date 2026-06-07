/**
 * LiquidPhysics Engine v1.0.0 (ESM)
 * 
 * @author AngryMark
 * @license MIT
 */

/**
 * Hooke's Law spring physics engine
 * Solves the second-order differential equation of a damped harmonic oscillator:
 * F_spring = -k * x
 * F_damping = -c * v
 * Where 'k' represents stiffness (tension), 'c' is the damping coefficient, 
 * 'x' is displacement (distance from target), and 'v' is velocity
 */
export class Spring {
    /**
     * Initializes the spring with parameters
     * @param {Object} [config] - configuration object
     * @param {number} [config.initial=0] - initial absolute position and target resting state
     * @param {number} [config.stiffness=0.08] - tension coefficient (k), controls the retraction speed
     * @param {number} [config.damping=0.75] - friction coefficient, lower values gives higher elastic bounciness
     * @param {number} [config.precision=0.0005] - threshold below which movement is treated as settled by math
     */
    constructor(config = {}) {
        this.position = config.initial || 0; // Current spring absolute position
        this.target = config.initial || 0;   // Desired resting target destination
        this.velocity = 0;                   // Current momentum
        
        // Stiffness controls spring tension/snap speed, higher = faster snap
        this.stiffness = config.stiffness || 0.08;
        // Damping controls friction, lower = more elastic, higher = heavy
        this.damping = config.damping || 0.75;
        // Precision dictates when spring is considered "at rest" by math to pause animation loop
        this.precision = config.precision || 0.0005;
    }

    /**
     * Sets new target position for spring to move towards
     * Call this when user interaction changes the desired state
     * @param {number} target - restination value
     */
    set(target) {
        this.target = target;
    }

    /**
     * Hard resets spring to a specific value, killing all velocity
     * Useful for initial layout renders to bypass transition phase
     * @param {number} value - reset value
     */
    reset(value) {
        this.position = value;
        this.target = value;
        this.velocity = 0;
    }

    /**
     * Integrates physics algorithm for current frame
     * Employs Semi-implicit Euler-Cromer integration: 
     * Velocity updated first, *new* velocity is used to update position
     * This should be called inside a requestAnimationFrame loop
     * @returns {boolean} - returns true if spring is still active, false if at rest
     */
    update() {
        // Calculate physical force pulling towards the target (F = -kx)
        const force = (this.target - this.position) * this.stiffness;
        
        // Apply force to velocity to build momentum (Euler-Cromer step 1)
        this.velocity += force;
        
        // Apply damping to slowly bleed off energy and settle spring
        this.velocity *= this.damping;
        
        // Update physical position based on newly calculated velocity (Euler-Cromer step 2)
        this.position += this.velocity;

        // Check resting state condition to prevent infinite micro-calculations
        // Both velocity and distance to target must be below precision threshold
        const isResting = 
            Math.abs(this.velocity) < this.precision && 
            Math.abs(this.target - this.position) < this.precision;

        if (isResting) {
            this.position = this.target; // Snap to exact target to eliminate floating point drift
            this.velocity = 0;
            return false; // Signals animation loop to pause
        }

        return true; // Signals animation loop to continue
    }

    /**
     * Getter for current spring position
     * @returns {number} interpolated position value for current frame
     */
    get val() {
        return this.position;
    }
}