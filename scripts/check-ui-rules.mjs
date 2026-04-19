import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const OUTPUT_FILE = path.join(__dirname, 'ui_rule_violations.json');

// Danh sách file staged được lint-staged truyền vào argv.
// Nếu không có → fallback về chế độ full scan (giữ nguyên hành vi gốc).
const stagedFiles = process.argv.slice(2).filter(Boolean);

// Danh sách các Regex kiểm duyệt 3 tiêu chí của rule-ui-standard-strict.md
const checks = [
  // --- RULE 3: COLORS ---
  {
    name: 'Color_Hardcoded_HEX',
    regex: /(?<=:\s*[^;}]*|,\s*)#[0-9a-fA-F]{3,8}\b/g,
    reason: 'Mã màu tĩnh dạng HEX (#ffffff) phá vỡ tính nhất quán của hệ thống Design System.',
    fix: 'Thay thế bằng biến CSS tương ứng (vd: var(--color-white) từ app.css).'
  },
  {
    name: 'Color_Hardcoded_RGB',
    regex: /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)/g,
    reason: 'Mã màu tĩnh dạng rgba cản trở tính năng chuyển đổi Dark Mode/Light Mode.',
    fix: 'Hãy sử dụng biến thay thế, ví dụ: rgba(var(--color-black-rgb), 0.1).'
  },
  {
    name: 'Color_Hardcoded_Keyword',
    regex:
      /(?<=:\s*[^;}]*\s)(?<!-)\b(white|black|red|blue|green|yellow|gray|grey|purple|orange|pink|brown)\b/gi,
    reason: 'Khai báo màu bằng tên tiếng Anh thô phá vỡ chuẩn hóa màu sắc của dự án P2P.',
    fix: 'Dùng các biến màu CSS từ Design System (vd: var(--color-red-500)).'
  },
  {
    name: 'Color_Invalid_Fallback',
    // Cấm mọi loại fallback lồng nhau: var(--a, var(--b))
    // Đặc biệt cấm mọi fallback cho biến --glass-*
    regex:
      /var\s*\(\s*(?:--glass-(?:border|bg)\s*,[^)]+|(--[a-zA-Z0-9-]+)\s*,\s*var\s*\([^)]+\))\s*\)/g,
    reason:
      'Khai báo fallback (dự phòng) không hợp lệ: Hệ thống P2P quy định không dùng fallback lồng nhau (nested var) để tránh làm rối code CSS và đảm bảo tính nhất quán của Design System.',
    fix: 'Loại bỏ phần fallback, chỉ giữ lại một tầng var(--variable) duy nhất.'
  },

  // --- RULE 2: EMOJIS ---
  {
    name: 'Icon_TextBased_Emoji',
    regex: /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA70}-\u{1FAFF}]/gu,
    reason: 'Biểu tượng Emoji văn bản render không đồng nhất giữa Windows và macOS.',
    fix: 'Thay thế bằng các Component Icon dạng SVG có trong thư mục $lib/shared/components/icons.'
  },

  // --- RULE 1: HARDCODED STRINGS (i18n check) ---
  {
    name: 'i18n_Hardcoded_Vietnamese',
    regex: /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵĐđ]/gu,
    reason:
      'Các chuỗi text tiếng Việt dán cứng trực tiếp vào mã nguồn khiến tính năng Đa ngôn ngữ (i18n) đi vào ngõ cụt.',
    fix: "Bọc chuỗi hiển thị qua tham chiếu i18n.t('key') và khai báo từ khóa tiếng Anh/Việt tương ứng vào i18n.store.svelte.ts."
  },
  {
    name: 'i18n_Raw_HTML_Text',
    regex: />\s*(?!\{)[a-zA-Z][a-zA-Z0-9\s,.?!]{2,}\s*</g,
    reason:
      'Văn bản thả tự do nằm trơ trọi giữa mỏ neo HTML sẽ không đi qua bộ dịch i18n và làm vấy bẩn template.',
    fix: 'Đưa các đoạn văn bản thẳng này vào biến Svelte trong thẻ <script> hoặc khai báo trong tập tin ngôn ngữ i18n.'
  },

  // --- RULE 4: IMPORTS (Alias usage) ---
  {
    name: 'Import_Relative_Path',
    regex: /\bfrom\s+['"]\.\.?\//g,
    reason:
      'Đường dẫn Relative path (./ hoặc ../) nhảy nhiều cấp khiến file bị gãy nếu di chuyển vị trí thư mục sau này.',
    fix: 'Sử dụng đường dẫn Alias tuyệt đối bắt đầu bằng $lib/... (ví dụ thay ./icons -> $lib/shared/components/icons)'
  }
];

const IGNORE_DIRS = ['node_modules', '.svelte-kit', 'dist', 'build', 'scripts'];
// app.css loại ra vì nó quy hoạch biến root CSS
// i18n.store.ts được loại ra vì đây chính là nơi CHỨA từ điển dịch thuật
const IGNORE_FILES = [
  'app.css',
  'i18n.store.svelte.ts',
  'emoji.constants.ts',
  'emojiData.ts',
  'main.ts'
];
const VALID_EXTENSIONS = ['.svelte', '.css', '.scss', '.tsx', '.ts'];

let violations = [];

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.includes(file)) {
        scanDirectory(fullPath);
      }
    } else {
      if (IGNORE_FILES.includes(file)) continue;
      if (file.includes('.test.') || file.includes('.spec.')) continue;
      const ext = path.extname(fullPath).toLowerCase();
      if (VALID_EXTENSIONS.includes(ext)) {
        scanFile(fullPath);
      }
    }
  }
}

function scanFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Tiền xử lý: Sanitize toàn file trước khi quét từng dòng
  // 1. Xóa các block comment /* ... */ và <!-- ... --> (có thể trải dài nhiều dòng)
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  content = content.replace(/<!--[\s\S]*?-->/g, '');

  const lines = content.split('\n');

  let inLogStatement = false;

  lines.forEach((line, index) => {
    // 2. Tước bỏ inline comment // ...
    let codeContent = line.replace(/\/\/.*/, '').trim();

    if (!codeContent) return;

    // Kỹ thuật bỏ qua multiline log/console/Error statements
    if (codeContent.match(/(console\.|log\.|new Error\(|new DatabaseError\()/)) {
      if (!codeContent.endsWith(';') && !codeContent.endsWith(')')) {
        inLogStatement = true;
      }
      return;
    }
    if (inLogStatement) {
      if (codeContent.endsWith(';') || codeContent.endsWith(')') || codeContent.endsWith(');')) {
        inLogStatement = false;
      }
      return;
    }

    for (const check of checks) {
      const matches = codeContent.match(check.regex);
      if (matches) {
        // Ngoại lệ: Bỏ qua comment tàn dư hoặc chuỗi rỗng
        if (check.name === 'i18n_Hardcoded_Vietnamese') {
          // Bỏ qua một số từ dính líu đến code
        }

        // Ngoại lệ cho i18n_Raw_HTML_Text: Bỏ qua BrandName và TypeScript Generics
        if (check.name === 'i18n_Raw_HTML_Text') {
          if (codeContent.includes('P2P Messenger') || codeContent.includes('Promise<')) continue;
        }

        violations.push({
          file: filePath.replace(ROOT_DIR, ''),
          line: index + 1,
          type: check.name,
          reason: check.reason,
          fix: check.fix,
          matches: matches,
          code: codeContent
        });
      }
    }
  });
}

if (stagedFiles.length > 0) {
  // --- Chế độ lint-staged: chỉ scan file được truyền vào ---
  const ext = VALID_EXTENSIONS;
  for (const file of stagedFiles) {
    if (IGNORE_FILES.includes(path.basename(file))) continue;
    if (file.includes('.test.') || file.includes('.spec.')) continue;
    if (!ext.includes(path.extname(file).toLowerCase())) continue;
    try {
      scanFile(file);
    } catch {
      // File bị xóa hoặc không thể đọc — bỏ qua
    }
  }
} else {
  // --- Chế độ full scan (chạy thủ công, không phải qua husky) ---
  console.log('Bắt đầu quét mã nguồn Strict UI Standards...');
  scanDirectory(SRC_DIR);
}

const label = stagedFiles.length > 0 ? 'staged files' : 'toàn bộ mã nguồn';
console.log(`\nHoàn tất quét ${label}! Tìm thấy ${violations.length} vi phạm UI Standard.`);

if (violations.length > 0) {
  // Luôn ghi report ra file (cả staged và full scan) để xem chi tiết
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(violations, null, 2));
  console.log(`Kết quả chi tiết đã được lưu tại: ${OUTPUT_FILE}`);

  // Nhóm vi phạm theo Type để log thống kê nhanh
  const countByType = violations.reduce((acc, curr) => {
    acc[curr.type] = (acc[curr.type] || 0) + 1;
    return acc;
  }, {});
  console.table(countByType);

  // In từng vi phạm ra stderr để lint-staged hiển thị
  for (const v of violations) {
    console.error(
      `\x1b[31m✗ ${v.file}:${v.line} [${v.type}]\x1b[0m\n  ${v.code.trim()}\n  \x1b[33m→ ${v.fix}\x1b[0m`
    );
  }

  // Exit 1 để husky block commit
  process.exit(1);
} else {
  // Nếu không có vi phạm, xóa file output cũ (nếu có) cho sạch thư mục
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
  }
}
