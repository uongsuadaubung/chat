#!/usr/bin/env node
import path from 'path';

/**
 * Script to enforce file naming conventions.
 * Integrated with lint-staged to check modified files only.
 */

const files = process.argv.slice(2);
let hasError = false;

const rules = [
  {
    pattern: /\.types\.ts$/,
    message: 'Lỗi chuẩn: Sử dụng ".type.ts" (số ít) thay vì ".types.ts" (số nhiều).'
  },
  {
    pattern: /\.constants\.ts$/,
    message: 'Lỗi chuẩn: Sử dụng ".constant.ts" (số ít) thay vì ".constants.ts" (số nhiều).'
  },
  {
    pattern: /Utils\.ts$/,
    message: 'Lỗi chuẩn: Sử dụng ".util.ts" thay vì "Utils.ts".'
  },
  {
    pattern: /utils\.ts$/,
    message: 'Lỗi chuẩn: Sử dụng "util.ts" (số ít) hoặc ".util.ts" thay vì "utils.ts".'
  },
  {
    pattern: /^[A-Z].*\.ts$/,
    message: 'Lỗi chuẩn: Filename nên sử dụng camelCase hoặc kebab-case (chữ cái đầu thường), trừ khi là Class file đặc biệt.'
  }
];

// Các exception cho phép sử dụng PascalCase (ví dụ Components hoặc Classes chính)
const pascalCaseExceptions = [
  'AtomicActionManager.ts',
  'P2PChatDatabase.ts'
];

files.forEach(file => {
  // Chỉ kiểm tra các file trong src/lib
  const normalizedFile = file.replace(/\\/g, '/');
  if (!normalizedFile.includes('src/lib')) return;

  const basename = path.basename(normalizedFile);
  
  for (const rule of rules) {
    if (rule.pattern.test(basename)) {
      // Kiểm tra exception
      if (rule.pattern.toString().includes('^[A-Z]') && pascalCaseExceptions.includes(basename)) {
        continue;
      }

      console.error(`\x1b[31m[Naming Convention]\x1b[0m ${file}`);
      console.error(`  └─ \x1b[33m${rule.message}\x1b[0m\n`);
      hasError = true;
    }
  }
});

if (hasError) {
  console.error('\x1b[41m\x1b[37m THẤT BẠI \x1b[0m Vui lòng đổi tên file để tuân thủ quy chuẩn của dự án.\n');
  process.exit(1);
}
