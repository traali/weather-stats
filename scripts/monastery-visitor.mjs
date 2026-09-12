import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const AGENTS_MD_PATH = path.join(ROOT, 'AGENTS.md');
const VISITATIONS_DIR = path.join(ROOT, '.agent', 'visitations');

console.log('🏛️  [MONASTERY] Initiating Pre-Visitation Protocol for weather-stats...\n');

// 1. Check Rule Word Count Cap (< 1500 words)
if (!fs.existsSync(AGENTS_MD_PATH)) {
  console.error('❌ [FATAL] AGENTS.md not found at project root.');
  process.exit(1);
}

const ruleText = fs.readFileSync(AGENTS_MD_PATH, 'utf-8');
const wordCount = ruleText.trim().split(/\s+/).length;
console.log(`📜 The Rule: AGENTS.md (${wordCount} words / 1500 cap)`);
if (wordCount > 1500) {
  console.error(`❌ [RULE VIOLATION] AGENTS.md exceeds 1,500 word cap (${wordCount} words). Prune before audit.`);
  process.exit(1);
}

// 2. Static Lint Check
try {
  console.log('🔍 Running static lint check (eslint)...');
  execSync('npm run lint', { stdio: 'inherit', cwd: ROOT });
  console.log('✅ Lint check passed (0 errors).\n');
} catch {
  console.error('❌ [BLOCKER] Lint failed. Fix lint issues before requesting visitation.');
  process.exit(1);
}

// 3. Automated Test Suite Check
try {
  console.log('🧪 Running test suite...');
  execSync('npm run test', { stdio: 'inherit', cwd: ROOT });
  console.log('✅ Test suite passed (100% green).\n');
} catch {
  console.error('❌ [BLOCKER] Tests failed. Fix failing tests before requesting visitation.');
  process.exit(1);
}

// 4. Ensure visitations directory exists
if (!fs.existsSync(VISITATIONS_DIR)) {
  fs.mkdirSync(VISITATIONS_DIR, { recursive: true });
}

console.log('================================================================');
console.log('✨ [MONASTERY] Pre-conditions met! Ready for Clean-Room Visitor.');

// Chapter of Neighbors — peer monasteries, contracts, plans
try {
  console.log('🔗 Chapter of Neighbors (peer monasteries + contracts + plans)...')
  execSync('node scripts/check-neighbors.mjs', { stdio: 'inherit', cwd: ROOT })
} catch {
  console.error('❌ [BLOCKER] Neighbor check failed. Peer houses must stay in line.')
  process.exit(1)
}

console.log('================================================================\n');
