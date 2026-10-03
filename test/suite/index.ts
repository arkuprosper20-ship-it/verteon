import * as path from 'path';
import Mocha = require('mocha');

export function run(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let failed = false;
    const mocha = new Mocha({
      timeout: 10000,
      reporter: 'spec',
    });
    const testsRoot = path.resolve(__dirname, '.');

    try {
      mocha.addFile(path.resolve(testsRoot, 'commandSafety.test.js'));
      mocha.addFile(path.resolve(testsRoot, 'secretDetection.test.js'));
      mocha.addFile(path.resolve(testsRoot, 'agentLoop.test.js'));
    } catch (e) {
      console.error('Failed to add test files:', e);
      reject(e);
      return;
    }

    try {
      await mocha.run((failures: number) => {
        console.log(`MOCHA_RESULT: ${failures} failures`);
        if (failures > 0) {
          failed = true;
        }
      });
    } catch (e) {
      failed = true;
      console.error('Mocha run failed:', e);
      reject(e);
    }

    if (!failed) {
      console.log('MOCHA_RESULT: all tests passed');
      resolve();
    } else {
      reject(new Error('Test failures'));
    }
  });
}
