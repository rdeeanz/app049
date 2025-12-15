/**
 * InputMapper - Input Abstraction Layer
 * 
 * Responsible for:
 * - Registering multiple input sources (CV, keyboard, mouse)
 * - Mapping raw inputs to logical game commands
 * - Managing input priority (CV primary, fallback secondary)
 * - Providing unified input interface to game logic
 */

// Game command constants
export const Commands = {
    MOVE_HORIZONTAL: 'MOVE_HORIZONTAL',
    MOVE_VERTICAL: 'MOVE_VERTICAL',
    ACTION_PRIMARY: 'ACTION_PRIMARY',
    PAUSE: 'PAUSE',
    RESTART: 'RESTART',
    START: 'START'
};

// Input source types
export const InputSource = {
    CV: 'cv',
    KEYBOARD: 'keyboard',
    MOUSE: 'mouse'
};

export class InputMapper {
    constructor() {
        // Current input state
        this.currentInput = {
            horizontal: 0,       // -1 to 1
            vertical: 0,         // -1 to 1
            actionPrimary: false,
            pause: false,
            restart: false,
            start: false,
            source: InputSource.KEYBOARD
        };

        // Input sources status
        this.cvEnabled = false;
        this.fallbackEnabled = true;

        // Keyboard state
        this.keys = {};

        // Mouse state
        this.mouse = { x: 0, y: 0, clicked: false };
        this.mouseArea = { width: 1, height: 1 };

        // Callbacks
        this.onInputSourceChange = null;
        this.onCommand = null;

        // Command cooldowns (for one-shot commands)
        this.commandCooldowns = {
            pause: false,
            restart: false,
            start: false
        };

        // Bind event handlers
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }

    /**
     * Initialize input listeners
     */
    init(canvas) {
        // Keyboard
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        // Mouse
        if (canvas) {
            this.mouseArea = {
                width: canvas.width || window.innerWidth,
                height: canvas.height || window.innerHeight
            };
        }
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mouseup', this.handleMouseUp);

        return this;
    }

    /**
     * Enable CV input source
     */
    enableCV() {
        this.cvEnabled = true;
        this.notifySourceChange(InputSource.CV);
    }

    /**
     * Disable CV input and switch to fallback
     */
    disableCV() {
        this.cvEnabled = false;
        this.notifySourceChange(InputSource.KEYBOARD);
    }

    /**
     * Process CV input from FeatureProcessor
     */
    processCVInput(processedData) {
        if (!this.cvEnabled || !processedData) {
            return;
        }

        // Map CV position to movement
        this.currentInput.horizontal = processedData.normalizedX;
        this.currentInput.vertical = processedData.normalizedY;

        // Map gestures to actions
        this.currentInput.actionPrimary =
            processedData.gesture === 'pinch' ||
            processedData.gesture === 'fist';

        this.currentInput.source = InputSource.CV;
    }

    /**
     * Handle keyboard down events
     */
    handleKeyDown(event) {
        this.keys[event.code] = true;

        // One-shot commands
        if (event.code === 'Escape' || event.code === 'KeyP') {
            if (!this.commandCooldowns.pause) {
                this.currentInput.pause = true;
                this.commandCooldowns.pause = true;
            }
        }

        if (event.code === 'KeyR') {
            if (!this.commandCooldowns.restart) {
                this.currentInput.restart = true;
                this.commandCooldowns.restart = true;
            }
        }

        if (event.code === 'Enter' || event.code === 'Space') {
            if (!this.commandCooldowns.start && !this.currentInput.actionPrimary) {
                this.currentInput.start = true;
                this.commandCooldowns.start = true;
            }
        }
    }

    /**
     * Handle keyboard up events
     */
    handleKeyUp(event) {
        this.keys[event.code] = false;

        // Reset cooldowns
        if (event.code === 'Escape' || event.code === 'KeyP') {
            this.commandCooldowns.pause = false;
            this.currentInput.pause = false;
        }
        if (event.code === 'KeyR') {
            this.commandCooldowns.restart = false;
            this.currentInput.restart = false;
        }
        if (event.code === 'Enter' || event.code === 'Space') {
            this.commandCooldowns.start = false;
            this.currentInput.start = false;
        }
    }

    /**
     * Handle mouse movement
     */
    handleMouseMove(event) {
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
    }

    /**
     * Handle mouse down
     */
    handleMouseDown(event) {
        if (event.button === 0) {
            this.mouse.clicked = true;
        }
    }

    /**
     * Handle mouse up
     */
    handleMouseUp(event) {
        if (event.button === 0) {
            this.mouse.clicked = false;
        }
    }

    /**
     * Update fallback input state
     */
    updateFallbackInput() {
        if (this.cvEnabled) {
            return;
        }

        // Keyboard movement
        let horizontal = 0;
        let vertical = 0;

        if (this.keys['ArrowLeft'] || this.keys['KeyA']) horizontal -= 1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) horizontal += 1;
        if (this.keys['ArrowUp'] || this.keys['KeyW']) vertical -= 1;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) vertical += 1;

        // Check if using keyboard
        const usingKeyboard = horizontal !== 0 || vertical !== 0;

        if (usingKeyboard) {
            this.currentInput.horizontal = horizontal;
            this.currentInput.vertical = vertical;
            this.currentInput.source = InputSource.KEYBOARD;
        } else {
            // Use mouse position
            const mouseX = (this.mouse.x / window.innerWidth) * 2 - 1;
            const mouseY = (this.mouse.y / window.innerHeight) * 2 - 1;

            this.currentInput.horizontal = mouseX;
            this.currentInput.vertical = mouseY;
            this.currentInput.source = InputSource.MOUSE;
        }

        // Action from spacebar or mouse click
        this.currentInput.actionPrimary =
            this.keys['Space'] ||
            this.mouse.clicked;
    }

    /**
     * Get current input state (game logic calls this)
     */
    getInput() {
        // Update fallback if CV not enabled
        if (!this.cvEnabled) {
            this.updateFallbackInput();
        }

        // Create copy to avoid mutation
        const input = { ...this.currentInput };

        // Reset one-shot commands after reading
        this.currentInput.pause = false;
        this.currentInput.restart = false;
        this.currentInput.start = false;

        return input;
    }

    /**
     * Check if CV is the active input source
     */
    isUsingCV() {
        return this.cvEnabled && this.currentInput.source === InputSource.CV;
    }

    /**
     * Get current input source name for display
     */
    getInputSourceName() {
        if (this.cvEnabled) {
            return '🎥 Gesture';
        }
        return this.currentInput.source === InputSource.KEYBOARD ?
            '⌨️ Keyboard' : '🖱️ Mouse';
    }

    /**
     * Notify about input source change
     */
    notifySourceChange(source) {
        if (this.onInputSourceChange) {
            this.onInputSourceChange(source, this.getInputSourceName());
        }
    }

    /**
     * Update mouse area dimensions
     */
    updateMouseArea(width, height) {
        this.mouseArea.width = width;
        this.mouseArea.height = height;
    }

    /**
     * Reset input state
     */
    reset() {
        this.currentInput = {
            horizontal: 0,
            vertical: 0,
            actionPrimary: false,
            pause: false,
            restart: false,
            start: false,
            source: this.cvEnabled ? InputSource.CV : InputSource.KEYBOARD
        };
        this.keys = {};
        this.mouse.clicked = false;
    }

    /**
     * Cleanup
     */
    dispose() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mouseup', this.handleMouseUp);
    }
}
