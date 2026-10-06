/**
 * Verteon Navigation Component
 * Handles responsive navigation, mobile menu, active states, and keyboard navigation.
 */

import { VerteonState, Animations, DOM, Keyboard } from './verteon-core.js';

export class Navigation {
    constructor(options = {}) {
        this.nav = options.nav || DOM.$('.navbar');
        this.container = options.container || DOM.$('.nav-container');
        this.links = options.links || DOM.$('.nav-links');
        this.toggle = options.toggle || DOM.$('#navToggle');
        this.brand = options.brand || DOM.$('.nav-brand');
        this.breakpoint = options.breakpoint || 768;
        this.isOpen = false;
        this.activeSection = null;
        
        this.init();
    }

    init() {
        if (!this.nav) return;

        // Mobile menu toggle
        if (this.toggle) {
            this.toggle.addEventListener('click', () => this.toggleMenu());
            this.toggle.setAttribute('aria-expanded', 'false');
            this.toggle.setAttribute('aria-label', 'Toggle navigation menu');
        }

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.nav.contains(e.target)) {
                this.closeMenu();
            }
        });

        // Close on Escape
        Keyboard.bind('Escape', () => {
            if (this.isOpen) this.closeMenu();
        });

        // Keyboard navigation within menu
        if (this.links) {
            this.links.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeMenu();
                    this.toggle?.focus();
                }
            });
        }

        // Active link highlighting on scroll
        this.setupScrollSpy();

        // Handle resize
        window.addEventListener('resize', () => this.handleResize());

        // Logo interaction
        if (this.brand) {
            this.setupLogoInteraction();
        }

        // Smooth scroll for anchor links
        DOM.$$('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const href = anchor.getAttribute('href');
                if (href && href.length > 1) {
                    const target = document.querySelector(href);
                    if (target) {
                        e.preventDefault();
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        this.setActive(href.slice(1));
                        if (this.isOpen) this.closeMenu();
                    }
                }
            });
        });

        // Navbar scroll effect
        window.addEventListener('scroll', () => this.handleScroll(), { passive: true });
    }

    setupLogoInteraction() {
        const logo = this.brand;
        
        // Hover effect
        logo.addEventListener('mouseenter', () => {
            if (!VerteonState.reducedMotion) {
                Animations.spring(logo, [
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.05) rotate(1deg)' },
                    { transform: 'scale(1)' }
                ], { duration: 200 });
            }
        });

        // Click: go home or scroll to top
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Press animation
            Animations.press(logo, 0.95);

            // If on home page, scroll to top; otherwise navigate home
            if (window.location.pathname.endsWith('index.html') || 
                window.location.pathname === '/' ||
                window.location.pathname === '') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                window.location.href = 'index.html';
            }
        });

        // Keyboard focus
        logo.setAttribute('tabindex', '0');
        logo.setAttribute('role', 'link');
        logo.setAttribute('aria-label', 'Verteon home');
        logo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                logo.click();
            }
        });

        // Focus ring
        logo.addEventListener('focus', () => {
            logo.style.outline = '2px solid var(--primary-light)';
            logo.style.outlineOffset = '4px';
        });
        logo.addEventListener('blur', () => {
            logo.style.outline = '';
        });
    }

    toggleMenu() {
        if (this.isOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        this.isOpen = true;
        this.toggle?.setAttribute('aria-expanded', 'true');
        
        if (this.links) {
            this.links.style.display = 'flex';
            this.links.style.flexDirection = 'column';
            this.links.style.position = 'absolute';
            this.links.style.top = '100%';
            this.links.style.left = '0';
            this.links.style.right = '0';
            this.links.style.background = 'var(--surface)';
            this.links.style.padding = '1rem';
            this.links.style.borderBottom = '1px solid var(--border)';
            this.links.style.gap = '0.5rem';
            
            if (!VerteonState.reducedMotion) {
                this.links.animate([
                    { opacity: 0, transform: 'translateY(-10px)' },
                    { opacity: 1, transform: 'translateY(0)' }
                ], { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
            }
        }
    }

    closeMenu() {
        this.isOpen = false;
        this.toggle?.setAttribute('aria-expanded', 'false');
        
        if (this.links && window.innerWidth <= this.breakpoint) {
            if (!VerteonState.reducedMotion) {
                this.links.animate([
                    { opacity: 1, transform: 'translateY(0)' },
                    { opacity: 0, transform: 'translateY(-10px)' }
                ], { duration: 150, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }).onfinish = () => {
                    this.links.style.display = '';
                    this.links.style.flexDirection = '';
                    this.links.style.position = '';
                    this.links.style.top = '';
                    this.links.style.left = '';
                    this.links.style.right = '';
                    this.links.style.background = '';
                    this.links.style.padding = '';
                    this.links.style.borderBottom = '';
                    this.links.style.gap = '';
                };
            } else {
                this.links.style.display = '';
            }
        }
    }

    handleResize() {
        if (window.innerWidth > this.breakpoint && this.isOpen) {
            this.closeMenu();
        }
    }

    handleScroll() {
        const scrolled = window.scrollY > 10;
        if (scrolled) {
            this.nav.style.background = 'rgba(15, 23, 42, 0.95)';
            this.nav.style.boxShadow = 'var(--shadow-md)';
        } else {
            this.nav.style.background = 'rgba(15, 23, 42, 0.9)';
            this.nav.style.boxShadow = '';
        }
    }

    setupScrollSpy() {
        const sections = DOM.$$('section[id], div[id]');
        if (sections.length === 0) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.setActive(entry.target.id);
                }
            });
        }, { threshold: 0.3, rootMargin: '-20% 0px -60% 0px' });

        sections.forEach(section => observer.observe(section));
    }

    setActive(sectionId) {
        if (this.activeSection === sectionId) return;
        this.activeSection = sectionId;

        DOM.$$('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href === `#${sectionId}`) {
                link.classList.add('active');
            } else if (href && href.startsWith('#')) {
                link.classList.remove('active');
            }
        });
    }
}

// Initialize navigation when DOM is ready
export function initNavigation() {
    return new Navigation();
}