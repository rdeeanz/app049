/**
 * GameController - State Machine and Gameplay Rules
 * 
 * Responsible for:
 * - Managing game states (MENU, PLAYING, PAUSED, GAME_OVER)
 * - Spawning orbs and hazards
 * - Score tracking and combo system
 * - Collision detection coordination
 * - Difficulty progression
 * 
 * INPUT-SOURCE AGNOSTIC: Only receives commands from InputMapper
 */

// Game states
export const GameState = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER'
};

// Entity types
export const EntityType = {
    ORB: 'ORB',
    HAZARD: 'HAZARD',
    POWERUP: 'POWERUP'
};

export class GameController {
    constructor() {
        // Game state
        this.state = GameState.MENU;
        this.previousState = null;

        // Player state
        this.player = {
            x: 0,           // -5 to 5 (game units)
            z: 0,           // -5 to 5 (game units)
            targetX: 0,
            targetZ: 0,
            shieldActive: false,
            shieldEnergy: 1.0,  // 0 to 1
            shieldRechargeRate: 0.2,  // per second
            shieldDrainRate: 0.5      // per second when active
        };

        // Scoring
        this.score = 0;
        this.combo = 1;
        this.maxCombo = 1;
        this.orbsCaught = 0;

        // Entities (orbs, hazards)
        this.entities = [];
        this.entityIdCounter = 0;

        // Spawning configuration
        this.spawnConfig = {
            orbInterval: 1.5,     // seconds
            hazardInterval: 3.0,  // seconds
            orbTimer: 0,
            hazardTimer: 0,
            fallSpeed: 3.0,       // units per second
            spawnHeight: 15,      // Y position
            catchHeight: 0.5,     // Y position for catch
            missHeight: -2        // Y position when missed
        };

        // Difficulty progression
        this.difficulty = {
            level: 1,
            scoreThresholds: [500, 1500, 3000, 5000, 8000],
            speedMultiplier: 1.0,
            spawnMultiplier: 1.0
        };

        // Callbacks (for Renderer)
        this.onStateChange = null;
        this.onEntitySpawn = null;
        this.onEntityRemove = null;
        this.onScoreUpdate = null;
        this.onComboUpdate = null;
        this.onShieldUpdate = null;
        this.onPlayerMove = null;
        this.onOrbCatch = null;
        this.onHazardHit = null;

        // Play area bounds
        this.bounds = {
            minX: -5,
            maxX: 5,
            minZ: -5,
            maxZ: 5
        };

        // Player movement
        this.playerSpeed = 15; // units per second (for smooth movement)
    }

    /**
     * Initialize game controller
     */
    init() {
        this.reset();
        return this;
    }

    /**
     * Update game logic (called every frame)
     * @param {number} deltaTime - Time since last frame in seconds
     * @param {object} input - Input state from InputMapper
     */
    update(deltaTime, input) {
        if (this.state !== GameState.PLAYING) {
            this.handleMenuInput(input);
            return;
        }

        // Handle pause
        if (input.pause) {
            this.pause();
            return;
        }

        // Handle restart (during gameplay)
        if (input.restart) {
            this.restart();
            return;
        }

        // Update player position based on input
        this.updatePlayer(deltaTime, input);

        // Update shield
        this.updateShield(deltaTime, input.actionPrimary);

        // Update entities
        this.updateEntities(deltaTime);

        // Spawn new entities
        this.updateSpawning(deltaTime);

        // Check collisions
        this.checkCollisions();

        // Update difficulty
        this.updateDifficulty();
    }

    /**
     * Handle input in menu states
     */
    handleMenuInput(input) {
        switch (this.state) {
            case GameState.MENU:
                if (input.start || input.actionPrimary) {
                    this.startGame();
                }
                break;

            case GameState.PAUSED:
                if (input.pause) {
                    this.resume();
                }
                if (input.restart) {
                    this.restart();
                }
                break;

            case GameState.GAME_OVER:
                if (input.restart || input.start) {
                    this.restart();
                }
                break;
        }
    }

    /**
     * Update player position
     */
    updatePlayer(deltaTime, input) {
        // Set target position from input (-1 to 1 -> -5 to 5)
        this.player.targetX = input.horizontal * 5;
        this.player.targetZ = input.vertical * 5;

        // Clamp to bounds
        this.player.targetX = Math.max(this.bounds.minX,
            Math.min(this.bounds.maxX, this.player.targetX));
        this.player.targetZ = Math.max(this.bounds.minZ,
            Math.min(this.bounds.maxZ, this.player.targetZ));

        // Smooth movement towards target
        const dx = this.player.targetX - this.player.x;
        const dz = this.player.targetZ - this.player.z;

        const moveSpeed = this.playerSpeed * deltaTime;

        if (Math.abs(dx) > 0.01) {
            this.player.x += Math.sign(dx) * Math.min(Math.abs(dx), moveSpeed);
        }
        if (Math.abs(dz) > 0.01) {
            this.player.z += Math.sign(dz) * Math.min(Math.abs(dz), moveSpeed);
        }

        // Notify renderer
        if (this.onPlayerMove) {
            this.onPlayerMove(this.player.x, this.player.z);
        }
    }

