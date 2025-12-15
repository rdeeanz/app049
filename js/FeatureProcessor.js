/**
 * FeatureProcessor - Signal Stabilization and Normalization
 * 
 * Responsible for:
 * - Smoothing raw CV position data (moving average)
 * - Gesture hysteresis (require consecutive frames)
 * - Normalizing coordinates to game space
 * - Dead zone filtering to reduce jitter
 */

export class FeatureProcessor {
    constructor() {
        // Position smoothing (moving average)
        this.positionHistory = [];
        this.historySize = 5;

        // Gesture hysteresis
        this.gestureBuffer = [];
        this.gestureBufferSize = 3;
        this.currentGesture = 'none';

        // Dead zone configuration
        this.deadZone = 0.02; // Minimum movement to register
        this.lastPosition = { x: 0.5, y: 0.5 };

        // Normalization mapping (camera space to game space)
        // Camera: 0-1 (left-right), 0-1 (top-bottom)
        // Game: -1 to 1 (left-right), -1 to 1 (back-front)
        this.inputRange = { minX: 0.1, maxX: 0.9, minY: 0.1, maxY: 0.9 };

        // Output state
        this.processedData = {
            normalizedX: 0,
            normalizedY: 0,
            gesture: 'none',
            isStable: false,
            confidence: 0,
            rawPosition: { x: 0.5, y: 0.5 }
        };
    }

    /**
     * Process raw CV results
     */
    process(cvResults) {
        if (!cvResults || !cvResults.detected) {
            // No hand detected - gradually return to center
            this.decay();
            return this.processedData;
        }

        // Smooth position
        const smoothedPosition = this.smoothPosition(cvResults.position);

        // Apply dead zone
        const filteredPosition = this.applyDeadZone(smoothedPosition);

        // Normalize to game space (-1 to 1)
        const normalizedX = this.normalize(
            filteredPosition.x,
            this.inputRange.minX,
            this.inputRange.maxX,
            false  // Natural: hand right = platform right
        );

        const normalizedY = this.normalize(
            filteredPosition.y,
            this.inputRange.minY,
            this.inputRange.maxY,
            false
        );

        // Process gesture with hysteresis
        const stableGesture = this.processGesture(cvResults.gesture);

        // Update output
        this.processedData = {
            normalizedX: normalizedX,
            normalizedY: normalizedY,
            gesture: stableGesture,
            isStable: this.isPositionStable(),
            confidence: cvResults.confidence,
            rawPosition: cvResults.position,
            gestureStrength: cvResults.gestureStrength || 1
        };

        return this.processedData;
    }

    /**
     * Smooth position using moving average
     */
    smoothPosition(position) {
        // Add to history
        this.positionHistory.push({
            x: position.x,
            y: position.y,
            timestamp: Date.now()
        });

        // Remove old entries
        while (this.positionHistory.length > this.historySize) {
            this.positionHistory.shift();
        }

        // Calculate weighted average (newer samples have more weight)
        let totalWeight = 0;
        let avgX = 0;
        let avgY = 0;

        for (let i = 0; i < this.positionHistory.length; i++) {
            const weight = (i + 1) / this.positionHistory.length;
            avgX += this.positionHistory[i].x * weight;
            avgY += this.positionHistory[i].y * weight;
            totalWeight += weight;
        }

        return {
            x: avgX / totalWeight,
            y: avgY / totalWeight
        };
    }

    /**
     * Apply dead zone filtering
     */
    applyDeadZone(position) {
        const dx = position.x - this.lastPosition.x;
        const dy = position.y - this.lastPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.deadZone) {
            // Movement too small, keep last position
            return this.lastPosition;
        }

        // Update last position
        this.lastPosition = { x: position.x, y: position.y };
        return position;
    }

    /**
     * Normalize value from input range to -1 to 1
     */
    normalize(value, min, max, mirror = false) {
        // Clamp to range
        const clamped = Math.max(min, Math.min(max, value));

        // Normalize to 0-1
        let normalized = (clamped - min) / (max - min);

        // Mirror if needed (for X axis - move hand right, platform goes right)
        if (mirror) {
            normalized = 1 - normalized;
        }

        // Convert to -1 to 1
        return normalized * 2 - 1;
    }

    /**
     * Process gesture with hysteresis
     */
    processGesture(gesture) {
        // Add to buffer
        this.gestureBuffer.push(gesture);

        // Keep buffer at fixed size
        while (this.gestureBuffer.length > this.gestureBufferSize) {
            this.gestureBuffer.shift();
        }

        // Count occurrences of each gesture
        const counts = {};
        for (const g of this.gestureBuffer) {
            counts[g] = (counts[g] || 0) + 1;
        }

        // Find most common gesture
        let maxCount = 0;
        let dominantGesture = this.currentGesture;

        for (const [gesture, count] of Object.entries(counts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantGesture = gesture;
            }
        }

        // Only change gesture if it dominates the buffer
        if (maxCount >= Math.ceil(this.gestureBufferSize * 0.6)) {
            this.currentGesture = dominantGesture;
        }

        return this.currentGesture;
    }

    /**
     * Check if position is stable (low variance)
     */
    isPositionStable() {
        if (this.positionHistory.length < 3) {
            return false;
        }

        // Calculate variance
        let sumX = 0, sumY = 0;
        for (const p of this.positionHistory) {
            sumX += p.x;
            sumY += p.y;
        }

        const avgX = sumX / this.positionHistory.length;
        const avgY = sumY / this.positionHistory.length;

        let variance = 0;
        for (const p of this.positionHistory) {
            variance += Math.pow(p.x - avgX, 2) + Math.pow(p.y - avgY, 2);
        }
        variance /= this.positionHistory.length;

        return variance < 0.001;
    }

    /**
     * Decay position and gesture when hand not detected
     */
    decay() {
        // Clear gesture buffer gradually
        if (this.gestureBuffer.length > 0) {
            this.gestureBuffer.shift();
        }

        if (this.gestureBuffer.length === 0) {
            this.currentGesture = 'none';
        }

        // Slowly decay position history
        if (this.positionHistory.length > 0) {
            this.positionHistory.shift();
        }

        // Update output with decay
        this.processedData.gesture = this.currentGesture;
        this.processedData.confidence = 0;
        this.processedData.isStable = false;
    }

    /**
     * Get current processed data
     */
    getData() {
        return this.processedData;
    }

    /**
     * Update configuration
     */
    configure(options) {
        if (options.historySize !== undefined) {
            this.historySize = options.historySize;
        }
        if (options.gestureBufferSize !== undefined) {
            this.gestureBufferSize = options.gestureBufferSize;
        }
        if (options.deadZone !== undefined) {
            this.deadZone = options.deadZone;
        }
        if (options.inputRange !== undefined) {
            this.inputRange = { ...this.inputRange, ...options.inputRange };
        }
    }

    /**
     * Reset all buffers
     */
    reset() {
        this.positionHistory = [];
        this.gestureBuffer = [];
        this.currentGesture = 'none';
        this.lastPosition = { x: 0.5, y: 0.5 };
        this.processedData = {
            normalizedX: 0,
            normalizedY: 0,
            gesture: 'none',
            isStable: false,
            confidence: 0,
            rawPosition: { x: 0.5, y: 0.5 }
        };
    }

    /**
     * Cleanup
     */
    dispose() {
        this.reset();
    }
}
