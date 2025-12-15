/**
 * Main Application - Module Orchestrator
 * 
 * Responsible for:
 * - Initializing all modules in correct order
 * - Wiring up data flow pipeline
 * - Handling fallback activation
 * - Main game loop coordination
 * 
 * Data Flow:
 * Camera → CVEngine → FeatureProcessor → InputMapper → GameController → Renderer
 */

import { CameraManager } from './CameraManager.js';
import { CVEngine } from './CVEngine.js';
import { FeatureProcessor } from './FeatureProcessor.js';
import { InputMapper } from './InputMapper.js';
import { GameController, GameState } from './GameController.js';
import { Renderer } from './Renderer.js';

class CosmicOrbCatcher {
    constructor() {
        // Module instances
        this.cameraManager = new CameraManager();
        this.cvEngine = new CVEngine();
        this.featureProcessor = new FeatureProcessor();
        this.inputMapper = new InputMapper();
        this.gameController = new GameController();
        this.renderer = new Renderer();

        // State
        this.isRunning = false;
        this.cvInitialized = false;
        this.lastFrameTime = 0;

        // DOM elements
        this.canvas = null;
        this.videoElement = null;
        this.previewVideo = null;
        this.handCanvas = null;
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 Initializing Cosmic Orb Catcher...');

        // Get DOM elements
        this.canvas = document.getElementById('renderCanvas');
        this.videoElement = document.getElementById('cameraFeed');
        this.previewVideo = document.getElementById('previewVideo');
        this.handCanvas = document.getElementById('handCanvas');

        if (!this.canvas) {
            console.error('Canvas element not found!');
            return;
        }

        // Initialize modules in order
        await this.initRenderer();
        this.initInputMapper();
        this.initGameController();
        await this.initCVPipeline();

        // Setup UI event listeners
        this.setupUIListeners();

        // Start the main loop
        this.startMainLoop();

        console.log('✅ Initialization complete!');
    }

    /**
     * Initialize Renderer (Babylon.js)
     */
    async initRenderer() {
        await this.renderer.init(this.canvas);
        this.renderer.startRenderLoop();
        this.renderer.showScreen('menu');
    }

    /**
     * Initialize InputMapper
     */
    initInputMapper() {
        this.inputMapper.init(this.canvas);

        // Handle input source changes
        this.inputMapper.onInputSourceChange = (source, displayName) => {
            this.renderer.updateInputType(displayName);
            console.log(`Input source changed to: ${displayName}`);
        };
    }

    /**
     * Initialize GameController
     */
    initGameController() {
        this.gameController.init();

        // Wire up callbacks
        this.gameController.onStateChange = (newState, oldState) => {
            const stats = this.gameController.getStats();
            this.renderer.onGameStateChange(newState, oldState, stats);
        };

        this.gameController.onEntitySpawn = (entity) => {
            this.renderer.spawnEntity(entity);
        };

        this.gameController.onEntityRemove = (entityId) => {
            this.renderer.removeEntity(entityId);
        };

        this.gameController.onScoreUpdate = (score) => {
            this.renderer.updateScore(score);
        };

        this.gameController.onComboUpdate = (combo) => {
            this.renderer.updateCombo(combo);
        };

        this.gameController.onShieldUpdate = (energy, active) => {
            this.renderer.updateShield(energy, active);
        };

        this.gameController.onPlayerMove = (x, z) => {
            this.renderer.updatePlayerPosition(x, z);
        };

        this.gameController.onOrbCatch = (orb, points) => {
            this.renderer.showCatchEffect(orb, points);
        };

        this.gameController.onHazardHit = (hazard, blocked) => {
            this.renderer.showHazardEffect(hazard, blocked);
        };
    }

