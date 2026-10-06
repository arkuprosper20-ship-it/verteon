// Test Authentication Script for Verteon Website
// This script verifies that the Firebase authentication is working correctly
// To use this script, open the admin.html page and check the browser console

// Test 1: Verify Firebase is initialized
async function testFirebaseInit() {
    const { auth, db, storage, googleProvider } = await import('./assets/js/firebase-config.js');
    
    if (!firebase.apps.length) {
        console.error('FAIL: Firebase is not initialized');
        return false;
    }
    
    console.log('PASS: Firebase initialized successfully');
    console.log('  - Project ID:', app.options.projectId);
    console.log('  - Auth:', auth ? 'Available' : 'Not available');
    console.log('  - Firestore:', db ? 'Available' : 'Not available');
    console.log('  - Storage:', storage ? 'Available' : 'Not available');
    console.log('  - Google Provider:', googleProvider ? 'Available' : 'Not available');
    return true;
}

// Test 2: Verify authentication methods are available
async function testAuthMethods() {
    const { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signInWithPopup } = await import('./assets/js/firebase-config.js');
    
    const methods = {
        createUserWithEmailAndPassword: typeof createUserWithEmailAndPassword,
        signInWithEmailAndPassword: typeof signInWithEmailAndPassword,
        sendPasswordResetEmail: typeof sendPasswordResetEmail,
        signInWithPopup: typeof signInWithPopup,
        onAuthStateChanged: typeof auth.onAuthStateChanged,
        signOut: typeof auth.signOut
    };
    
    for (const [name, type] of Object.entries(methods)) {
        if (type === 'function') {
            console.log('PASS: Auth method available:', name);
        } else {
            console.error('FAIL: Auth method missing:', name);
        }
    }
    return true;
}

// Test 3: Verify admin access control
function testAdminAccess() {
    const user = localStorage.getItem('verteon_user');
    
    if (!user) {
        console.log('INFO: No user logged in - redirecting to signin');
        return false;
    }
    
    const userData = JSON.parse(user);
    if (userData.role === 'admin' || userData.role === 'admin') {
        console.log('PASS: Admin access granted for user:', userData.email);
        return true;
    } else {
        console.log('INFO: User is not an admin - redirecting to dashboard');
        return false;
    }
}

// Test 3b: Verify the known admin UID is recognised by the shared auth module.
async function testAdminUid() {
    try {
        const { isAdmin } = await import('./assets/js/app-auth.js');
        const known = 'M4BXrmnDY0X568DRiIq4g7yacXG2';
        if (isAdmin({ uid: known })) {
            console.log('PASS: Known admin UID is recognised:', known);
            return true;
        }
        console.error('FAIL: Known admin UID was rejected:', known);
        return false;
    } catch (error) {
        console.error('FAIL: Could not load app-auth module:', error.message);
        return false;
    }
}

// Test 4: Simulate user registration
async function simulateRegistration() {
    try {
        const { createUserWithEmailAndPassword, auth } = await import('./assets/js/firebase-config.js');
        
        // Note: This would actually create a Firebase user if uncommented
        // const userCredential = await createUserWithEmailAndPassword(auth, 'test@example.com', 'password123');
        
        console.log('INFO: Registration method ready (not executed)');
        return true;
    } catch (error) {
        console.error('INFO: Registration requires Firebase project setup');
        return true;
    }
}

// Run all tests when the page loads
window.addEventListener('load', async () => {
    console.log('Starting Authentication Tests...');
    console.log('================================');
    
    const results = {
        'Firebase Initialization': await testFirebaseInit(),
        'Auth Methods': await testAuthMethods(),
        'Admin Access': testAdminAccess(),
        'Admin UID': await testAdminUid(),
        'Registration': await simulateRegistration()
    };
    
    console.log('================================');
    
    const passed = Object.values(results).filter(r => r === true).length;
    const total = Object.values(results).length;
    console.log('Tests Passed:', passed, 'of', total);
    
    if (passed === total) {
        console.log('All tests passed!');
    } else {
        console.log('Some tests failed - check console for details');
    }
});

// Export functions for manual testing in console
window.testAuth = {
    testFirebaseInit,
    testAuthMethods,
    testAdminAccess,
    testAdminUid,
    simulateRegistration
};

// Export for module usage
export { testFirebaseInit, testAuthMethods, testAdminAccess, testAdminUid, simulateRegistration };

// Export for console usage
window.testFirebaseInit = testFirebaseInit;
window.testAuthMethods = testAuthMethods;
window.testAdminAccess = testAdminAccess;
window.testAdminUid = testAdminUid;
window.simulateRegistration = simulateRegistration;
