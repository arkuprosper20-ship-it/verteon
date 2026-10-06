// Shared auth + onboarding state for the Verteon website pages.
//
// Account state comes from Firebase Auth (a real account, real credentials).
// Onboarding progress is device-local: it is a checklist the user ticks off on
// their own machine, so it lives in localStorage and is never sent anywhere.

import {
    auth,
    onAuthStateChanged,
    signOut as firebaseSignOut
} from './firebase-config.js';

const PROFILE_KEY = 'verteon.profile';

export const GUIDE_STEPS = [
    { id: 'install', title: 'Install the extension' },
    { id: 'ollama', title: 'Start Ollama and pull a coding model' },
    { id: 'open-panel', title: 'Open the AI Agent panel' },
    { id: 'first-task', title: 'Run your first task' },
    { id: 'approvals', title: 'Review the approval and safety flow' }
];

/** Resolves with the signed-in Firebase user, or null. */
export function currentUser() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

/**
 * Redirects to sign-in when nobody is signed in. Returns the user otherwise.
 * Pass the page's own path so we can send them back here afterwards.
 */
export async function requireAuth(returnTo) {
    const user = await currentUser();
    if (!user) {
        const next = encodeURIComponent(returnTo || 'dashboard.html');
        window.location.replace(`signin.html?next=${next}`);
        return null;
    }
    return user;
}

export function loadProfile() {
    try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (!raw) return newProfile();
        return { ...newProfile(), ...JSON.parse(raw) };
    } catch {
        return newProfile();
    }
}

export function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
}

function newProfile() {
    return { displayName: '', createdAt: '', guideCompleted: false, steps: {} };
}

export function markStep(stepId, done) {
    const profile = loadProfile();
    profile.steps[stepId] = !!done;
    if (GUIDE_STEPS.every((s) => profile.steps[s.id])) {
        profile.guideCompleted = true;
        profile.completedAt = new Date().toISOString();
    }
    return saveProfile(profile);
}

export function guideProgress(profile = loadProfile()) {
    const done = GUIDE_STEPS.filter((s) => profile.steps[s.id]).length;
    return { done, total: GUIDE_STEPS.length, percent: Math.round((done / GUIDE_STEPS.length) * 100) };
}

export function recordSignup(user) {
    const profile = loadProfile();
    profile.displayName = user.displayName || (user.email || '').split('@')[0];
    profile.createdAt = new Date().toISOString();
    return saveProfile(profile);
}

/** Real sign-out. Clears the Firebase session, keeps local onboarding progress. */
export async function endSession() {
    await firebaseSignOut(auth);
    window.location.replace('index.html');
}

/** Wires up the shared nav: sign-out button and mobile nav toggle. */
export function wireChrome(user) {
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.querySelector('.nav-links');
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
        });
    }

    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        if (user) {
            const who = document.getElementById('navUser');
            if (who) who.textContent = user.displayName || user.email;
            signOutBtn.hidden = false;
            signOutBtn.addEventListener('click', () => endSession().catch(() => {
                window.location.replace('index.html');
            }));
        } else {
            signOutBtn.hidden = true;
        }
    }
}

/** Only the approved admin UID should be able to access the admin console. */
export const ADMIN_UIDS = new Set([
  'M4BXrmnDY0X568DRiIq4g7yacXG2',
]);

export const ADMIN_ALLOWED_UID = 'M4BXrmnDY0X568DRiIq4g7yacXG2';

/** Returns true when the signed-in Firebase user is the approved admin. */
export function isAdmin(user) {
  if (!user) return false;
  return ADMIN_UIDS.has(user.uid);
}

/** Redirects to sign-in when not signed in, and to dashboard when signed in but not admin. */
export async function requireAdmin(returnTo) {
  const user = await requireAuth(returnTo);
  if (!user) return null;
  if (!isAdmin(user)) {
    window.location.replace('dashboard.html');
    return null;
  }
  return user;
}

/** Copies text to the clipboard and gives visual feedback on the button. */
export function wireCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const value = btn.getAttribute('data-copy');
            try {
                await navigator.clipboard.writeText(value);
                const original = btn.textContent;
                btn.textContent = 'Copied';
                setTimeout(() => { btn.textContent = original; }, 1400);
            } catch {
                btn.textContent = 'Copy failed';
            }
        });
    });
}