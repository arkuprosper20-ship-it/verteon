/**
 * Verteon Interactive Core
 * Central state management and component registry for the interactive website.
 */

// Global state
export const VerteonState = {
    // Agent states: 'idle' | 'thinking' | 'using-tool' | 'waiting-approval' | 'completed' | 'error'
    agentState: 'idle',
    // Provider states: 'disconnected' | 'connecting' | 'connected' | 'error'
    providerState: 'connected',
    // Terminal states: 'idle' | 'running' | 'completed' | 'failed'
    terminalState: 'idle',
    // Current provider and model
    currentProvider: 'ollama',
    currentModel: 'qwen2.5-coder:7b',
    // Active sidebar panel
    activePanel: 'agent',
    // Mobile menu open state
    mobileMenuOpen: false,
    // Reduced motion preference
    reducedMotion: false,
    // Animation preferences
    animationsEnabled: true,
};

// State subscribers
const subscribers = new Map();

export function subscribe(key, callback) {
    if (!subscribers.has(key)) {
        subscribers.set(key, new Set());
    }
    subscribers.get(key).add(callback);
    return () => {
        const set = subscribers.get(key);
        if (set) set.delete(callback);
    };
}

export function setState(key, value) {
    if (VerteonState[key] !== undefined) {
        VerteonState[key] = value;
        const set = subscribers.get(key);
        if (set) {
            set.forEach(cb => cb(value));
        }
    }
}

export function getState(key) {
    return VerteonState[key];
}

// Animation utilities
export const Animations = {
    // Smooth transitions with optional reduced-motion support
    async transition(element, properties, options = {}) {
        const { duration = 300, easing = 'cubic-bezier(0.4, 0, 0.2, 1)' } = options;
        
        if (VerteonState.reducedMotion) {
            Object.assign(element.style, properties);
            return Promise.resolve();
        }
        
        return new Promise(resolve => {
            const onEnd = () => {
                element.removeEventListener('transitionend', onEnd);
                resolve();
            };
            element.addEventListener('transitionend', onEnd, { once: true });
            
            element.style.transition = `all ${duration}ms ${easing}`;
            Object.assign(element.style, properties);
        });
    },

    // Spring-like animation using Web Animations API
    spring(element, keyframes, options = {}) {
        if (VerteonState.reducedMotion) {
            const lastFrame = keyframes[keyframes.length - 1];
            Object.assign(element.style, lastFrame);
            return Promise.resolve();
        }
        
        const { duration = 400, easing = 'cubic-bezier(0.34, 1.56, 0.64, 1)' } = options;
        const animation = element.animate(keyframes, { duration, easing, fill: 'forwards' });
        return animation.finished;
    },

    // Fade in/out
    fadeIn(element, duration = 200) {
        return this.transition(element, { opacity: '1', transform: 'translateY(0)' }, { duration });
    },

    fadeOut(element, duration = 200) {
        return this.transition(element, { opacity: '0', transform: 'translateY(10px)' }, { duration });
    },

    // Scale animation for buttons/logo
    press(element, scale = 0.96) {
        return this.spring(element, [
            { transform: 'scale(1)' },
            { transform: `scale(${scale})` },
            { transform: 'scale(1)' }
        ], { duration: 150 });
    },

    // Slide in/out for panels
    slideIn(element, direction = 'right', duration = 300) {
        const transforms = {
            right: 'translateX(0)',
            left: 'translateX(0)',
            top: 'translateY(0)',
            bottom: 'translateY(0)'
        };
        const startTransforms = {
            right: 'translateX(100%)',
            left: 'translateX(-100%)',
            top: 'translateY(-100%)',
            bottom: 'translateY(100%)'
        };
        element.style.transform = startTransforms[direction];
        element.style.opacity = '0';
        requestAnimationFrame(() => {
            return this.transition(element, { 
                transform: transforms[direction], 
                opacity: '1' 
            }, { duration });
        });
    },

    slideOut(element, direction = 'right', duration = 300) {
        const endTransforms = {
            right: 'translateX(100%)',
            left: 'translateX(-100%)',
            top: 'translateY(-100%)',
            bottom: 'translateY(100%)'
        };
        return this.transition(element, { 
            transform: endTransforms[direction], 
            opacity: '0' 
        }, { duration });
    }
};

// DOM utilities
export const DOM = {
    // Create element with attributes and children
    create(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => {
            if (key === 'class') el.className = value;
            else if (key === 'style') Object.assign(el.style, value);
            else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (key === 'dataset') {
                Object.entries(value).forEach(([k, v]) => el.dataset[k] = v);
            } else {
                el.setAttribute(key, value);
            }
        });
        children.forEach(child => {
            if (typeof child === 'string') el.appendChild(document.createTextNode(child));
            else if (child instanceof Node) el.appendChild(child);
        });
        return el;
    },

    // Safe query selector
    $(selector, root = document) {
        return root.querySelector(selector);
    },

    $$(selector, root = document) {
        return Array.from(root.querySelectorAll(selector));
    },

    // Add/remove/toggle classes with animation support
    addClass(el, ...classes) { el.classList.add(...classes); },
    removeClass(el, ...classes) { el.classList.remove(...classes); },
    toggleClass(el, className, force) { el.classList.toggle(className, force); },
    hasClass(el, className) { return el.classList.contains(className); }
};

// Keyboard utilities
export const Keyboard = {
    bindings: new Map(),
    
    bind(key, callback, options = {}) {
        const { ctrl = false, shift = false, alt = false, meta = false } = options;
        const combo = [ctrl ? 'Control' : '', shift ? 'Shift' : '', alt ? 'Alt' : '', meta ? 'Meta' : '', key].filter(Boolean).join('+');
        this.bindings.set(combo, callback);
    },

    handleEvent(e) {
        const combo = [e.ctrlKey ? 'Control' : '', e.shiftKey ? 'Shift' : '', e.altKey ? 'Alt' : '', e.metaKey ? 'Meta' : '', e.key].filter(Boolean).join('+');
        const callback = this.bindings.get(combo);
        if (callback) {
            e.preventDefault();
            callback(e);
        }
    },

    init() {
        document.addEventListener('keydown', this.handleEvent.bind(this));
    }
};

// Initialize keyboard handling
Keyboard.init();

// Reduced motion detection
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
VerteonState.reducedMotion = motionQuery.matches;
motionQuery.addEventListener('change', e => {
    VerteonState.reducedMotion = e.matches;
    VerteonState.animationsEnabled = !e.matches;
});

// Export for global access
window.Verteon = { VerteonState, Animations, DOM, Keyboard, subscribe, setState, getState };