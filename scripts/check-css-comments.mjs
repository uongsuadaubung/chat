#!/usr/bin/env node
/**
 * Kiểm tra comment "//" trong CSS thuần (không phải SCSS/Sass).
 * - File .css: kiểm tra toàn bộ nội dung.
 * - File .svelte: chỉ kiểm tra trong <style> block KHÔNG có lang="scss"/"sass".
 *   (SCSS hợp lệ với //, nên bỏ qua các block đó.)
 *
 * Cách dùng: node scripts/check-css-comments.mjs <file1> <file2> ...
 * lint-staged sẽ truyền danh sách file staged vào argv.
 */

import { readFileSync } from 'fs';

const files = process.argv.slice(2);
let hasErrors = false;

/**
 * Kiểm tra một mảng dòng xem có // comment không.
 * Loại trừ: http://, https://, url(//) để tránh false positive.
 *
 * @param {string[]} lines
 * @param {string} filePath
 * @param {number} lineOffset - Số dòng bắt đầu của block trong file gốc (1-indexed)
 */
function checkLines(lines, filePath, lineOffset) {
  lines.forEach((line, i) => {
    // Xóa các dạng không phải comment // trước để tránh false positive:
    // 1. url(...) — có thể chứa //cdn.com/...
    // 2. String literals
    // 3. Block comment /* ... */ trên một dòng — có thể chứa // bên trong
    const stripped = line
      .replace(/url\([^)]*\)/gi, 'url()')
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/\/\*.*?\*\//g, ''); // Xóa block comment trên cùng dòng

    // Tìm // mà không phải sau dấu : (http:// https://)
    if (/(?<!:)\/\//.test(stripped)) {
      const lineNum = lineOffset + i;
      console.error(`\x1b[31m✗ ${filePath}:${lineNum} — CSS không hỗ trợ comment "//"\x1b[0m`);
      console.error(`  ${line.trim()}`);
      console.error(
        `  \x1b[33mDùng /* ... */ hoặc thêm lang="scss" vào <style> nếu muốn dùng SCSS syntax.\x1b[0m`
      );
      hasErrors = true;
    }
  });
}

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    // File bị xóa hoặc không đọc được — bỏ qua
    continue;
  }

  if (file.endsWith('.css')) {
    // Toàn bộ file là plain CSS
    checkLines(content.split('\n'), file, 1);
  } else if (file.endsWith('.svelte')) {
    // Chỉ kiểm tra <style> block KHÔNG có lang="scss"/"sass"
    const styleRegex = /<style([^>]*)>([\s\S]*?)<\/style>/g;
    let match;
    while ((match = styleRegex.exec(content)) !== null) {
      const attrs = match[1] ?? '';
      const styleContent = match[2];

      // Bỏ qua SCSS/Sass — // là hợp lệ trong đó
      if (/lang\s*=\s*["'](scss|sass)["']/.test(attrs)) continue;

      // Tính số dòng bắt đầu của <style> block trong file
      const linesBefore = content.slice(0, match.index).split('\n').length;
      checkLines(styleContent.split('\n'), file, linesBefore);
    }
  }
}

if (hasErrors) {
  process.exit(1);
}
