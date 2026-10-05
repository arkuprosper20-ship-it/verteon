// Media Intent Detection
// Natural language intent detection for media generation requests

import { showToast } from './ui-utils.js';

// Intent patterns for media generation
const imageIntentPatterns = [
    'make an image',
    'generate an image',
    'create an image',
    'generate an image',
    'create a picture',
    'make a picture',
    'design an image',
    'create an illustration',
    'generate an illustration',
    'make a graphic',
    'create a graphic',
    'generate a graphic',
    'make a logo',
    'create a logo',
    'generate a logo',
    'make a thumbnail',
    'create a thumbnail',
    'generate a thumbnail',
    'make a poster',
    'create a poster',
    'generate a poster',
    'make a banner',
    'create a banner',
    'generate a banner',
    'make a wallpaper',
    'create a wallpaper',
    'generate a wallpaper',
    'make a desktop wallpaper',
    'create a desktop wallpaper',
    'generate a desktop wallpaper',
    'make an icon',
    'create an icon',
    'generate an icon',
    'make a concept art',
    'create a concept art',
    'generate a concept art',
    'make an artwork',
    'create an artwork',
    'generate an artwork',
    'make a scene'
];

const videoIntentPatterns = [
    'make a video',
    'generate a video',
    'create a video',
    'make a clip',
    'create a clip',
    'generate a clip',
    'make a movie',
    'create a movie',
    'generate a movie',
    'make a demo',
    'create a demo',
    'generate a demo',
    'make a film',
    'create a film',
    'generate a film',
    'make an animation',
    'create an animation',
    'generate an animation',
    'make a cinematic',
    'create a cinematic',
    'generate a cinematic',
    'animate this',
    'turn this into a video',
    'make a product demo',
    'create a product demo'
];

// Reference intent patterns
const referenceIntentPatterns = [
    'animate this',
    'turn this into a video',
    'make this into a video',
    'convert this to video',
    'video of this',
    'animation of this'
];

// Intent detection classes
export class MediaIntentDetector {
    constructor() {
        this.initPatterns();
    }

    initPatterns(): void {
        // Load patterns from configuration
        // Could be loaded from a config file
    }

    // Detect if user request is for media generation
    detectMediaIntent(request: string): MediaIntentType | null {
        const lowerRequest = request.toLowerCase();

        // Check for direct image intent
        if (this.containsAnyPattern(lowerRequest, imageIntentPatterns)) {
            return 'image';
        }

        // Check for direct video intent
        if (this.containsAnyPattern(lowerRequest, videoIntentPatterns)) {
            return 'video';
        }

        // Check for reference/image-to-video intent
        if (this.containsAnyPattern(lowerRequest, referenceIntentPatterns) || 
            lowerRequest.includes('image')) {
            return 'image-to-video';
        }

        return null;
    }

    // Check if request contains any of the specified patterns
    containsAnyPattern(text: string, patterns: string[]): boolean {
        return patterns.some(pattern => text.includes(pattern));
    }

    // Extract potential subject from request
    extractSubject(request: string): string {
        // Remove common filler words
        const cleaned = request
            .toLowerCase()
            .replace(/\b(make|create|generate|an?|the|a|this|from|of|using|with)\b/g, '')
            .trim();

        return cleaned.length > 0 ? cleaned : request;
    }

    // Get aspect ratio suggestion from request
    getAspectRatioFromPrompt(prompt: string): string {
        const lowerPrompt = prompt.toLowerCase();

        if (lowerPrompt.includes('portrait') || lowerPrompt.includes('vertical') || 
            lowerPrompt.includes('story') || lowerPrompt.includes('phone') || 
            lowerPrompt.includes('instagram')) {
            return '2:3';
        }

        if (lowerPrompt.includes('square') || lowerPrompt.includes('icon') || 
            lowerPrompt.includes('thumbnail') || lowerPrompt.includes('avatar') || 
            lowerPrompt.includes('logo')) {
            return '1:1';
        }

        if (lowerPrompt.includes('landscape') || lowerPrompt.includes('horizontal') || 
            lowerPrompt.includes('wallpaper') || lowerPrompt.includes('banner') || 
            lowerPrompt.includes('desktop')) {
            return '16:9';
        }

        if (lowerPrompt.includes('cinematic') || lowerPrompt.includes('wide screen') || 
            lowerPrompt.includes('cinemascope') || lowerPrompt.includes('film')) {
            return '21:9';
        }

        return '16:9'; // default
    }

    // Get duration suggestion from request
    getDurationFromPrompt(prompt: string): number {
        const lowerPrompt = prompt.toLowerCase();

        if (lowerPrompt.includes('short') || lowerPrompt.includes('quick') || 
            lowerPrompt.includes('quick')) {
            return 5;
        }

        if (lowerPrompt.includes('long') || lowerPrompt.includes('extended') || 
            lowerPrompt.includes('full')) {
            return 30;
        }

        if (lowerPrompt.includes('medium') || lowerPrompt.includes('middle')) {
            return 15;
        }

        return 10; // default
    }

