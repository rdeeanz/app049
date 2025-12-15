/**
 * CameraManager - Webcam lifecycle and permission handling
 * 
 * Responsible for:
 * - Requesting camera permissions
 * - Managing video stream lifecycle
 * - Providing video element for CV processing
 * - Error handling and cleanup
 */

export class CameraManager {
    constructor() {
        this.videoElement = null;
        this.stream = null;
        this.isReady = false;
        this.hasPermission = false;
        
        // Callbacks
        this.onReady = null;
        this.onError = null;
        this.onPermissionDenied = null;
        
        // Configuration
        this.constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user',
                frameRate: { ideal: 30 }
            },
            audio: false
        };
    }
    
    /**
     * Initialize with video element reference
     */
    init(videoElement, previewElement = null) {
        this.videoElement = videoElement;
        this.previewElement = previewElement;
        return this;
    }
    
    /**
     * Request camera permission and start stream
     */
    async requestPermission() {
        try {
            // Check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera API not supported in this browser');
            }
            
            // Request camera access
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            this.hasPermission = true;
            
            return { success: true };
        } catch (error) {
            this.hasPermission = false;
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                if (this.onPermissionDenied) {
                    this.onPermissionDenied(error);
                }
                return { success: false, reason: 'permission_denied', error };
            }
            
            if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                return { success: false, reason: 'no_camera', error };
            }
            
            if (this.onError) {
                this.onError(error);
            }
            return { success: false, reason: 'unknown', error };
        }
    }
    
    /**
     * Start the video stream
     */
    async startStream() {
        if (!this.stream) {
            const result = await this.requestPermission();
            if (!result.success) {
                return result;
            }
        }
        
        if (!this.videoElement) {
            return { success: false, reason: 'no_video_element' };
        }
        
        try {
            this.videoElement.srcObject = this.stream;
            this.videoElement.setAttribute('playsinline', 'true');
            
            // Wait for video to be ready
            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play()
                        .then(resolve)
                        .catch(reject);
                };
                this.videoElement.onerror = reject;
                
                // Timeout after 5 seconds
                setTimeout(() => reject(new Error('Video load timeout')), 5000);
            });
            
            // Also set preview if available
            if (this.previewElement && this.stream) {
                this.previewElement.srcObject = this.stream;
                this.previewElement.play().catch(() => {});
            }
            
            this.isReady = true;
            
            if (this.onReady) {
                this.onReady(this.videoElement);
            }
            
            return { success: true };
        } catch (error) {
            if (this.onError) {
                this.onError(error);
            }
            return { success: false, reason: 'stream_error', error };
        }
    }
    
    /**
     * Stop the video stream and cleanup
     */
    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        
        if (this.previewElement) {
            this.previewElement.srcObject = null;
        }
        
        this.isReady = false;
    }
    
    /**
     * Get the video element for CV processing
     * Returns null if video is not ready (SAFETY CHECK)
     */
    getVideoElement() {
        if (!this.isReady || !this.videoElement) {
            return null;
        }
        
        // Additional safety: check if video is actually playing
        if (this.videoElement.readyState < 2) {
            return null;
        }
        
        return this.videoElement;
    }
    
    /**
     * Check if camera is ready for processing
     */
    isVideoReady() {
        return this.isReady && 
               this.videoElement && 
               this.videoElement.readyState >= 2 &&
               !this.videoElement.paused;
    }
    
    /**
     * Get video dimensions
     */
    getVideoDimensions() {
        if (!this.isVideoReady()) {
            return { width: 0, height: 0 };
        }
        return {
            width: this.videoElement.videoWidth,
            height: this.videoElement.videoHeight
        };
    }
    
    /**
     * Cleanup resources
     */
    dispose() {
        this.stopStream();
        this.videoElement = null;
        this.previewElement = null;
        this.onReady = null;
        this.onError = null;
        this.onPermissionDenied = null;
    }
}
