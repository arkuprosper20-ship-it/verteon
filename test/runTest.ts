import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    const exitCode = await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, '../../'),
      extensionTestsPath: path.resolve(__dirname, './suite/index'),
      vscodeExecutablePath: 'C:\\Users\\HP\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      launchArgs: ['--disable-gpu'],
    });
    process.exit(exitCode);
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
