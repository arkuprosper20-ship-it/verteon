// Media Generation UI Integration
// Integration of image and video generation interfaces with existing Verteon UI

import { VerteonState, Animations, DOM, subscribe, setState, getState } from './verteon-core.js';
import { imageGenerationTool, videoGenerationTool } from './image-generation.js';
import { MediaIntentDetector, detectMediaIntent, isMediaRequest } from './intent-detection.js';
import { showToast, setLoading, wireCopyButtons, animateOnScroll } from './ui-utils.js';

export class MediaGenerationUI {
    private imageGenerationPanel: HTMLElement | null = null;
    private videoGenerationPanel: HTMLElement | null = null;
    private mediaToggleButton: HTMLElement | null = null;
    private activePanel: 'image' | 'video' | null = null;
    private intentDetector: MediaIntentDetector;

    constructor() {
        this.intentDetector = new MediaIntentDetector();\n        this.init();
    }

    init() {
        this.createMediaToggle();
        this.createImageGenerationPanel();
        this.createVideoGenerationPanel();
        this.setupEventListeners();
        this.setupAutoDetection();
    }

    // Create media toggle button in the navigation
    private createMediaToggle(): void {
        const navContainer = DOM.$('.nav-container');
        if (!navContainer) return;

        this.mediaToggleButton = DOM.create('button', {
            class: 'nav-link',
            style: 'background: var(--gradient-primary); color: white; padding: 0.5rem 1rem; border-radius: var(--radius-md); margin-left: 1rem; font-size: 0.875rem; font-weight: 600;'
        }, 'Generate Media');

        navContainer.appendChild(this.mediaToggleButton);

        this.mediaToggleButton.addEventListener('click', () => {
            this.toggleMediaPanel();
        });
    }

