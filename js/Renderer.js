/**
 * Renderer - Babylon.js Scene Management
 * 
 * Responsible for:
 * - Engine and scene initialization
 * - Camera setup (Arc Rotate for spectator view)
 * - Lighting (cosmic ambiance)
 * - Player platform mesh with glow effects
 * - Orb and hazard meshes
 * - Particle systems
 * - Render loop
 * - UI overlay updates
 */

import { GameState, EntityType } from './GameController.js';

export class Renderer {
    constructor() {
        this.engine = null;
        this.scene = null;
        this.camera = null;

        // Meshes
        this.playerPlatform = null;
        this.playerShield = null;
        this.ground = null;
        this.entityMeshes = new Map();

        // Materials
        this.materials = {};

        // Particle systems
        this.particleSystems = [];

        // Glow layer
        this.glowLayer = null;

        // UI elements
        this.ui = {
            score: null,
            combo: null,
            shieldFill: null,
            inputType: null,
            hud: null,
            menuScreen: null,
            gameOverScreen: null,
            pauseOverlay: null,
            finalScore: null,
            maxCombo: null,
            orbsCaught: null,
            notification: null,
            notificationText: null
        };

        // Animation time
        this.time = 0;
    }

    /**
     * Initialize Babylon.js engine and scene
     */
    async init(canvas) {
        // Create engine
        this.engine = new BABYLON.Engine(canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true
        });

