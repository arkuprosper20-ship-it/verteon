// Shared Media Provider Types and Abstractions

export interface MediaProvider {
    readonly id: string;
    readonly name: string;
    readonly type: 'image' | 'video';
    readonly description: string;
}

export interface ImageProvider extends MediaProvider {
    type: 'image';
    generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export interface VideoProvider extends MediaProvider {
    type: 'video';
    generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
}

export type MediaProviderInterface = ImageProvider | VideoProvider;

export interface BaseGenerationRequest {
    prompt: string;
    negativePrompt?: string;
    aspectRatio?: string;
    style?: string;
    referenceImages?: string[]; // Reference image URLs
    outputDirectory?: string;
    filename?: string;
    metadata?: Record<string, any>;
}

export interface ImageGenerationRequest extends BaseGenerationRequest {
    width?: number;
    height?: number;
    numberOfImages?: number;
    quality?: 'low' | 'medium' | 'high' | 'auto';
}

export interface VideoGenerationRequest extends BaseGenerationRequest {
    duration?: number;
    resolution?: string;
    startFrame?: number;
    endFrame?: number;
    audio?: string;
}

export interface GenerationProgress {
    status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
    message?: string;
    progress?: number;
}

export interface ImageGenerationResult {
    success: boolean;
    images: GeneratedImage[];
    provider: string;
    duration?: number;
    error?: string;
}

export interface VideoGenerationResult {
    success: boolean;
    videos: GeneratedVideo[];
    provider: string;
    duration?: number;
    error?: string;
    storyboard?: Storyboard;
}

export interface GeneratedImage {
    url: string;
    filename: string;
    path: string;
    width?: number;
    height?: number;
    size?: number;
    mimeType?: string;
    format?: string;
}

export interface GeneratedVideo {
    url: string;
    filename: string;
    path: string;
    duration?: number;
    width?: number;
    height?: number;
    size?: number;
    mimeType?: string;
    format?: string;
}

export interface Storyboard {
    scenes: StoryboardScene[];
    totalDuration?: number;
}

export interface StoryboardScene {
    id: string;
    description: string;
    startTime?: number;
    endTime?: number;
    imageReference?: string;
}

// Configuration for media providers
export interface MediaProviderConfig {
    id: string;
    name: string;
    type: 'image' | 'video';
    description: string;
    config: Record<string, any>;
    enabled: boolean;
    apiKeyRequired: boolean;
}

// Event types for media provider operations
export type MediaEventType = 
    | 'generation-started'
    | 'generation-progress'
    | 'generation-completed'
    | 'generation-failed'
    | 'generation-cancelled'
    | 'provider-loaded'
    | 'provider-error';

export interface MediaEvent {
    type: MediaEventType;
    provider: string;
    timestamp: number;
    data?: any;
}

// Error types
export interface MediaError {
    code: string;
    message: string;
    provider: string;
    retryable: boolean;
}

// Result types
export type GenerationResult = ImageGenerationResult | VideoGenerationResult;

export interface MediaStatus {
    isProcessing: boolean;
    currentGeneration?: GenerationResult;
    activeGenerations: number;
    lastOperation?: MediaEvent;
}