    // Create image generation panel
    private createImageGenerationPanel(): void {
        const app = DOM.$('.app');
        if (!app) return;

        this.imageGenerationPanel = DOM.create('div', {
            class: 'panel d-none',
            id: 'imageGenerationPanel'
        }, [
            // Header
            DOM.create('div', {
                class: 'container'
            }, [
                DOM.create('div', {
                    class: 'text-center mb-5'
                }, [
                    DOM.create('h2', {
                        class: 'h2'
                    }, 'Generate Image'),
                    DOM.create('p', {
                        class: 'p',
                        style: 'color: var(--text-tertiary);'
                    }, 'Create images using AI with natural language prompts')
                ])
            ]),

            // Main content
            DOM.create('div', {
                class: 'container'
            }, [
                DOM.create('div', {
                    class: 'grid grid-2'
                }, [
                    // Left panel - prompt input
                    DOM.create('div', { class: 'card' }, [
                        DOM.create('h3', {
                            class: 'card-title'
                        }, 'Prompt'),

                        DOM.create('div', {
                            class: 'form-group'
                        }, [
                            DOM.create('label', {
                                class: 'form-label',
                                for: 'imagePrompt'
                            }, 'Describe the image you want to generate:'),
                            DOM.create('textarea', {
                                id: 'imagePrompt',
                                class: 'form-input',
                                style: 'min-height: 120px; resize: vertical;',
                                placeholder: 'Create a futuristic AI coding workspace...'
                            })
                        ]),

                        // Provider selection
                        DOM.create('div', {
                            class: 'form-group'
                        }, [
                            DOM.create('label', {
                                class: 'form-label',
                                for: 'imageProvider'
                            }, 'Image Provider:'),
                            DOM.create('select', {
                                id: 'imageProvider',
                                class: 'form-select'
                            }, [
                                DOM.create('option', {
                                    value: 'dall-e-3'
                                }, 'DALL·E 3'),
                                DOM.create('option', {
                                    value: 'stable-diffusion-xl'
                                }, 'Stable Diffusion XL'),
                                DOM.create('option', {
                                    value: 'video-generator-pro'
                                }, 'Video Generator Pro')
                            ])
                        ]),

                        // Aspect ratio selection
                        DOM.create('div', {
                            class: 'form-group'
                        }, [
                            DOM.create('label', {
                                class: 'form-label',
                                for: 'aspectRatio'
                            }, 'Aspect Ratio:'),
                            DOM.create('select', {
                                id: 'aspectRatio',
                                class: 'form-select'
                            }, [
                                DOM.create('option', {
                                    value: '1:1'
                                }, 'Square (1:1)'),
                                DOM.create('option', {
                                    value: '16:9'
                                }, 'Landscape (16:9)'),
                                DOM.create('option', {
                                    value: '9:16'
                                }, 'Portrait (9:16)'),
                                DOM.create('option', {
                                    value: '21:9'
                                }, 'Cinematic (21:9)')
                            ])
                        ]),

                        // Quality selection
                        DOM.create('div', {
                            class: 'form-group'
                        }, [
                            DOM.create('label', {
                                class: 'form-label',
                                for: 'quality'
                            }, 'Quality:'),
                            DOM.create('select', {
                                id: 'imageQuality',
                                class: 'form-select'
                            }, [
                                DOM.create('option', {
                                    value: 'high'
                                }, 'High'),
                                DOM.create('option', {
                                    value: 'medium'
                                }, 'Medium'),
                                DOM.create('option', {
                                    value: 'low'
                                }, 'Low')
                            ])
                        ]),

                        // Generate button
                        DOM.create('button', {
                            id: 'generateImageBtn',
                            class: 'btn btn-primary',
                            style: 'width: 100%; margin-top: 1rem;'
                        }, 'Generate Image')
                    ]),

                    // Right panel - preview and options
                    DOM.create('div', { class: 'card' }, [
                        DOM.create('h3', {
                            class: 'card-title'
                        }, 'Preview & Options'),

                        // Preview area
                        DOM.create('div', {
                            class: 'mb-4',
                            style: 'border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; min-height: 200px; background: var(--surface);'
                        }, [
                            DOM.create('div', {
                                class: 'text-center',
                                style: 'color: var(--text-tertiary); padding: 3rem;'
                            }, 'Generated images will appear here')
                        ]),

                        // Quick actions
                        DOM.create('div', {
                            class: 'd-flex',
                            style: 'gap: 0.5rem; margin-bottom: 1rem;'
                        }, [
                            DOM.create('button', {
                                class: 'btn btn-outline',
                                style: 'flex: 1; font-size: 0.875rem;'
                            }, 'Save'),
                            DOM.create('button', {
                                class: 'btn btn-outline',
                                style: 'flex: 1; font-size: 0.

    }

    // Create video generation panel
    private createVideoGenerationPanel(): void {
        const app = DOM.$('.app');
        if (!app) return;

        this.videoGenerationPanel = DOM.create('div', {
            class: 'panel d-none',
            id: 'videoGenerationPanel'
        }, [
            // Header
            DOM.create('div', {
                class: 'container'
            }, [
                DOM.create('div', {
                    class: 'text-center mb-5'
                }, [
                    DOM.create('h2', {
                        class: 'h2'
                    }, 'Generate Video'),
                    DOM.create('p', {
                        class: 'p',
                        style: 'color: var(--text-tertiary);'
                    }, 'Create videos using AI with natural language prompts')
                ])
            ]),

            // Main content
            DOM.create('div', {
                class: 'container'
            }, [
                DOM.create('div', {
                    class: 'grid grid-2'
                }, [
                    // Left panel - prompt input
                    DOM.create('div', { class: 'card' }, [
                        DOM.create('h3', {
                            class: 'card-title'
                        }, 'Prompt'),

                        DOM.create('div', {
                            class: 'form-group'
                        }, [
                            DOM.create('label', {
                                class: 'form-label',
                                for: 'videoPrompt'
                            }, 'Describe the video you want to generate:'),
                            DOM.create('textarea', {
                                id: 'videoPrompt',
                                class: 'form-input',
                                style: 'min-height: 120px; resize: vertical;'
                            })
                        ]),

                        // Duration selection
                        DOM.create('div', {
                            class: 'form-group'
                        }, [
                            DOM.create('label', {
                                class: 'form-label',
                                for: 'duration'
                            }, 'Duration (seconds):'),
                            DOM.create('select', {
                                id: 'videoDuration',
                                class: 'form-select'
                            }, [
                                DOM.create('option', {
                                    value: '5'
                                }, '5 seconds'),
                                DOM.create('option', {
                                    value: '10'
                                }, '10 seconds'),
                                DOM.create('option', {
                                    value: '15'
                                }, '15 seconds'),
                                DOM.create('option', {
                                    value: '30'
                                }, '30 seconds'),
                                DOM.create('option', {
                                    value: '60'
                                }, '60 seconds')
                            ])
                        ]),

                        // Aspect ratio selection
                        DOM.create('div', {
                            class: 'form-group'
                        }, [
                            DOM.create('label', {
                                class: 'form-label',
                                for: 'aspectRatio'
                            }, 'Aspect Ratio:'),
                            DOM.create('select', {
                                id: 'videoAspectRatio',
                                class: 'form-select'
                            }, [
                                DOM.create('option', {
                                    value: '16:9'
                                }, 'Landscape (16:9)'),
                                DOM.create('option', {
                                    value: '9:16'
                                }, 'Portrait (9:16)'),
                                DOM.create('option', {
                                    value: '1:1'
                                }, 'Square (1:1)'),
                                DOM.create('option', {
                                    value: '21:9'
                                }, 'Cinematic (21:9)')
                            ])
                        ]),

                        // Style selection
                        DOM.create('div', {
                            class: 'form-group'
                        }, [
                            DOM.create('label', {
                                class: 'form-label',
                                for: 'style'
                            }, 'Style:'),
                            DOM.create('select', {
                                id: 'videoStyle',
                                class: 'form-select'
                            }, [
                                DOM.create('option', {
                                    value: 'cinematic'
                                }, 'Cinematic'),
                                DOM.create('option', {
                                    value: 'animation'
                                }, 'Animation'),
                                DOM.create('option', {
                                    value: 'artistic'
                                }, 'Artistic'),
                                DOM.create('option', {
                                    value: 'realistic'
                                }, 'Realistic'),
                                DOM.create('option', {
                                    value: 'cartoon'
                                }, 'Cartoon')
                            ])
                        ]),

                        // Generate button
                        DOM.create('button', {
                            id: 'generateVideoBtn',
                            class: 'btn btn-primary',
                            style: 'width: 100%; margin-top: 1rem;'
                        }, 'Generate Video')
                    ]),

                    // Right panel - preview and options
                    DOM.create('div', { class: 'card' }, [
                        DOM.create('h3', {
                            class: 'card-title'
                        }, 'Preview & Options'),

                        // Preview area
                        DOM.create('div', {
                            class: 'mb-4',
                            style: 'border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; min-height: 200px; background: var(--surface);'
                        }, [
                            DOM.create('div', {
                                class: 'text-center',
                                style: 'color: var(--text-tertiary); padding: 3rem;'
                            }, 'Generated videos will appear here')
                        ]),

                        // Quick actions
                        DOM.create('div', {
                            class: 'd-flex',
                            style: 'gap: 0.5rem; margin-bottom: 1rem;'
                        }, [
                            DOM.create('button', {
                                class: 'btn btn-outline',
                                style: 'flex: 1; font-size: 0.875rem;'
                            }, 'Save'),
                            DOM.create('button', {
                                class: 'btn btn-outline',
                                style: 'flex: 1; font-size: 0.875rem;'
                            }, 'Storyboard')
                        ])
                    ])
                ])
            ])
        ]);

        // Add the video panel to the app
        app.appendChild(this.videoGenerationPanel);
    }

    // Toggle between media panels
    toggleMediaPanel(): void {
        if (this.activePanel === 'image') {
            this.imageGenerationPanel?.classList.add('d-none');
            this.videoGenerationPanel?.classList.remove('d-none');
            this.activePanel = 'video';
            this.updateGenerateButtonText();
        } else {
            this.imageGenerationPanel?.classList.remove('d-none');
            this.videoGenerationPanel?.classList.add('d-none');
            this.activePanel = 'image';
            this.updateGenerateButtonText();
        }
    }

    // Update generate button text based on active panel
    private updateGenerateButtonText(): void {
        const generateBtn = DOM.$('#generateImageBtn') as HTMLButtonElement;
        if (generateBtn) {
            generateBtn.textContent = this.activePanel === 'image' ? 'Generate Image' : 'Generate Video';
        }
    }

    // Setup event listeners
    private setupEventListeners(): void {
        // Image generation button
        DOM.$('#generateImageBtn')?.addEventListener('click', () => {
            this.generateImageFromUI();
        });

        // Video generation button
        DOM.$('#generateVideoBtn')?.addEventListener('click', () => {
            this.generateVideoFromUI();
        });

        // Auto-detection of media requests
        this.setupAutoDetection();
    }

    // Setup auto-detection for existing text inputs
    private setupAutoDetection(): void {
        // Monitor for changes in common text areas
        const textAreas = DOM.$$('textarea, input[type="text"][placeholder]');

        textAreas.forEach(textArea => {
            textArea.addEventListener('input', (e) => {
                const target = e.target as HTMLTextAreaElement | HTMLInputElement;
                const value = target.value;

                if (isMediaRequest(value)) {
                    this.showMediaSuggestion(target);
                }
            });
        });
    }

    // Show media generation suggestion
    private showMediaSuggestion(element: Element): void {
        // Add a subtle visual cue that media generation is available
        element.classList.add('media-input-hint');
        element.title = 'Press Ctrl+Enter to generate media';
    }

    // Generate image from UI elements
    generateImageFromUI(): void {
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

        const request = this.createImageGenerationRequest(promptInput.value, providerSelect.value);
        this.generateImageTool?.generateImage(request);
    }

    // Generate video from UI elements
    generateVideoFromUI(): void {
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

        const request = this.createVideoGenerationRequest(promptInput.value, providerSelect.value);
        this.generateVideoTool?.generateVideo(request);
    }

    // Create image generation request
    private createImageGenerationRequest(prompt: string, provider: string): any {
        return {
            prompt,
            provider,
            width: 1024,
            height: 1024,
            aspectRatio: this.inferAspectRatioFromPrompt(prompt),
            quality: 'high'
        };
    }

    // Create video generation request
    private createVideoGenerationRequest(prompt: string, provider: string): any {
        return {
            prompt,
            provider,
            duration: this.getSuggestedDurationFromPrompt(prompt),
            aspectRatio: this.inferAspectRatioFromPrompt(prompt),
            style: this.getSuggestedStyleFromPrompt(prompt),
            resolution: '1080p'
        };
    }

    // Infer aspect ratio from prompt
    private inferAspectRatioFromPrompt(prompt: string): string {
        return intentDetector.getSuggestedAspectRatio(prompt);
    }

    // Get suggested duration from prompt
    private getSuggestedDurationFromPrompt(prompt: string): number {
        return intentDetector.getSuggestedDuration(prompt);
    }

    // Get suggested style from prompt
    private getSuggestedStyleFromPrompt(prompt: string): string {
        return intentDetector.getSuggestedStyle(prompt);
    }

    // Update status for generation progress
    updateGenerationStatus(
        isGenerating: boolean,
        generationId?: string
    ): void {
        setState('generatingMedia', isGenerating);

        if (generationId) {
            setState('currentGenerationId', generationId);
        }
    }

    // Show generation error
    showGenerationError(error: string): void {
        showToast(error, 'error');
    }

    // Show generation success
    showGenerationSuccess(message: string): void {
        showToast(message, 'success');
    }
}

// Global media UI instance
const mediaGenerationUI = new MediaGenerationUI();

// Export for backward compatibility
export const initMediaGenerationUI = () => mediaGenerationUI;
export const showMediaGenerationPanel = (panel: 'image' | 'video') => {
    mediaGenerationUI.activePanel = panel;
    mediaGenerationUI.toggleMediaPanel();
};
