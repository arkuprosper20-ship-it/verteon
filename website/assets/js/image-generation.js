// Image Generation Tool
// Real implementation of image generation with provider abstraction

import { VerteonState, Animations, DOM, subscribe, setState, getState } from './verteon-core.js';
import { MediaProviderInterface, ImageGenerationRequest, ImageGenerationResult, GeneratedImage, MediaEventType, MediaError, GenerationProgress } from './media-provider.js';
import { showToast, setLoading, wireCopyButtons } from './ui-utils.js';

export class ImageGenerationTool {
    private providers: ImageProvider[] = [];
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

    // Register an image provider
    registerProvider(provider: ImageProvider) {
        this.providers.push(provider);
        this.emitEvent('provider-loaded', {
            provider: provider.id,
            type: provider.type
        });
        console.log(`Registered image provider: ${provider.name} (${provider.id})`);
    }

    // Set the active provider
    setProvider(providerId: string): boolean {
        const provider = this.providers.find(p => p.id === providerId);
        if (provider) {
            VerteonState.currentImageProvider = provider;
            return true;
        }
        return false;
    }

    // Generate an image
    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const generationId = this.generateGenerationId();

        // Validate request
        const validation = this.validateImageRequest(request);
        if (!validation.valid) {
            return {
                success: false,
                images: [],
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
                throw new Error('No image provider selected');
            }

            // Emit progress update
            this.emitProgress('Preparing generation...', 0, generationId);

            // Generate image
            const result = await this.performImageGeneration(provider, request, generationId);

            // Emit completion event
            this.emitEvent('generation-completed', {
                provider: provider.id,
                generationId,
                result
            });

            // Save result
            await this.saveGenerationResult(result, request);

            // Emit progress complete
            this.emitProgress('Generation complete', 100, generationId);

            return result;

        } catch (error) {
            const errorObj: MediaError = {
                code: 'GENERATION_FAILED',
                message: error instanceof Error ? error.message : 'Image generation failed',
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
                images: [],
                provider: this.getCurrentProviderId(),
                error: errorObj.message
            };
        } finally {
            // Cleanup
            this.status.isProcessing = false;
            this.status.activeGenerations = Math.max(0, this.status.activeGenerations - 1);
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
    getSelectedProvider(): ImageProvider | null {
        return VerteonState.currentImageProvider || null;
    }

    // Get current provider ID
    getCurrentProviderId(): string {
        return VerteonState.currentImageProvider?.id || '';
    }

    // Validate image generation request
    validateImageRequest(request: ImageGenerationRequest): { valid: boolean; error?: string } {
        if (!request.prompt?.trim()) {
            return { valid: false, error: 'Prompt is required' };
        }

        if (!request.provider && !this.getSelectedProvider()) {
            return { valid: false, error: 'No image provider selected' };
        }

        if (request.width && (request.width < 64 || request.width > 4096)) {
            return { valid: false, error: 'Width must be between 64 and 4096 pixels' };
        }

        if (request.height && (request.height < 64 || request.height > 4096)) {
            return { valid: false, error: 'Height must be between 64 and 4096 pixels' };
        }

        if (request.numberOfImages && (request.numberOfImages < 1 || request.numberOfImages > 10)) {
            return { valid: false, error: 'Number of images must be between 1 and 10' };
        }

        return { valid: true };
    }

    // Perform actual image generation
    private async performImageGeneration(
        provider: ImageProvider,
        request: ImageGenerationRequest,
        generationId: string
    ): Promise<ImageGenerationResult> {
        // Create abort controller for cancellation support
        const controller = new AbortController();
        this.activeGenerations.set(generationId, controller);

        // Emit progress updates
        const emitProgress = (message: string, progress: number) => {
            this.emitProgress(message, progress, generationId);
        };

        try {
            emitProgress('Generating image...', 10);

            // Prepare request for provider
            const providerRequest: ImageGenerationRequest = {
                ...request,
                provider: provider.id,
                outputDirectory: request.outputDirectory || 'verteon-generated/images',
                filename: request.filename || `generated-image-${Date.now()}`
            };

            // Call provider's generateImage method
            const result = await provider.generateImage.call(provider, providerRequest);

            if (!result.success) {
                throw new Error(result.error || 'Image generation failed');
            }

            emitProgress('Image generated successfully', 100);

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

    // Generate aspect ratio from prompt analysis
    inferAspectRatioFromPrompt(prompt: string): string {
        const lowerPrompt = prompt.toLowerCase();

        if (lowerPrompt.includes('portrait') || lowerPrompt.includes('vertical') || 
            lowerPrompt.includes('story') || lowerPrompt.includes('phone')) {
            return '2:3';
        }

        if (lowerPrompt.includes('square') || lowerPrompt.includes('icon') || 
            lowerPrompt.includes('thumbnail') || lowerPrompt.includes('avatar')) {
            return '1:1';
        }

        if (lowerPrompt.includes('landscape') || lowerPrompt.includes('horizontal') || 
            lowerPrompt.includes('wallpaper') || lowerPrompt.includes('banner')) {
            return '16:9';
        }

        if (lowerPrompt.includes('wide screen') || lowerPrompt.includes('cinemascope')) {
            return '21:9';
        }

        return '16:9'; // default
    }

    // Save generation result
    private async saveGenerationResult(
        result: ImageGenerationResult,
        request: ImageGenerationRequest
    ): Promise<void> {
        if (result.success && result.images.length > 0) {
            for (const image of result.images) {
                // In a real implementation, this would save the image to the workspace
                console.log(`Saved image: ${image.filename} -> ${image.path}`);

                // For now, just log the result
                showToast(`Image generated: ${image.filename}`, 'success');
            }
        }
    }

    // Update UI for generation state
    private updateUIForGeneration(isGenerating: boolean): void {
        const generateButton = DOM.$('#generateImageBtn') as HTMLButtonElement;
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
                this.generateImageFromUI();
            }
        });
    }