    // Get style suggestion from request
    getStyleFromPrompt(prompt: string): string {
        const lowerPrompt = prompt.toLowerCase();

        if (lowerPrompt.includes('cinematic') || lowerPrompt.includes('film')) {
            return 'cinematic';
        }

        if (lowerPrompt.includes('animation') || lowerPrompt.includes('animated')) {
            return 'animation';
        }

        if (lowerPrompt.includes('artistic') || lowerPrompt.includes('art style')) {
            return 'artistic';
        }

        if (lowerPrompt.includes('realistic') || lowerPrompt.includes('photorealistic')) {
            return 'realistic';
        }

        if (lowerPrompt.includes('cartoon') || lowerPrompt.includes('anime')) {
            return 'cartoon';
        }

        return 'cinematic'; // default
    }

    // Get resolution suggestion from request
    getResolutionFromPrompt(prompt: string): string {
        const lowerPrompt = prompt.toLowerCase();

        if (lowerPrompt.includes('4k') || lowerPrompt.includes('uhd') || 
            lowerPrompt.includes('retina')) {
            return '4k';
        }

        if (lowerPrompt.includes('1080p') || lowerPrompt.includes('full hd')) {
            return '1080p';
        }

        if (lowerPrompt.includes('720p') || lowerPrompt.includes('hd')) {
            return '720p';
        }

        return '1080p'; // default
    }

    // Format request for provider
    formatRequestForProvider(
        intent: MediaIntentType,
        originalRequest: string,
        providerCapabilities: MediaProviderCapabilities
    ): MediaGenerationRequest {
        const formattedRequest: any = {
            prompt: this.formatPrompt(intent, originalRequest, providerCapabilities),
            provider: providerCapabilities.defaultProvider,
            metadata: {
                source: 'natural_language',
                intent,
                originalRequest,
                timestamp: Date.now()
            }
        };

        if (intent === 'image') {
            return {
                ...formattedRequest,
                width: providerCapabilities.supportsWidth ? 1024 : undefined,
                height: providerCapabilities.supportsHeight ? 1024 : undefined,
                aspectRatio: this.getAspectRatioFromPrompt(originalRequest),
                quality: 'high'
            } as ImageGenerationRequest;
        } else if (intent === 'video') {
            return {
                ...formattedRequest,
                duration: this.getDurationFromPrompt(originalRequest),
                resolution: this.getResolutionFromPrompt(originalRequest),
                aspectRatio: this.getAspectRatioFromPrompt(originalRequest),
                style: this.getStyleFromPrompt(originalRequest)
            } as VideoGenerationRequest;
        } else {
            return formattedRequest as MediaGenerationRequest;
        }
    }

    // Format prompt for specific provider
    private formatPrompt(
        intent: MediaIntentType,
        originalRequest: string,
        providerCapabilities: MediaProviderCapabilities
    ): string {
        let formatted = originalRequest;

        // Remove filler words that might confuse providers
        formatted = formatted
            .replace(/\b(make|create|generate|an?|the|a|this|from|of|using|with)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Add context for better results
        if (intent === 'image') {
            formatted = `Create an image: ${formatted}`;
        } else if (intent === 'video') {
            formatted = `Generate a video: ${formatted}`;
        } else if (intent === 'image-to-video') {
            formatted = `Animate this image: ${formatted}`;
        }

        return formatted;
    }
}

// Media intent types
export type MediaIntentType = 
    | 'image'
    | 'video'
    | 'image-to-video';

// Media provider capabilities
export interface MediaProviderCapabilities {
    supportsWidth: boolean;
    supportsHeight: boolean;
    supportsAspectRatio: boolean;
    supportsQuality: boolean;
    supportsStyle: boolean;
    defaultProvider: string;
    supportedFormats: string[];
}

// Intent detection results
export interface IntentDetectionResult {
    intent: MediaIntentType | null;
    formattedRequest?: MediaGenerationRequest;
    confidence: number;
    requiresReferenceImage: boolean;
}

// Global intent detector instance
const intentDetector = new MediaIntentDetector();

// Detect media intent from user request
export function detectMediaIntent(userRequest: string): IntentDetectionResult {
    const intent = intentDetector.detectMediaIntent(userRequest);

    if (!intent) {
        return {
            intent: null,
            confidence: 0
        };
    }

    // Get provider capabilities (mock implementation)
    const mockProviderCapabilities: MediaProviderCapabilities = {
        supportsWidth: true,
        supportsHeight: true,
        supportsAspectRatio: true,
        supportsQuality: true,
        supportsStyle: true,
        defaultProvider: 'dall-e-3',
        supportedFormats: ['image/png', 'image/jpeg', 'video/mp4']
    };

    // Format request for provider
    const formattedRequest = intentDetector.formatRequestForProvider(
        intent,
        userRequest,
        mockProviderCapabilities
    );

    return {
        intent,
        formattedRequest,
        confidence: 0.85, // Mock confidence score
        requiresReferenceImage: intent === 'image-to-video'
    };
}

// Helper function to check if request is media-related
export function isMediaRequest(request: string): boolean {
    const intent = intentDetector.detectMediaIntent(request);
    return intent !== null;
}

// Get aspect ratio suggestion
export function getSuggestedAspectRatio(request: string): string {
    return intentDetector.getAspectRatioFromPrompt(request);
}

// Get suggested duration for video
export function getSuggestedDuration(request: string): number {
    return intentDetector.getDurationFromPrompt(request);
}

// Get suggested style
export function getSuggestedStyle(request: string): string {
    return intentDetector.getStyleFromPrompt(request);
}

export default {
    detectMediaIntent,
    isMediaRequest,
    getSuggestedAspectRatio,
    getSuggestedDuration,
    getSuggestedStyle
};
