// Shared UI utilities for the Verteon website.

export function showToast(message, type = 'info', duration = 4000) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => hideToast(toast));
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    if (duration > 0) {
        setTimeout(() => hideToast(toast), duration);
    }
    return toast;
}

function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 1.5rem;
            right: 1.5rem;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }
    return container;
}

function hideToast(toast) {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function setLoading(button, loading, originalText) {
    if (loading) {
        button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.innerHTML = `
            <span class="spinner" style="
                display:inline-block;width:1em;height:1em;border:2px solid currentColor;
                border-right-color:transparent;border-radius:50%;animation:spin 0.7s linear infinite;
                margin-right:0.5rem;vertical-align:middle;"></span>
            ${originalText || 'Loading...'}
        `;
        if (!document.getElementById('spinner-style')) {
            const style = document.createElement('style');
            style.id = 'spinner-style';
            style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(style);
        }
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || originalText || '';
        delete button.dataset.originalText;
    }
}

export function wireCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const value = btn.getAttribute('data-copy');
            const original = btn.textContent;
            try {
                await navigator.clipboard.writeText(value);
                btn.textContent = 'Copied';
                btn.classList.add('btn-copied');
            } catch {
                btn.textContent = 'Copy failed';
                btn.classList.add('btn-failed');
            }
            setTimeout(() => {
                btn.textContent = original;
                btn.classList.remove('btn-copied', 'btn-failed');
            }, 1500);
        });
    });
}

export function enhanceForm(form, options = {}) {
    const { onSubmit, validate, submitBtnSelector = 'button[type="submit"]' } = options;
    const submitBtn = form.querySelector(submitBtnSelector);
    if (!submitBtn) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (validate && !validate(new FormData(form))) return;

        const originalText = submitBtn.textContent;
        setLoading(submitBtn, true, originalText);

        try {
            await onSubmit(new FormData(form));
        } catch (err) {
            showToast(err.message || 'Something went wrong', 'error');
        } finally {
            setLoading(submitBtn, false, originalText);
        }
    });

    // Real-time validation clearing
    form.querySelectorAll('input, textarea, select').forEach((input) => {
        input.addEventListener('input', () => {
            const errorEl = form.querySelector(`[id="${input.id}Error"]`);
            if (errorEl) errorEl.style.display = 'none';
        });
    });
}

export function animateOnScroll(selector, options = {}) {
    const { threshold = 0.1, rootMargin = '0px', once = true } = options;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                if (once) observer.unobserve(entry.target);
            } else if (!once) {
                entry.target.classList.remove('animate-in');
            }
        });
    }, { threshold, rootMargin });

    document.querySelectorAll(selector).forEach((el) => observer.observe(el));
    return observer;
}

export function prefetchPages(links) {
    links.forEach((href) => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
    });
}