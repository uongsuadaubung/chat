/**
 * bump-version.mjs
 * Script đồng bộ và nâng cấp phiên bản định kỳ cho dự án P2P Chat
 *
 * Cách dùng: node scripts/bump-version.mjs <version>
 * Tham khảo: node scripts/bump-version.mjs 1.0.1
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readText(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function writeText(rel, content) {
  writeFileSync(resolve(ROOT, rel), content, 'utf8');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const newVersion = process.argv[2];

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.log('\nLỗi: Vui lòng cung cấp số phiên bản đẩy đủ và hợp lệ (định dạng x.y.z)');
  console.log('Ví dụ chuẩn xác: node scripts/bump-version.mjs 1.0.1\n');
  process.exit(1);
}

// 1. Phân tích version cũ từ hệ thống hiện hành package.json
const pkg = JSON.parse(readText('package.json'));
const oldVersion = pkg.version;

console.log(`\n📦 Đang tiến hành cập nhật phiên bản: ${oldVersion} → ${newVersion}\n`);

// 2. Ghi đè vào package.json
pkg.version = newVersion;
writeText('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('  ✅ package.json');

// 3. Tiến hành đồng bộ package-lock.json bằng ngầm định npm install
console.log('\n  🔄 Đang đồng bộ thông tin phiên bản vào package-lock.json...');
try {
  // Option: --package-lock-only sẽ giúp tránh npm down toàn bộ node_modules lại nếu chỉ muốn fix lock file
  execSync('npm install --package-lock-only', { stdio: 'inherit', cwd: ROOT });
  console.log('  ✅ package-lock.json');
} catch (error) {
  console.error('  ❌ Lỗi bất ngờ khi chạy npm install:', error.message);
  process.exit(1);
}

console.log(`\n🎉 Tuyệt vời! Codebase P2P đã sẵn sàng cho bản: ${newVersion}`);
console.log(`\n============== [ BƯỚC TIẾP THEO MỖI KHI BUMP ] ==============`);
console.log(`  1. git add package.json package-lock.json`);
console.log(`  2. git commit -m "chore: bump version to ${newVersion}"`);
console.log(`  3. git push`);
console.log(`  4. Lên GitHub > "Draft a new release" > Tạo Tag tên v${newVersion} > Bấm Publish`);
console.log(
  `  (Ngay sau bước số 4, hệ thống mây Github Action sẽ tự kích hoạt để tải App web của bạn lên Hosting!)\n`
);
