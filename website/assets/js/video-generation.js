// Video Generation Tool
// Real implementation of video generation with provider abstraction

import { VerteonState, Animations, DOM, subscribe, setState, getState } from './verteon-core.js';
import { MediaProviderInterface, VideoGenerationRequest, VideoGenerationResult, GeneratedVideo, Storyboard, MediaEventType, MediaError, GenerationProgress } from './media-provider.js';
import { showToast, setLoading, wireCopyButtons } from './ui-utils.js';

export class VideoGenerationTool {
    private providers: VideoProvider[] = [];
    private activeGenerations: Map<string, AbortController> = new Map();
    private status: MediaStatus = { isProcessing: false, activeGenerations: 0 };
    private subscribers: Map<string, Set<(event: MediaEvent) => void>> = new Map();

    constructor() {
        this.init();
    }

    init() {
        this.loadProviders();
        this.setupEventHandling();
        this.setupKeyboardShortcuts();
    }

    // Register a video provider
    registerProvider(provider: VideoProvider) {
        this.providers.push(provider);
        this.emitEvent('provider-loaded', {
            provider: provider.id,
            type: provider.type
        });
        console.log(`Registered video provider: ${provider.name} (${provider.id})`);
    }

    // Set the active provider
    setProvider(providerId: string): boolean {
        const provider = this.providers.find(p => p.id === providerId);
        if (provider) {
            VerteonState.currentVideoProvider = provider;
            return true;
        }
        return false;
    }

    // Generate a video
    async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
        const generationId = this.generateGenerationId();

        // Validate request
        const validation = this.validateVideoRequest(request);
        if (!validation.valid) {
            return {
                success: false,
                videos: [],
                provider: '',
                error: validation.error
            };
        }

        // Update status
        this.status.isProcessing = true;
        this.status.activeGenerations++;
        this.emitEvent('generation-started', {
            provider: request.provider || this.getCurrentProviderId(),
            generationId,
            request
        });

