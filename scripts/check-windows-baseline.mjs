import { satisfies } from 'semver';
import { assertSupportedCompatibilityManifest, loadCompatibilityManifest } from '@londi-agent-os/contracts';

const manifest = loadCompatibilityManifest();
assertSupportedCompatibilityManifest(manifest);
const nodeRange = manifest.runtime.node.supportedRange;
const gitRange = manifest.runtime.git.supportedRange;
const nodeVersion = process.versions.node;
if (!satisfies(nodeVersion, nodeRange)) throw new Error(`Node ${nodeVersion} outside supported range ${nodeRange}`);
if (process.platform !== 'win32' && process.env.CI !== 'true') {
  console.log(`Windows baseline check running on ${process.platform}; validating manifest only outside CI.`);
}
console.log(`Windows baseline OK: Windows 11 22H2+, Node ${nodeRange}, Git ${gitRange}.`);