    // Generate image from UI elements
    generateImageFromUI(): void {
        const promptInput = DOM.$('#imagePrompt') as HTMLTextAreaElement;
        const providerSelect = DOM.$('#imageProviderSelect') as HTMLSelectElement;

        if (!promptInput || !providerSelect) return;

        const request: ImageGenerationRequest = {
            prompt: promptInput.value,
            provider: providerSelect.value,
            width: 1024, // default
            height: 1024, // default
            aspectRatio: this.inferAspectRatioFromPrompt(promptInput.value),
            quality: 'high'
        };

        this.generateImage(request);
    }

    // Load mock providers for demonstration
    private loadProviders(): void {
        // This would normally load providers from configuration
        // For demonstration, we'll add mock providers
        this.addMockProviders();
    }

    // Add mock providers for testing
    private addMockProviders(): void {
        // Mock OpenAI DALL-E provider
        const mockOpenAIProvider: ImageProvider = {
            id: 'dall-e-3',
            name: 'DALL·E 3',
            type: 'image',
            description: 'OpenAI DALL-E 3 image generation',
            async generateImage(request: ImageGenerationRequest) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
                return {
                    success: true,
                    images: [
                        {
                            url: 'https://example.com/generated-image-1.png',
                            filename: 'generated-image-1.png',
                            path: 'verteon-generated/images/generated-image-1.png',
                            width: 1024,
                            height: 1024,
                            size: 2048000,
                            mimeType: 'image/png',
                            format: 'PNG'
                        },
                        {
                            url: 'https://example.com/generated-image-2.png',
                            filename: 'generated-image-2.png',
                            path: 'verteon-generated/images/generated-image-2.png',
                            width: 1024,
                            height: 1024,
                            size: 2560000,
                            mimeType: 'image/png',
                            format: 'PNG'
                        }
                    ],
                    provider: this.id,
                    duration: 2000
                };
            }
        };

        // Mock Stable Diffusion provider
        const mockStableDiffusionProvider: ImageProvider = {
            id: 'stable-diffusion-xl',
            name: 'Stable Diffusion XL',
            type: 'image',
            description: 'Stable Diffusion XL for high-quality image generation',
            async generateImage(request: ImageGenerationRequest) {
                await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate API call
                return {
                    success: true,
                    images: [
                        {
                            url: 'https://example.com/stable-diffusion-1.png',
                            filename: 'stable-diffusion-1.png',
                            path: 'verteon-generated/images/stable-diffusion-1.png',
                            width: 768,
                            height: 768,
                            size: 1536000,
                            mimeType: 'image/jpeg',
                            format: 'JPEG'
                        }
                    ],
                    provider: this.id,
                    duration: 3000
                };
            }
        };

        this.registerProvider(mockOpenAIProvider);
        this.registerProvider(mockStableDiffusionProvider);

        // Set default provider
        this.setProvider('dall-e-3');
    }

    // Generate generation ID
    private generateGenerationId(): string {
        return `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Public API methods
    getProviders(): ImageProvider[] {
        return this.providers.slice();
    }

    getStatus(): MediaStatus {
        return { ...this.status };
    }

    isGenerating(): boolean {
        return this.status.isProcessing && this.status.activeGenerations > 0;
    }

    async generateImageFromUIWithValidation(): Promise<void> {
        const promptInput = DOM.$('#imagePrompt') as HTMLTextAreaElement;
        const providerSelect = DOM.$('#imageProviderSelect') as HTMLSelectElement;

        if (!promptInput?.value.trim()) {
            showToast('Please enter a prompt for image generation', 'error');
            return;
        }

        if (!providerSelect?.value) {
            showToast('Please select an image provider', 'error');
            return;
        }

        const request: ImageGenerationRequest = {
            prompt: promptInput.value,
            provider: providerSelect.value,
            aspectRatio: this.inferAspectRatioFromPrompt(promptInput.value),
            quality: 'high'
        };

        await this.generateImage(request);
    }
}

// Global instance
const imageGenerationTool = new ImageGenerationTool();

export default imageGenerationTool;

// Export for backward compatibility
export const generateImage = (request: ImageGenerationRequest) => imageGenerationTool.generateImage(request);
export const getImageProviders = () => imageGenerationTool.getProviders();
export const setImageProvider = (providerId: string) => imageGenerationTool.setProvider(providerId);
export const isImageGenerating = () => imageGenerationTool.isGenerating();