        try {
            // Show loading state
            this.updateUIForGeneration(true);

            // Get the selected provider
            const provider = this.getSelectedProvider();
            if (!provider) {
                throw new Error('No video provider selected');
            }

            // Emit progress update
            this.emitProgress('Preparing video generation...', 0, generationId);

            // Generate video
            const result = await this.performVideoGeneration(provider, request, generationId);

            // Emit completion event
            this.emitEvent('generation-completed', {
                provider: provider.id,
                generationId,
                result
            });

            // Save result
            await this.saveGenerationResult(result, request);

            // Emit progress complete
            this.emitProgress('Video generation complete', 100, generationId);

            return result;

        } catch (error) {
            const errorObj: MediaError = {
                code: 'GENERATION_FAILED',
                message: error instanceof Error ? error.message : 'Video generation failed',
                provider: this.getCurrentProviderId(),
                retryable: true
            };

            // Emit error event
            this.emitEvent('generation-failed', {
                provider: this.getCurrentProviderId(),
                generationId,
                error: errorObj
            });

            return {
                success: false,
                videos: [],
                provider: this.getCurrentProviderId(),
                error: errorObj.message
            };
        } finally {
            // Cleanup
            this.status.isProcessing = false;
            this.status.activeGenerations = Math.max(0, this.status.activeGenerisions - 1);
            this.activeGenerations.delete(generationId);
            this.updateUIForGeneration(false);
        }
    }

    // Cancel an active generation
    cancelGeneration(generationId: string): boolean {
        const controller = this.activeGenerations.get(generationId);
        if (controller) {
            controller.abort();
            this.activeGenerations.delete(generationId);
            this.status.activeGenerations = Math.max(0, this.status.activeGenerations - 1);
            this.emitEvent('generation-cancelled', {
                generationId,
                provider: this.getCurrentProviderId()
            });
            return true;
        }
        return false;
    }

    // Get current provider
    getSelectedProvider(): VideoProvider | null {
        return VerteonState.currentVideoProvider || null;
    }

    // Get current provider ID
    getCurrentProviderId(): string {
        return VerteonState.currentVideoProvider?.id || '';
    }

    // Validate video generation request
    validateVideoRequest(request: VideoGenerationRequest): { valid: boolean; error?: string } {
        if (!request.prompt?.trim()) {
            return { valid: false, error: 'Prompt is required' };
        }

        if (!request.provider && !this.getSelectedProvider()) {
            return { valid: false, error: 'No video provider selected' };
        }

        if (request.duration && (request.duration < 1 || request.duration > 60)) {
            return { valid: false, error: 'Duration must be between 1 and 60 seconds' };
        }

        if (request.resolution && !['720p', '1080p', '4k'].includes(request.resolution)) {
            return { valid: false, error: 'Resolution must be 720p, 1080p, or 4k' };
        }

        return { valid: true };
    }

    // Perform actual video generation
    private async performVideoGeneration(
        provider: VideoProvider,
        request: VideoGenerationRequest,
        generationId: string
    ): Promise<VideoGenerationResult> {
        // Create abort controller for cancellation support
        const controller = new AbortController();
        this.activeGenerations.set(generationId, controller);

        // Emit progress updates
        const emitProgress = (message: string, progress: number) => {
            this.emitProgress(message, progress, generationId);
        };

        try {
            emitProgress('Generating storyboard...', 10);

            // Create storyboard if not provided
            let storyboard = request.storyboard;
            if (!storyboard) {
                storyboard = await this.createStoryboard(request.prompt);
                emitProgress('Storyboard created', 20);
            }

            emitProgress('Rendering video scenes...', 40);

            // Prepare request for provider
            const providerRequest: VideoGenerationRequest = {
                ...request,
                provider: provider.id,
                outputDirectory: request.outputDirectory || 'verteon-generated/videos',
                filename: request.filename || `generated-video-${Date.now()}`
            };

            if (storyboard) {
                providerRequest.storyboard = storyboard;
            }

            // Call provider's generateVideo method
            const result = await provider.generateVideo.call(provider, providerRequest);

            if (!result.success) {
                throw new Error(result.error || 'Video generation failed');
            }

            emitProgress('Video generated successfully', 100);

            return result;

        } catch (error) {
            if (controller.signal.aborted) {
                throw new Error('Generation cancelled by user');
            }
            throw error;
        } finally {
            this.activeGenerations.delete(generationId);
        }
    }

    // Create a storyboard from prompt
    private async createStoryboard(prompt: string): Promise<Storyboard> {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call

        return {
            scenes: [
                {
                    id: 'scene-1',
                    description: `Opening scene showing: ${prompt}`,
                    startTime: 0,
                    endTime: 3,
                    imageReference: 'generated-image-1.png'
                },
                {
                    id: 'scene-2',
                    description: `Middle scene with additional context`,
                    startTime: 3,
                    endTime: 6,
                    imageReference: 'generated-image-2.png'
                },
                {
                    id: 'scene-3',
                    description: `Closing scene with result`,
                    startTime: 6,
                    endTime: 10,
                    imageReference: 'generated-image-3.png'
                }
            ],
            totalDuration: 10
        };
    }

    // Save generation result
    private async saveGenerationResult(
        result: VideoGenerationResult,
        request: VideoGenerationRequest
    ): Promise<void> {
        if (result.success && result.videos.length > 0) {
            for (const video of result.videos) {
                // In a real implementation, this would save the video to the workspace
                console.log(`Saved video: ${video.filename} -> ${video.path}`);

                // For now, just log the result
                showToast(`Video generated: ${video.filename}`, 'success');
            }
        }
    }

    // Update UI for generation state
    private updateUIForGeneration(isGenerating: boolean): void {
        const generateButton = DOM.$('#generateVideoBtn') as HTMLButtonElement;
        if (generateButton) {
            if (isGenerating) {
                setLoading(generateButton, true, 'Generating...');
                generateButton.disabled = true;
            } else {
                setLoading(generateButton, false);
                generateButton.disabled = false;
            }
        }
    }

    // Emit progress event
    private emitProgress(message: string, progress: number, generationId?: string): void {
        this.emitEvent('generation-progress', {
            type: 'generation-progress',
            provider: this.getCurrentProviderId(),
            timestamp: Date.now(),
            data: { message, progress, generationId }
        });
    }

    // Emit general event
    private emitEvent(type: MediaEventType, data: any): void {
        const event: MediaEvent = {
            type,
            provider: data.provider,
            timestamp: Date.now(),
            data
        };

        // Notify subscribers
        const subscribers = this.subscribers.get(type);
        if (subscribers) {
            subscribers.forEach(callback => callback(event));
        }
    }

    // Subscribe to media events
    subscribeToEvents(type: MediaEventType, callback: (event: MediaEvent) => void): () => void {
        if (!this.subscribers.has(type)) {
            this.subscribers.set(type, new Set());
        }
        this.subscribers.get(type)?.add(callback);

        // Return unsubscribe function
        return () => {
            this.subscribers.get(type)?.delete(callback);
        };
    }

    // Setup event handling
    private setupEventHandling(): void {
        // Listen for UI updates and state changes
        subscribe('agentState', (state) => {
            if (state === 'thinking') {
                this.status.isProcessing = true;
            } else if (state === 'idle') {
                this.status.isProcessing = false;
            }
        });
    }

    // Setup keyboard shortcuts
    private setupKeyboardShortcuts(): void {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                this.generateVideoFromUI();
            }
        });
    }

    // Generate video from UI elements
    generateVideoFromUI(): void {
        const promptInput = DOM.$('#videoPrompt') as HTMLTextAreaElement;
        const providerSelect = DOM.$('#videoProviderSelect') as HTMLSelectElement;

        if (!promptInput || !providerSelect) return;

        const request: VideoGenerationRequest = {
            prompt: promptInput.value,
            provider: providerSelect.value,
            duration: 10, // default
            resolution: '1080p', // default
            aspectRatio: '16:9', // default
            style: 'cinematic' // default
        };

        this.generateVideo(request);
    }

    // Load mock providers for demonstration
    private loadProviders(): void {
        this.addMockProviders();
    }

    // Add mock providers for testing
    private addMockProviders(): void {
        // Mock Video generation provider
        const mockVideoProvider: VideoProvider = {
            id: 'video-generator-pro',
            name: 'Video Generator Pro',
            type: 'video',
            description: 'Professional video generation with AI',
            async generateVideo(request: VideoGenerationRequest) {
                await new Promise(resolve => setTimeout(resolve, 4000)); // Simulate API call
                return {
                    success: true,
                    videos: [
                        {
                            url: 'https://example.com/generated-video-1.mp4',
                            filename: 'generated-video-1.mp4',
                            path: 'verteon-generated/videos/generated-video-1.mp4',
                            duration: 10,
                            width: 1920,
                            height: 1080,
                            size: 15000000,
                            mimeType: 'video/mp4',
                            format: 'MP4'
                        }
                    ],
                    provider: this.id,
                    duration: 10,
                    storyboard: {
                        scenes: [
                            { id: 'scene-1', description: 'Opening scene', startTime: 0, endTime: 3 },
                            { id: 'scene-2', description: 'Middle scene', startTime: 3, endTime: 6 },
                            { id: 'scene-3', description: 'Closing scene', startTime: 6, endTime: 10 }
                        ],
                        totalDuration: 10
                    }
                };
            }
        };

        // Mock Another Video provider
        const mockAnotherVideoProvider: VideoProvider = {
            id: 'video-forge-xl',
            name: 'Video Forge XL',
            type: 'video',
            description: 'High-quality video generation with style control',
            async generateVideo(request: VideoGenerationRequest) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate API call
                return {
                    success: true,
                    videos: [
                        {
                            url: 'https://example.com/video-forge-1.mp4',
                            filename: 'video-forge-1.mp4',
                            path: 'verteon-generated/videos/video-forge-1.mp4',
                            duration: 15,
                            width: 1280,
                            height: 720,
                            size: 12000000,
                            mimeType: 'video/mp4',
                            format: 'MP4'
                        }
                    ],
                    provider: this.id,
                    duration: 15,
                    storyboard: {
                        scenes: [
                            { id: 'scene-1', description: 'Opening scene', startTime: 0, endTime: 5 },
                            { id: 'scene-2', description: 'Development scene', startTime: 5, endTime: 10 },
                            { id: 'scene-3', description: 'Completion scene', startTime: 10, endTime: 15 }
                        ],
                        totalDuration: 15
                    }
                };
            }
        };

        this.registerProvider(mockVideoProvider);
        this.registerProvider(mockAnotherVideoProvider);

        // Set default provider
        this.setProvider('video-generator-pro');
    }

    // Generate aspect ratio from prompt analysis
    inferAspectRatioFromPrompt(prompt: string): string {
        const lowerPrompt = prompt.toLowerCase();

        if (lowerPrompt.includes('portrait') || lowerPrompt.includes('vertical')) {
            return '9:16';
        }

        if (lowerPrompt.includes('square') || lowerPrompt.includes('thumbnail')) {
            return '1:1';
        }

        if (lowerPrompt.includes('landscape') || lowerPrompt.includes('horizontal')) {
            return '16:9';
        }

        if (lowerPrompt.includes('cinematic') || lowerPrompt.includes('wide screen')) {
            return '21:9';
        }

        return '16:9'; // default
    }

    // Generate generation ID
    private generateGenerationId(): string {
        return `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Public API methods
    getProviders(): VideoProvider[] {
        return this.providers.slice();
    }

    getStatus(): MediaStatus {
        return { ...this.status };
    }

    isGenerating(): boolean {
        return this.status.isProcessing && this.status.activeGenerations > 0;
    }

    async generateVideoFromUIWithValidation(): Promise<void> {
        const promptInput = DOM.$('#videoPrompt') as HTMLTextAreaElement;
        const providerSelect = DOM.$('#videoProviderSelect') as HTMLSelectElement;

        if (!promptInput?.value.trim()) {
            showToast('Please enter a prompt for video generation', 'error');
            return;
        }

        if (!providerSelect?.value) {
            showToast('Please select a video provider', 'error');
            return;
        }

        const request: VideoGenerationRequest = {
            prompt: promptInput.value,
            provider: providerSelect.value,
            duration: 10,
            resolution: '1080p',
            aspectRatio: this.inferAspectRatioFromPrompt(promptInput.value),
            style: 'cinematic'
        };

        await this.generateVideo(request);
    }
}

// Global instance
const videoGenerationTool = new VideoGenerationTool();

export default videoGenerationTool;

// Export for backward compatibility
export const generateVideo = (request: VideoGenerationRequest) => videoGenerationTool.generateVideo(request);
export const getVideoProviders = () => videoGenerationTool.getProviders();
export const setVideoProvider = (providerId: string) => videoGenerationTool.setProvider(providerId);
export const isVideoGenerating = () => videoGenerationTool.isGenerating();
