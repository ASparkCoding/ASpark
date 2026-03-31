interface ProjectFile {
  path: string;
  content: string;
}

/**
 * 智能选择与 prompt 相关的文件子集
 *
 * v2 改进：
 * - maxFiles 15 → 25
 * - 2 层传递依赖追踪（A→B→C）
 * - 反向依赖追踪（谁引用了被选中的文件）
 * - 始终包含所有 entity 和 type 文件
 * - 关键词模糊匹配（词干提取）
 * - 优先级排序：确保最相关文件先被选中
 */
export function selectRelevantFiles(
  prompt: string,
  allFiles: ProjectFile[],
  maxFiles: number = 25
): ProjectFile[] {
  const selected = new Map<string, ProjectFile>();

  // ── Phase 1: 必须包含的核心文件（无上限） ──
  const mustInclude = ['package.json', 'App.tsx', 'main.tsx', 'supabase.ts', 'data-service.ts'];
  for (const f of allFiles) {
    if (mustInclude.some(name => f.path.endsWith(name))) {
      selected.set(f.path, f);
    }
  }

  // ── Phase 2: 始终包含所有 entity 和 type 文件（关键参考，不受上限限制） ──
  for (const f of allFiles) {
    if (f.path.includes('types/') || f.path.includes('entities/')) {
      selected.set(f.path, f);
    }
  }

  // ── Phase 3: Layout 和 Sidebar（结构文件，对迭代至关重要） ──
  for (const f of allFiles) {
    if (f.path.includes('Layout.tsx') || f.path.includes('Sidebar.tsx')) {
      selected.set(f.path, f);
    }
  }

  // ── Phase 4: 关键词匹配（增强版：词干提取 + 模糊匹配） ──
  const keywords = extractKeywords(prompt);
  const stemmedKeywords = keywords.map(kw => stemWord(kw));

  // 带评分的候选列表
  const scored: Array<{ file: ProjectFile; score: number }> = [];

  for (const f of allFiles) {
    if (selected.has(f.path)) continue;
    if (f.path.includes('components/ui/')) continue; // 跳过 shadcn/ui 组件

    const pathLower = f.path.toLowerCase();
    const contentHead = f.content.slice(0, 800).toLowerCase();
    let score = 0;

    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      const stem = stemmedKeywords[i];

      // 精确匹配得分高
      if (pathLower.includes(kw)) score += 3;
      if (contentHead.includes(kw)) score += 2;

      // 词干匹配得分略低
      if (stem !== kw) {
        if (pathLower.includes(stem)) score += 2;
        if (contentHead.includes(stem)) score += 1;
      }
    }

    if (score > 0) {
      scored.push({ file: f, score });
    }
  }

  // 按得分降序排列，优先选高相关性文件
  scored.sort((a, b) => b.score - a.score);
  for (const { file } of scored) {
    if (selected.size >= maxFiles) break;
    selected.set(file.path, file);
  }

  // ── Phase 5: 2 层传递依赖追踪 ──
  // 第 1 层：被选中文件 import 的文件
  const level1Imports = collectImportedPaths(selected, allFiles);
  addImportedFiles(level1Imports, selected, allFiles, maxFiles);

  // 第 2 层：第 1 层文件 import 的文件
  const level2Imports = collectImportedPaths(selected, allFiles);
  addImportedFiles(level2Imports, selected, allFiles, maxFiles);

  // ── Phase 6: 反向依赖追踪 ──
  // 找出哪些文件 import 了被选中的文件（调用方）
  if (selected.size < maxFiles) {
    const selectedPaths = new Set(
      Array.from(selected.keys()).map(p =>
        p.replace(/^src\//, '').replace(/\.(tsx?|jsx?)$/, '')
      )
    );

    for (const f of allFiles) {
      if (selected.size >= maxFiles) break;
      if (selected.has(f.path)) continue;
      if (f.path.includes('components/ui/')) continue;

      const imports = extractImports(f.content);
      const importsSelected = imports.some(imp => selectedPaths.has(imp));
      if (importsSelected) {
        selected.set(f.path, f);
      }
    }
  }

  return Array.from(selected.values());
}

/**
 * 从已选中文件中收集所有 import 路径
 */
function collectImportedPaths(
  selected: Map<string, ProjectFile>,
  _allFiles: ProjectFile[]
): Set<string> {
  const importedPaths = new Set<string>();
  for (const f of selected.values()) {
    const imports = extractImports(f.content);
    for (const imp of imports) {
      importedPaths.add(imp);
    }
  }
  return importedPaths;
}

/**
 * 根据 import 路径将对应文件加入 selected
 */
function addImportedFiles(
  importedPaths: Set<string>,
  selected: Map<string, ProjectFile>,
  allFiles: ProjectFile[],
  maxFiles: number
): void {
  for (const f of allFiles) {
    if (selected.size >= maxFiles) break;
    if (selected.has(f.path)) continue;

    const normalized = f.path.replace(/^src\//, '').replace(/\.(tsx?|jsx?)$/, '');
    const withoutIndex = normalized.replace(/\/index$/, '');

    if (importedPaths.has(normalized) || importedPaths.has(f.path) || importedPaths.has(withoutIndex)) {
      selected.set(f.path, f);
    }
  }
}

/**
 * 增强版关键词提取：中英文 + 更完整的停用词
 */
function extractKeywords(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .replace(/[，。！？、；：""''（）【】《》\[\]{}()|]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);

  const stopwords = new Set([
    // 英文停用词
    'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'has',
    'are', 'was', 'were', 'been', 'being', 'will', 'would', 'could', 'should',
    'can', 'may', 'might', 'shall', 'must', 'need', 'into', 'about', 'like',
    'make', 'made', 'just', 'also', 'some', 'more', 'very', 'when', 'what',
    'where', 'which', 'while', 'after', 'before', 'between', 'each', 'every',
    'both', 'than', 'then', 'only', 'same', 'other', 'such',
    // 中文停用词
    '修改', '添加', '删除', '更新', '请', '帮我', '把', '的', '一个', '这个',
    '那个', '可以', '需要', '应该', '不要', '已经', '然后', '如果', '但是',
    '所以', '因为', '怎么', '什么', '为什么', '在于', '关于', '通过', '使用',
    '进行', '实现', '改成', '变成', '变为', '改为', '以及', '或者', '并且',
    '目前', '现在', '能否', '是否', '希望', '想要', '请帮', '帮忙',
  ]);

  return words.filter(w => !stopwords.has(w));
}

/**
 * 简单词干提取：处理常见英文复数和动词变化
 */
function stemWord(word: string): string {
  // 英文词干
  if (/^[a-z]+$/.test(word)) {
    if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
    if (word.endsWith('es') && word.length > 3) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
    if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
    if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  }
  return word;
}

function extractImports(content: string): string[] {
  const regex = /from\s+['"](@\/|\.\.?\/)([^'"]+)['"]/g;
  const paths: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    let importPath = match[2];
    // 处理 @/ 前缀
    if (match[1] === '@/') {
      importPath = match[2];
    } else {
      importPath = match[1].replace(/^\.\//, '') + match[2];
    }
    // 去掉文件扩展名
    importPath = importPath.replace(/\.(tsx?|jsx?)$/, '');
    paths.push(importPath);
  }
  return paths;
}