    /**
     * Update shield state
     */
    updateShield(deltaTime, actionPressed) {
        const wasActive = this.player.shieldActive;

        if (actionPressed && this.player.shieldEnergy > 0) {
            this.player.shieldActive = true;
            this.player.shieldEnergy -= this.player.shieldDrainRate * deltaTime;
            this.player.shieldEnergy = Math.max(0, this.player.shieldEnergy);

            if (this.player.shieldEnergy <= 0) {
                this.player.shieldActive = false;
            }
        } else {
            this.player.shieldActive = false;
            // Recharge when not using
            this.player.shieldEnergy += this.player.shieldRechargeRate * deltaTime;
            this.player.shieldEnergy = Math.min(1, this.player.shieldEnergy);
        }

        // Notify if changed
        if (wasActive !== this.player.shieldActive || actionPressed) {
            if (this.onShieldUpdate) {
                this.onShieldUpdate(this.player.shieldEnergy, this.player.shieldActive);
            }
        }
    }

    /**
     * Update all entities
     */
    updateEntities(deltaTime) {
        const fallSpeed = this.spawnConfig.fallSpeed * this.difficulty.speedMultiplier;

        for (const entity of this.entities) {
            // Move down
            entity.y -= fallSpeed * deltaTime;

            // Check if reached catch zone
            if (!entity.processed && entity.y <= this.spawnConfig.catchHeight) {
                entity.inCatchZone = true;
            }

            // Check if missed (fell below floor)
            if (!entity.processed && entity.y <= this.spawnConfig.missHeight) {
                entity.missed = true;
                entity.processed = true;
            }
        }

        // Remove entities that are too far below
        this.entities = this.entities.filter(entity => {
            if (entity.y < -5 || entity.processed) {
                if (entity.missed && entity.type === EntityType.ORB) {
                    // Orb was missed - break combo
                    this.breakCombo();
                }

                if (this.onEntityRemove) {
                    this.onEntityRemove(entity.id);
                }
                return false;
            }
            return true;
        });
    }

    /**
     * Update entity spawning
     */
    updateSpawning(deltaTime) {
        const spawnMult = this.difficulty.spawnMultiplier;

        // Spawn orbs
        this.spawnConfig.orbTimer += deltaTime;
        if (this.spawnConfig.orbTimer >= this.spawnConfig.orbInterval / spawnMult) {
            this.spawnOrb();
            this.spawnConfig.orbTimer = 0;
        }

        // Spawn hazards
        this.spawnConfig.hazardTimer += deltaTime;
        if (this.spawnConfig.hazardTimer >= this.spawnConfig.hazardInterval / spawnMult) {
            this.spawnHazard();
            this.spawnConfig.hazardTimer = 0;
        }
    }

    /**
     * Spawn an orb at random position
     */
    spawnOrb() {
        const entity = {
            id: ++this.entityIdCounter,
            type: EntityType.ORB,
            x: (Math.random() - 0.5) * 8,
            y: this.spawnConfig.spawnHeight,
            z: (Math.random() - 0.5) * 8,
            radius: 0.5,
            color: this.getRandomOrbColor(),
            points: 100,
            processed: false,
            missed: false,
            inCatchZone: false
        };

        this.entities.push(entity);

        if (this.onEntitySpawn) {
            this.onEntitySpawn(entity);
        }
    }

    /**
     * Spawn a hazard at random position
     */
    spawnHazard() {
        const entity = {
            id: ++this.entityIdCounter,
            type: EntityType.HAZARD,
            x: (Math.random() - 0.5) * 8,
            y: this.spawnConfig.spawnHeight,
            z: (Math.random() - 0.5) * 8,
            radius: 0.6,
            processed: false,
            missed: false,
            inCatchZone: false
        };

        this.entities.push(entity);

        if (this.onEntitySpawn) {
            this.onEntitySpawn(entity);
        }
    }

