// Firebase Configuration Verification Test
// This script verifies the Firebase configuration is correct by loading the firebase SDK

const fs = require('fs');
const path = require('path');

console.log('Firebase Configuration Verification');
console.log('===================================');

// Read the firebase-config.js file
const configPath = path.join(__dirname, 'assets', 'js', 'firebase-config.js');
const configContent = fs.readFileSync(configPath, 'utf8');

// Check if the file contains the necessary Firebase configuration
const checks = {
  'Firebase configuration file exists': fs.existsSync(configPath),
  'Contains apiKey': configContent.includes('apiKey'),
  'Contains authDomain': configContent.includes('authDomain'),
  'Contains projectId': configContent.includes('projectId'),
  'Contains initializeApp': configContent.includes('initializeApp'),
  'Contains getAuth': configContent.includes('getAuth'),
  'Contains GoogleAuthProvider': configContent.includes('GoogleAuthProvider'),
  'Contains auth export': configContent.includes('export {'),
};

let allPassed = true;
for (const [check, passed] of Object.entries(checks)) {
  if (passed) {
    console.log(`✅ PASS: ${check}`);
  } else {
    console.error(`❌ FAIL: ${check}`);
    allPassed = false;
  }
}

// Check the configuration values
const apiKeyMatch = configContent.match(/apiKey:\s*'([^']+)'/);
const authDomainMatch = configContent.match(/authDomain:\s*'([^']+)'/);
const projectIdMatch = configContent.match(/projectId:\s*'([^']+)'/);

console.log('');
console.log('Configuration Values:');
console.log(`  - apiKey: ${apiKeyMatch ? apiKeyMatch[1].substring(0, 20) + '...' : 'Not found'}`);
console.log(`  - authDomain: ${authDomainMatch ? authDomainMatch[1] : 'Not found'}`);
console.log(`  - projectId: ${projectIdMatch ? projectIdMatch[1] : 'Not found'}`);

console.log('');
if (allPassed) {
  console.log('✅ All checks passed! Firebase configuration is valid.');
  console.log('To test authentication: open admin.html in a browser and check the console.');
} else {
  console.log('❌ Some checks failed. Please review the Firebase configuration.');
}

process.exit(allPassed ? 0 : 1);