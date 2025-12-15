/**
 * CVEngine - Computer Vision Engine using MediaPipe Hands
 * 
 * Responsible for:
 * - Initializing MediaPipe Hands
 * - Processing video frames (with safety checks)
 * - Detecting hand landmarks and gestures
 * - Emitting structured gesture data
 */

export class CVEngine {
    constructor() {
        this.hands = null;
        this.isInitialized = false;
        this.isProcessing = false;
        this.lastResults = null;

        // Callbacks
        this.onResults = null;
        this.onError = null;
        this.onInitialized = null;

        // Gesture detection thresholds
        this.pinchThreshold = 0.08; // Distance threshold for pinch detection
        this.fistThreshold = 0.15;  // Curl threshold for fist detection
    }

    /**
     * Initialize MediaPipe Hands
     */
    async init() {
        try {
            // Check if MediaPipe Hands is available
            if (typeof Hands === 'undefined') {
                throw new Error('MediaPipe Hands not loaded');
            }

            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
                }
            });

            // Configure hands detection
            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.5
            });

            // Set up results callback
            this.hands.onResults((results) => this.processResults(results));

            // Warm up the model
            await this.hands.initialize();

            this.isInitialized = true;

            if (this.onInitialized) {
                this.onInitialized();
            }

            return { success: true };
        } catch (error) {
            console.error('CVEngine init error:', error);

            if (this.onError) {
                this.onError(error);
            }

            return { success: false, error };
        }
    }

    /**
     * Process a video frame
     * SAFETY: Only processes if video is valid
     */
    async processFrame(videoElement) {
        // SAFETY CHECK: Never process if video is not ready
        if (!videoElement ||
            videoElement.readyState < 2 ||
            videoElement.paused ||
            videoElement.videoWidth === 0) {
            return null;
        }

        if (!this.isInitialized || !this.hands) {
            return null;
        }

        if (this.isProcessing) {
            return this.lastResults;
        }

        this.isProcessing = true;

        try {
            await this.hands.send({ image: videoElement });
        } catch (error) {
            console.warn('Frame processing error:', error);
        }

        this.isProcessing = false;

        return this.lastResults;
    }

    /**
     * Process MediaPipe results and extract gesture data
     */
    processResults(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            this.lastResults = {
                detected: false,
                gesture: 'none',
                confidence: 0,
                position: { x: 0.5, y: 0.5 },
                landmarks: null
            };

            if (this.onResults) {
                this.onResults(this.lastResults);
            }
            return;
        }

        const landmarks = results.multiHandLandmarks[0];
        const handedness = results.multiHandedness[0];

        // Get palm center (average of wrist and middle finger base)
        const palmCenter = this.getPalmCenter(landmarks);

        // Detect gesture
        const gesture = this.detectGesture(landmarks);

        this.lastResults = {
            detected: true,
            gesture: gesture.type,
            confidence: handedness.score,
            position: palmCenter,
            landmarks: landmarks,
            gestureStrength: gesture.strength
        };

        if (this.onResults) {
            this.onResults(this.lastResults);
        }
    }

    /**
     * Calculate palm center from landmarks
     */
    getPalmCenter(landmarks) {
        // Use wrist (0), index MCP (5), and pinky MCP (17) for stable palm center
        const wrist = landmarks[0];
        const indexMcp = landmarks[5];
        const pinkyMcp = landmarks[17];

        return {
            x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
            y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
            z: (wrist.z + indexMcp.z + pinkyMcp.z) / 3
        };
    }

    /**
     * Detect gesture type from landmarks
     */
    detectGesture(landmarks) {
        // Check for pinch (thumb tip to index tip distance)
        const pinchDistance = this.getDistance(landmarks[4], landmarks[8]);
        if (pinchDistance < this.pinchThreshold) {
            return {
                type: 'pinch',
                strength: 1 - (pinchDistance / this.pinchThreshold)
            };
        }

        // Check for closed fist (all fingertips close to palm)
        const fistScore = this.getFistScore(landmarks);
        if (fistScore > 0.7) {
            return { type: 'fist', strength: fistScore };
        }

        // Check for pointing (index extended, others curled)
        if (this.isPointing(landmarks)) {
            return { type: 'point', strength: 1.0 };
        }

        // Default to open palm
        return { type: 'open', strength: 1.0 };
    }

    /**
     * Calculate 3D distance between two landmarks
     */
    getDistance(lm1, lm2) {
        const dx = lm1.x - lm2.x;
        const dy = lm1.y - lm2.y;
        const dz = (lm1.z || 0) - (lm2.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculate fist score (0 = open, 1 = closed fist)
     */
    getFistScore(landmarks) {
        const wrist = landmarks[0];
        const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]]; // finger tips
        const mcps = [landmarks[5], landmarks[9], landmarks[13], landmarks[17]]; // MCPs

        let curlScore = 0;
        for (let i = 0; i < 4; i++) {
            const tipToWrist = this.getDistance(tips[i], wrist);
            const mcpToWrist = this.getDistance(mcps[i], wrist);

            // If tip is closer to wrist than MCP, finger is curled
            if (tipToWrist < mcpToWrist * 1.1) {
                curlScore += 0.25;
            }
        }

        return curlScore;
    }

    /**
     * Check if hand is in pointing gesture
     */
    isPointing(landmarks) {
        // Index finger extended (tip far from palm)
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        const wrist = landmarks[0];

        const indexExtended = this.getDistance(indexTip, wrist) >
            this.getDistance(indexMcp, wrist) * 1.3;

        // Other fingers curled
        const middleCurled = this.getDistance(landmarks[12], wrist) <
            this.getDistance(landmarks[9], wrist) * 1.2;

        return indexExtended && middleCurled;
    }

    /**
     * Get latest results without processing
     */
    getLastResults() {
        return this.lastResults;
    }

    /**
     * Check if engine is ready
     */
    isReady() {
        return this.isInitialized && this.hands !== null;
    }

    /**
     * Draw landmarks on canvas (for preview)
     */
    drawLandmarks(ctx, canvasWidth, canvasHeight) {
        if (!this.lastResults || !this.lastResults.landmarks) {
            return;
        }

        const landmarks = this.lastResults.landmarks;

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Draw connections
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;

        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],     // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],     // Index
            [0, 9], [9, 10], [10, 11], [11, 12], // Middle
            [0, 13], [13, 14], [14, 15], [15, 16], // Ring
            [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
            [5, 9], [9, 13], [13, 17]            // Palm
        ];

        for (const [i, j] of connections) {
            const p1 = landmarks[i];
            const p2 = landmarks[j];

            ctx.beginPath();
            ctx.moveTo(p1.x * canvasWidth, p1.y * canvasHeight);
            ctx.lineTo(p2.x * canvasWidth, p2.y * canvasHeight);
            ctx.stroke();
        }

        // Draw points
        ctx.fillStyle = '#ff00aa';
        for (const lm of landmarks) {
            ctx.beginPath();
            ctx.arc(lm.x * canvasWidth, lm.y * canvasHeight, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Cleanup resources
     */
    dispose() {
        if (this.hands) {
            this.hands.close();
            this.hands = null;
        }
        this.isInitialized = false;
        this.lastResults = null;
        this.onResults = null;
        this.onError = null;
    }
}