        // Create scene
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.04, 0.04, 0.1, 1);

        // Enable physics (for potential future use)
        // this.scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0));

        // Setup camera
        this.setupCamera();

        // Setup lighting
        this.setupLighting();

        // Setup glow layer
        this.setupGlowLayer();

        // Create materials
        this.createMaterials();

        // Create environment
        this.createEnvironment();

        // Create player platform
        this.createPlayer();

        // Cache UI elements
        this.cacheUIElements();

        // Handle window resize
        window.addEventListener('resize', () => {
            this.engine.resize();
        });

        return this;
    }

    /**
     * Setup arc rotate camera
     */
    setupCamera() {
        this.camera = new BABYLON.ArcRotateCamera(
            'camera',
            Math.PI / 2,     // Alpha (horizontal)
            Math.PI / 3.5,   // Beta (vertical angle)
            20,              // Radius
            new BABYLON.Vector3(0, 0, 0),
            this.scene
        );

        // Lock camera (no user control)
        this.camera.lowerRadiusLimit = 20;
        this.camera.upperRadiusLimit = 20;
        this.camera.lowerBetaLimit = Math.PI / 3.5;
        this.camera.upperBetaLimit = Math.PI / 3.5;

        // Slight auto-rotation for visual interest
        this.camera.useAutoRotationBehavior = false;
    }

    /**
     * Setup scene lighting
     */
    setupLighting() {
        // Hemisphere light (ambient)
        const hemiLight = new BABYLON.HemisphericLight(
            'hemiLight',
            new BABYLON.Vector3(0, 1, 0),
            this.scene
        );
        hemiLight.intensity = 0.5;
        hemiLight.diffuse = new BABYLON.Color3(0.6, 0.6, 1);
        hemiLight.groundColor = new BABYLON.Color3(0.1, 0.1, 0.2);

        // Point light (player glow)
        const pointLight = new BABYLON.PointLight(
            'playerLight',
            new BABYLON.Vector3(0, 2, 0),
            this.scene
        );
        pointLight.intensity = 1;
        pointLight.diffuse = new BABYLON.Color3(0, 0.94, 1);
        pointLight.range = 15;

        this.playerLight = pointLight;

        // Spot light from above
        const spotLight = new BABYLON.SpotLight(
            'spotLight',
            new BABYLON.Vector3(0, 20, 0),
            new BABYLON.Vector3(0, -1, 0),
            Math.PI / 3,
            2,
            this.scene
        );
        spotLight.intensity = 0.8;
        spotLight.diffuse = new BABYLON.Color3(1, 0.9, 0.8);
    }

    /**
     * Setup glow layer for emissive materials
     */
    setupGlowLayer() {
        this.glowLayer = new BABYLON.GlowLayer('glow', this.scene, {
            mainTextureFixedSize: 512,
            blurKernelSize: 64
        });
        this.glowLayer.intensity = 1.5;
    }

    /**
     * Create reusable materials
     */
    createMaterials() {
        // Player platform material
        const platformMat = new BABYLON.PBRMaterial('platformMat', this.scene);
        platformMat.albedoColor = new BABYLON.Color3(0.1, 0.1, 0.15);
        platformMat.metallic = 0.9;
        platformMat.roughness = 0.2;
        platformMat.emissiveColor = new BABYLON.Color3(0, 0.3, 0.4);
        this.materials.platform = platformMat;

        // Player shield material
        const shieldMat = new BABYLON.PBRMaterial('shieldMat', this.scene);
        shieldMat.albedoColor = new BABYLON.Color3(0, 0.7, 1);
        shieldMat.alpha = 0.3;
        shieldMat.metallic = 0;
        shieldMat.roughness = 0.1;
        shieldMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0.7);
        this.materials.shield = shieldMat;

        // Ground material
        const groundMat = new BABYLON.PBRMaterial('groundMat', this.scene);
        groundMat.albedoColor = new BABYLON.Color3(0.05, 0.05, 0.1);
        groundMat.metallic = 0.3;
        groundMat.roughness = 0.8;
        groundMat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.05);
        this.materials.ground = groundMat;

        // Hazard material
        const hazardMat = new BABYLON.PBRMaterial('hazardMat', this.scene);
        hazardMat.albedoColor = new BABYLON.Color3(0.3, 0.05, 0.1);
        hazardMat.metallic = 0.8;
        hazardMat.roughness = 0.3;
        hazardMat.emissiveColor = new BABYLON.Color3(1, 0.2, 0.3);
        this.materials.hazard = hazardMat;
    }

    /**
     * Create orb material with color
     */
    createOrbMaterial(color) {
        const mat = new BABYLON.PBRMaterial(`orbMat_${Date.now()}`, this.scene);
        mat.albedoColor = new BABYLON.Color3(color.r * 0.3, color.g * 0.3, color.b * 0.3);
        mat.metallic = 0.1;
        mat.roughness = 0.2;
        mat.emissiveColor = new BABYLON.Color3(color.r, color.g, color.b);
        mat.alpha = 0.9;
        return mat;
    }

    /**
     * Create game environment
     */
    createEnvironment() {
        // Ground plane
        this.ground = BABYLON.MeshBuilder.CreateGround('ground', {
            width: 20,
            height: 20,
            subdivisions: 20
        }, this.scene);
        this.ground.material = this.materials.ground;
        this.ground.position.y = -0.5;

        // Grid lines on ground
        this.createGridLines();

        // Starfield background
        this.createStarfield();

        // Boundary pillars
        this.createBoundaryPillars();
    }

    /**
     * Create grid lines on ground
     */
    createGridLines() {
        const gridMat = new BABYLON.StandardMaterial('gridMat', this.scene);
        gridMat.emissiveColor = new BABYLON.Color3(0, 0.2, 0.3);
        gridMat.alpha = 0.3;

        for (let i = -5; i <= 5; i++) {
            // Horizontal lines
            const lineH = BABYLON.MeshBuilder.CreateBox(`gridH${i}`, {
                width: 20, height: 0.02, depth: 0.05
            }, this.scene);
            lineH.position.set(0, -0.48, i * 2);
            lineH.material = gridMat;

            // Vertical lines
            const lineV = BABYLON.MeshBuilder.CreateBox(`gridV${i}`, {
                width: 0.05, height: 0.02, depth: 20
            }, this.scene);
            lineV.position.set(i * 2, -0.48, 0);
            lineV.material = gridMat;
        }
    }

    /**
     * Create starfield background
     */
    createStarfield() {
        const starCount = 200;
        const starMat = new BABYLON.StandardMaterial('starMat', this.scene);
        starMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        starMat.disableLighting = true;

        for (let i = 0; i < starCount; i++) {
            const star = BABYLON.MeshBuilder.CreateSphere(`star${i}`, {
                diameter: 0.05 + Math.random() * 0.1
            }, this.scene);

            // Position stars in a dome around the scene
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.4 + 0.1;
            const r = 40 + Math.random() * 20;

            star.position.x = r * Math.sin(phi) * Math.cos(theta);
            star.position.y = r * Math.cos(phi);
            star.position.z = r * Math.sin(phi) * Math.sin(theta);

            star.material = starMat;
        }
    }

    /**
     * Create boundary pillars
     */
    createBoundaryPillars() {
        const pillarMat = new BABYLON.PBRMaterial('pillarMat', this.scene);
        pillarMat.albedoColor = new BABYLON.Color3(0.1, 0.1, 0.2);
        pillarMat.emissiveColor = new BABYLON.Color3(0.1, 0, 0.2);
        pillarMat.metallic = 0.8;
        pillarMat.roughness = 0.4;

        const corners = [
            [-8, -8], [8, -8], [-8, 8], [8, 8]
        ];

        corners.forEach((pos, i) => {
            const pillar = BABYLON.MeshBuilder.CreateCylinder(`pillar${i}`, {
                height: 15,
                diameter: 0.5
            }, this.scene);
            pillar.position.set(pos[0], 7, pos[1]);
            pillar.material = pillarMat;

            // Add glow ring at top
            const ring = BABYLON.MeshBuilder.CreateTorus(`ring${i}`, {
                diameter: 1,
                thickness: 0.1
            }, this.scene);
            ring.position.set(pos[0], 14.5, pos[1]);
            ring.material = this.materials.shield;
        });
    }

    /**
     * Create player platform
     */
    createPlayer() {
        // Main platform
        this.playerPlatform = BABYLON.MeshBuilder.CreateCylinder('platform', {
            height: 0.3,
            diameter: 3
        }, this.scene);
        this.playerPlatform.position.y = 0.15;
        this.playerPlatform.material = this.materials.platform;

        // Platform ring (glowing edge)
        const ringMat = new BABYLON.PBRMaterial('ringMat', this.scene);
        ringMat.emissiveColor = new BABYLON.Color3(0, 0.94, 1);
        ringMat.metallic = 0;
        ringMat.roughness = 0.5;

        const ring = BABYLON.MeshBuilder.CreateTorus('platformRing', {
            diameter: 3,
            thickness: 0.15
        }, this.scene);
        ring.position.y = 0.3;
        ring.material = ringMat;
        ring.parent = this.playerPlatform;

        // Shield dome (invisible until activated)
        this.playerShield = BABYLON.MeshBuilder.CreateSphere('shield', {
            diameter: 4,
            segments: 32
        }, this.scene);
        this.playerShield.position.y = 0.5;
        this.playerShield.material = this.materials.shield;
        this.playerShield.visibility = 0;
        this.playerShield.parent = this.playerPlatform;

        // Add to glow layer
        this.glowLayer.addIncludedOnlyMesh(ring);
        this.glowLayer.addIncludedOnlyMesh(this.playerShield);

        // Platform particles
        this.createPlatformParticles();
    }

    /**
     * Create particles around platform
     */
    createPlatformParticles() {
        const particleSystem = new BABYLON.ParticleSystem('platformParticles', 100, this.scene);

        // Use a simple texture
        particleSystem.particleTexture = new BABYLON.Texture(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABEklEQVRYhe2WMQ7CMAxFfwIb98DsDQtX4RwM3AQOwQESN4AbsHAiBvZKbBQlTRwncZBIX6r0Y/n52QlJQ0NDQx2jlFJKpZRa/3sj0PQAN0/bj8DogHsAJwckInL2nCTPjIgUAZwD+CnlkhGxLYDnACN/VgF4GhG5PQGemQBIAHAfuPYEXBsB7hPgKQlgN4GnAGICfCt4agLctQJ8G3gZgNEBwT1f2i+AOLDsq/4MgMcuUOe8+oG4APCuAQq8+4F4AOo+kNYOwhUa4M4BdR8I7SDKE+C+FTwuAN5awaMD0rQCvP8+cHH7wFMC0jgBPrSCx+0DAdz3gfqB+O0Djw5I6wT4dxuIL4Bkn/L3AeCz8AdmfhbvywEUJQAAAABJRU5ErkJggg==',
            this.scene
        );

        particleSystem.emitter = this.playerPlatform;
        particleSystem.minEmitBox = new BABYLON.Vector3(-1.5, 0, -1.5);
        particleSystem.maxEmitBox = new BABYLON.Vector3(1.5, 0.5, 1.5);

        particleSystem.color1 = new BABYLON.Color4(0, 0.9, 1, 0.8);
        particleSystem.color2 = new BABYLON.Color4(0.5, 0, 1, 0.8);
        particleSystem.colorDead = new BABYLON.Color4(0, 0, 0.2, 0);

        particleSystem.minSize = 0.05;
        particleSystem.maxSize = 0.15;

        particleSystem.minLifeTime = 1;
        particleSystem.maxLifeTime = 2;

        particleSystem.emitRate = 30;

        particleSystem.direction1 = new BABYLON.Vector3(-0.2, 1, -0.2);
        particleSystem.direction2 = new BABYLON.Vector3(0.2, 1.5, 0.2);

        particleSystem.minEmitPower = 0.5;
        particleSystem.maxEmitPower = 1;

        particleSystem.gravity = new BABYLON.Vector3(0, -0.5, 0);

        particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;

        particleSystem.start();
        this.particleSystems.push(particleSystem);
    }

    /**
     * Cache UI element references
     */
    cacheUIElements() {
        this.ui.score = document.getElementById('score');
        this.ui.combo = document.getElementById('combo');
        this.ui.shieldFill = document.getElementById('shieldFill');
        this.ui.inputType = document.getElementById('inputType');
        this.ui.hud = document.getElementById('hud');
        this.ui.menuScreen = document.getElementById('menuScreen');
        this.ui.gameOverScreen = document.getElementById('gameOverScreen');
        this.ui.pauseOverlay = document.getElementById('pauseOverlay');
        this.ui.finalScore = document.getElementById('finalScore');
        this.ui.maxCombo = document.getElementById('maxCombo');
        this.ui.orbsCaught = document.getElementById('orbsCaught');
        this.ui.notification = document.getElementById('notification');
        this.ui.notificationText = document.getElementById('notificationText');
        this.ui.permissionStatus = document.getElementById('permissionStatus');
    }

    /**
     * Start render loop
     */
    startRenderLoop() {
        let lastTime = performance.now();

        this.engine.runRenderLoop(() => {
            const now = performance.now();
            const deltaTime = (now - lastTime) / 1000;
            lastTime = now;

            this.time += deltaTime;

            // Animate elements
            this.animate(deltaTime);

            // Render
            this.scene.render();
        });
    }

    /**
     * Animate scene elements
     */
    animate(deltaTime) {
        // Gentle camera movement
        this.camera.alpha = Math.PI / 2 + Math.sin(this.time * 0.1) * 0.05;

        // Player light follows platform
        if (this.playerLight && this.playerPlatform) {
            this.playerLight.position.x = this.playerPlatform.position.x;
            this.playerLight.position.z = this.playerPlatform.position.z;
        }

        // Animate entity meshes
        for (const [id, mesh] of this.entityMeshes) {
            if (mesh.rotationSpeed) {
                mesh.rotation.y += mesh.rotationSpeed * deltaTime;
                mesh.rotation.x += mesh.rotationSpeed * 0.5 * deltaTime;
            }

            // Bobbing motion
            if (mesh.bobOffset !== undefined) {
                mesh.position.y += Math.sin(this.time * 3 + mesh.bobOffset) * 0.002;
            }
        }

        // Shield pulse animation
        if (this.playerShield && this.playerShield.visibility > 0) {
            const pulse = 0.9 + Math.sin(this.time * 10) * 0.1;
            this.playerShield.scaling.setAll(pulse);
        }
    }

    /**
     * Update player position
     */
    updatePlayerPosition(x, z) {
        if (this.playerPlatform) {
            this.playerPlatform.position.x = x;
            this.playerPlatform.position.z = z;
        }
    }

    /**
     * Update shield state
     */
    updateShield(energy, active) {
        if (this.ui.shieldFill) {
            this.ui.shieldFill.style.width = `${energy * 100}%`;
        }

        if (this.playerShield) {
            // Smooth visibility transition
            const targetVisibility = active ? 0.4 : 0;
            this.playerShield.visibility += (targetVisibility - this.playerShield.visibility) * 0.2;
        }
    }

    /**
     * Spawn entity mesh
     */
    spawnEntity(entity) {
        let mesh;

        if (entity.type === EntityType.ORB) {
            mesh = BABYLON.MeshBuilder.CreateSphere(`orb_${entity.id}`, {
                diameter: entity.radius * 2,
                segments: 16
            }, this.scene);
            mesh.material = this.createOrbMaterial(entity.color);
            this.glowLayer.addIncludedOnlyMesh(mesh);
            mesh.rotationSpeed = 2 + Math.random();
            mesh.bobOffset = Math.random() * Math.PI * 2;
        } else if (entity.type === EntityType.HAZARD) {
            // Crystalline hazard shape
            mesh = BABYLON.MeshBuilder.CreatePolyhedron(`hazard_${entity.id}`, {
                type: 1, // Octahedron
                size: entity.radius
            }, this.scene);
            mesh.material = this.materials.hazard;
            this.glowLayer.addIncludedOnlyMesh(mesh);
            mesh.rotationSpeed = 3 + Math.random() * 2;
        }

        if (mesh) {
            mesh.position.set(entity.x, entity.y, entity.z);
            this.entityMeshes.set(entity.id, mesh);
        }
    }

    /**
     * Update entity positions
     */
    updateEntityPositions(entities) {
        for (const entity of entities) {
            const mesh = this.entityMeshes.get(entity.id);
            if (mesh) {
                mesh.position.y = entity.y;
            }
        }
    }

    /**
     * Remove entity mesh
     */
    removeEntity(entityId) {
        const mesh = this.entityMeshes.get(entityId);
        if (mesh) {
            mesh.dispose();
            this.entityMeshes.delete(entityId);
        }
    }

    /**
     * Show catch effect
     */
    showCatchEffect(entity, points) {
        // Flash effect at catch position
        const sphere = BABYLON.MeshBuilder.CreateSphere('catchFlash', {
            diameter: 1
        }, this.scene);
        sphere.position.set(entity.x, 0.5, entity.z);

        const flashMat = new BABYLON.StandardMaterial('flashMat', this.scene);
        flashMat.emissiveColor = new BABYLON.Color3(0, 1, 0.5);
        flashMat.alpha = 0.8;
        sphere.material = flashMat;

        // Animate and dispose
        let scale = 1;
        const animation = () => {
            scale += 0.1;
            sphere.scaling.setAll(scale);
            flashMat.alpha -= 0.05;

            if (flashMat.alpha <= 0) {
                sphere.dispose();
                return;
            }
            requestAnimationFrame(animation);
        };
        animation();
    }

    /**
     * Show hazard hit effect
     */
    showHazardEffect(entity, blocked) {
        const color = blocked ?
            new BABYLON.Color3(0, 0.5, 1) :
            new BABYLON.Color3(1, 0.2, 0.2);

        // Impact flash
        const sphere = BABYLON.MeshBuilder.CreateSphere('hazardFlash', {
            diameter: 2
        }, this.scene);
        sphere.position.set(entity.x, 0.5, entity.z);

        const flashMat = new BABYLON.StandardMaterial('flashMat', this.scene);
        flashMat.emissiveColor = color;
        flashMat.alpha = 0.8;
        sphere.material = flashMat;

        // If not blocked, shake camera
        if (!blocked) {
            this.shakeCamera();
        }

        // Animate and dispose
        let scale = 1;
        const animation = () => {
            scale += 0.15;
            sphere.scaling.setAll(scale);
            flashMat.alpha -= 0.04;

            if (flashMat.alpha <= 0) {
                sphere.dispose();
                return;
            }
            requestAnimationFrame(animation);
        };
        animation();
    }

    /**
     * Camera shake effect
     */
    shakeCamera() {
        const originalAlpha = Math.PI / 2;
        const originalBeta = Math.PI / 3.5;
        let shakeTime = 0;

        const shake = () => {
            shakeTime += 0.016;
            const intensity = Math.max(0, 1 - shakeTime * 3);

            this.camera.alpha = originalAlpha + (Math.random() - 0.5) * 0.1 * intensity;
            this.camera.beta = originalBeta + (Math.random() - 0.5) * 0.1 * intensity;

            if (shakeTime < 0.5) {
                requestAnimationFrame(shake);
            } else {
                this.camera.alpha = originalAlpha;
                this.camera.beta = originalBeta;
            }
        };
        shake();
    }

    /**
     * Update score display
     */
    updateScore(score) {
        if (this.ui.score) {
            this.ui.score.textContent = score.toString();
        }
    }

    /**
     * Update combo display
     */
    updateCombo(combo) {
        if (this.ui.combo) {
            this.ui.combo.textContent = `x${combo}`;

            // Pulse animation
            this.ui.combo.style.transform = 'scale(1.3)';
            setTimeout(() => {
                this.ui.combo.style.transform = 'scale(1)';
            }, 100);
        }
    }

    /**
     * Update input type display
     */
    updateInputType(displayName) {
        if (this.ui.inputType) {
            this.ui.inputType.textContent = displayName;
        }
    }

    /**
     * Update permission status
     */
    updatePermissionStatus(message, isError = false) {
        if (this.ui.permissionStatus) {
            this.ui.permissionStatus.textContent = message;
            this.ui.permissionStatus.className = 'permission-status ' + (isError ? 'error' : 'success');
        }
    }

    /**
     * Show notification toast
     */
    showNotification(message, duration = 3000) {
        if (this.ui.notification && this.ui.notificationText) {
            this.ui.notificationText.textContent = message;
            this.ui.notification.classList.remove('hidden');

            setTimeout(() => {
                this.ui.notification.classList.add('hidden');
            }, duration);
        }
    }

    /**
     * Handle game state changes
     */
    onGameStateChange(newState, oldState, stats) {
        switch (newState) {
            case GameState.MENU:
                this.showScreen('menu');
                break;

            case GameState.PLAYING:
                this.showScreen('game');
                break;

            case GameState.PAUSED:
                this.showScreen('pause');
                break;

            case GameState.GAME_OVER:
                this.showScreen('gameOver', stats);
                break;
        }
    }

    /**
     * Show specific screen
     */
    showScreen(screen, stats = null) {
        // Hide all screens first
        this.ui.menuScreen?.classList.add('hidden');
        this.ui.gameOverScreen?.classList.add('hidden');
        this.ui.pauseOverlay?.classList.add('hidden');
        this.ui.hud?.classList.add('hidden');

        switch (screen) {
            case 'menu':
                this.ui.menuScreen?.classList.remove('hidden');
                break;

            case 'game':
                this.ui.hud?.classList.remove('hidden');
                break;

            case 'pause':
                this.ui.hud?.classList.remove('hidden');
                this.ui.pauseOverlay?.classList.remove('hidden');
                break;

            case 'gameOver':
                this.ui.gameOverScreen?.classList.remove('hidden');
                if (stats && this.ui.finalScore) {
                    this.ui.finalScore.textContent = stats.score.toString();
                    this.ui.maxCombo.textContent = `x${stats.maxCombo}`;
                    this.ui.orbsCaught.textContent = stats.orbsCaught.toString();
                }
                break;
        }
    }

    /**
     * Get delta time helper
     */
    getDeltaTime() {
        return this.engine.getDeltaTime() / 1000;
    }

    /**
     * Cleanup
     */
    dispose() {
        // Stop particle systems
        for (const ps of this.particleSystems) {
            ps.dispose();
        }

        // Dispose entity meshes
        for (const mesh of this.entityMeshes.values()) {
            mesh.dispose();
        }

        // Dispose engine
        if (this.engine) {
            this.engine.dispose();
        }
    }
}