    /**
     * Initialize CV Pipeline (Camera + MediaPipe)
     */
    async initCVPipeline() {
        console.log('📷 Initializing CV pipeline...');

        // Initialize camera manager
        this.cameraManager.init(this.videoElement, this.previewVideo);

        // Request camera permission
        const permResult = await this.cameraManager.requestPermission();

        if (!permResult.success) {
            this.handleCVFailure(permResult.reason);
            return;
        }

        // Start camera stream
        const streamResult = await this.cameraManager.startStream();

        if (!streamResult.success) {
            this.handleCVFailure(streamResult.reason);
            return;
        }

        // Initialize CV Engine (MediaPipe)
        this.cvEngine.onError = (error) => {
            console.warn('CVEngine error:', error);
            this.handleCVFailure('cv_error');
        };

        this.cvEngine.onResults = (results) => {
            // Process through feature processor
            const processed = this.featureProcessor.process(results);

            // Send to input mapper
            this.inputMapper.processCVInput(processed);

            // Draw landmarks on preview
            if (this.handCanvas && results.landmarks) {
                const ctx = this.handCanvas.getContext('2d');
                this.cvEngine.drawLandmarks(
                    ctx,
                    this.handCanvas.width,
                    this.handCanvas.height
                );
            }
        };

        const cvResult = await this.cvEngine.init();

        if (!cvResult.success) {
            this.handleCVFailure('cv_init_failed');
            return;
        }

        // CV pipeline ready!
        this.cvInitialized = true;
        this.inputMapper.enableCV();

        // Show camera preview
        this.showCameraPreview(true);

        this.renderer.updatePermissionStatus('✓ Hand tracking active', false);
        this.renderer.showNotification('👋 Hand tracking enabled! Move your hand to control.');

        console.log('✅ CV pipeline initialized successfully');
    }

    /**
     * Handle CV initialization failure
     */
    handleCVFailure(reason) {
        console.warn(`CV initialization failed: ${reason}`);

        // Disable CV input
        this.cvInitialized = false;
        this.inputMapper.disableCV();

        // Show appropriate message
        let message = '';
        switch (reason) {
            case 'permission_denied':
                message = '⚠️ Camera access denied. Using keyboard/mouse controls.';
                break;
            case 'no_camera':
                message = '📷 No camera found. Using keyboard/mouse controls.';
                break;
            case 'cv_error':
            case 'cv_init_failed':
                message = '⚠️ Hand tracking failed. Using keyboard/mouse controls.';
                break;
            default:
                message = '⚠️ Camera unavailable. Using keyboard/mouse controls.';
        }

        this.renderer.updatePermissionStatus(message, true);
        this.renderer.showNotification('Use WASD/Arrows + Space to play');

        // Hide camera preview
        this.showCameraPreview(false);
    }

    /**
     * Show/hide camera preview
     */
    showCameraPreview(show) {
        const preview = document.getElementById('cameraPreview');
        if (preview) {
            if (show) {
                preview.classList.remove('hidden');
                // Set canvas size to match video
                if (this.handCanvas && this.previewVideo) {
                    this.handCanvas.width = this.previewVideo.videoWidth || 200;
                    this.handCanvas.height = this.previewVideo.videoHeight || 150;
                }
            } else {
                preview.classList.add('hidden');
            }
        }
    }

    /**
     * Setup UI event listeners
     */
    setupUIListeners() {
        // Start button
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.gameController.startGame();
            });
        }

        // Restart button
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.gameController.restart();
            });
        }

        // Toggle preview button
        const toggleBtn = document.getElementById('togglePreview');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const preview = document.getElementById('cameraPreview');
                if (preview) {
                    preview.classList.toggle('hidden');
                }
            });
        }
    }

    /**
     * Start the main game loop
     */
    startMainLoop() {
        this.isRunning = true;
        this.lastFrameTime = performance.now();

        const gameLoop = async () => {
            if (!this.isRunning) return;

            const now = performance.now();
            const deltaTime = (now - this.lastFrameTime) / 1000;
            this.lastFrameTime = now;

            // Process CV frame if available
            if (this.cvInitialized && this.cameraManager.isVideoReady()) {
                const video = this.cameraManager.getVideoElement();
                if (video) {
                    await this.cvEngine.processFrame(video);
                }
            }

            // Get input state
            const input = this.inputMapper.getInput();

            // Update game logic
            this.gameController.update(deltaTime, input);

            // Update entity positions in renderer
            this.renderer.updateEntityPositions(this.gameController.entities);

            // Continue loop
            requestAnimationFrame(gameLoop);
        };

        gameLoop();
    }

    /**
     * Stop the game
     */
    stop() {
        this.isRunning = false;
        this.cameraManager.stopStream();
        this.cvEngine.dispose();
        this.inputMapper.dispose();
        this.gameController.dispose();
        this.renderer.dispose();
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const game = new CosmicOrbCatcher();
    game.init().catch(error => {
        console.error('Failed to initialize game:', error);
    });

    // Expose for debugging
    window.game = game;
});