    /**
     * Get random orb color
     */
    getRandomOrbColor() {
        const colors = [
            { r: 0, g: 1, b: 1 },      // Cyan
            { r: 1, g: 0, b: 0.67 },   // Pink
            { r: 1, g: 0.67, b: 0 },   // Orange
            { r: 0.5, g: 0, b: 1 },    // Purple
            { r: 0, g: 1, b: 0.5 }     // Green
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Check collisions between player and entities
     */
    checkCollisions() {
        const playerRadius = 1.5; // Platform radius

        for (const entity of this.entities) {
            if (entity.processed || !entity.inCatchZone) continue;

            // Check distance to player
            const dx = entity.x - this.player.x;
            const dz = entity.z - this.player.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < playerRadius + entity.radius) {
                // Collision!
                entity.processed = true;

                if (entity.type === EntityType.ORB) {
                    this.catchOrb(entity);
                } else if (entity.type === EntityType.HAZARD) {
                    this.hitHazard(entity);
                }
            }
        }
    }

    /**
     * Handle catching an orb
     */
    catchOrb(orb) {
        // Add points with combo multiplier
        const points = orb.points * this.combo;
        this.score += points;
        this.orbsCaught++;

        // Increase combo
        this.combo++;
        if (this.combo > this.maxCombo) {
            this.maxCombo = this.combo;
        }

        // Notify
        if (this.onOrbCatch) {
            this.onOrbCatch(orb, points);
        }
        if (this.onScoreUpdate) {
            this.onScoreUpdate(this.score);
        }
        if (this.onComboUpdate) {
            this.onComboUpdate(this.combo);
        }
    }

    /**
     * Handle hitting a hazard
     */
    hitHazard(hazard) {
        if (this.player.shieldActive) {
            // Shield absorbs hit
            if (this.onHazardHit) {
                this.onHazardHit(hazard, true);
            }
            return;
        }

        // Game over!
        if (this.onHazardHit) {
            this.onHazardHit(hazard, false);
        }

        this.gameOver();
    }

    /**
     * Break combo when orb is missed
     */
    breakCombo() {
        this.combo = 1;
        if (this.onComboUpdate) {
            this.onComboUpdate(this.combo);
        }
    }

    /**
     * Update difficulty based on score
     */
    updateDifficulty() {
        const thresholds = this.difficulty.scoreThresholds;
        let newLevel = 1;

        for (let i = 0; i < thresholds.length; i++) {
            if (this.score >= thresholds[i]) {
                newLevel = i + 2;
            }
        }

        if (newLevel !== this.difficulty.level) {
            this.difficulty.level = newLevel;
            this.difficulty.speedMultiplier = 1 + (newLevel - 1) * 0.15;
            this.difficulty.spawnMultiplier = 1 + (newLevel - 1) * 0.1;
        }
    }

    /**
     * Start the game
     */
    startGame() {
        this.reset();
        this.setState(GameState.PLAYING);
    }

    /**
     * Pause the game
     */
    pause() {
        if (this.state === GameState.PLAYING) {
            this.previousState = this.state;
            this.setState(GameState.PAUSED);
        }
    }

    /**
     * Resume the game
     */
    resume() {
        if (this.state === GameState.PAUSED) {
            this.setState(this.previousState || GameState.PLAYING);
        }
    }

    /**
     * Restart the game
     */
    restart() {
        // Clear all entities
        for (const entity of this.entities) {
            if (this.onEntityRemove) {
                this.onEntityRemove(entity.id);
            }
        }
        this.entities = [];

        this.startGame();
    }

    /**
     * End the game
     */
    gameOver() {
        this.setState(GameState.GAME_OVER);
    }

    /**
     * Set game state and notify
     */
    setState(newState) {
        const oldState = this.state;
        this.state = newState;

        if (this.onStateChange) {
            this.onStateChange(newState, oldState);
        }
    }

    /**
     * Reset game to initial state
     */
    reset() {
        this.player = {
            x: 0,
            z: 0,
            targetX: 0,
            targetZ: 0,
            shieldActive: false,
            shieldEnergy: 1.0,
            shieldRechargeRate: 0.2,
            shieldDrainRate: 0.5
        };

        this.score = 0;
        this.combo = 1;
        this.maxCombo = 1;
        this.orbsCaught = 0;

        this.spawnConfig.orbTimer = 0;
        this.spawnConfig.hazardTimer = 0;

        this.difficulty.level = 1;
        this.difficulty.speedMultiplier = 1.0;
        this.difficulty.spawnMultiplier = 1.0;

        // Notify score reset
        if (this.onScoreUpdate) this.onScoreUpdate(0);
        if (this.onComboUpdate) this.onComboUpdate(1);
        if (this.onShieldUpdate) this.onShieldUpdate(1, false);
    }

    /**
     * Get current game stats
     */
    getStats() {
        return {
            score: this.score,
            combo: this.combo,
            maxCombo: this.maxCombo,
            orbsCaught: this.orbsCaught,
            level: this.difficulty.level
        };
    }

    /**
     * Get current state
     */
    getState() {
        return this.state;
    }

    /**
     * Cleanup
     */
    dispose() {
        this.entities = [];
        this.onStateChange = null;
        this.onEntitySpawn = null;
        this.onEntityRemove = null;
        this.onScoreUpdate = null;
        this.onComboUpdate = null;
        this.onShieldUpdate = null;
        this.onPlayerMove = null;
    }
}
