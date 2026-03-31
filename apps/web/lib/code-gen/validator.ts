export interface ValidationError {
  file: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Lightweight static validation of generated code files.
 * Catches obvious issues before writing to disk / starting Vite.
 */
export function validateGeneratedFiles(
  files: Array<{ path: string; content: string }>,
  allFilePaths: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const file of files) {
    // 1. Empty file check
    if (!file.content.trim()) {
      errors.push({
        file: file.path,
        message: 'File content is empty',
        severity: 'warning',
      });
      continue;
    }

    // 2. TSX/JSX component checks
    if (file.path.match(/\.(tsx|jsx)$/)) {
      // Must have at least one export
      if (!file.content.includes('export ')) {
        errors.push({
          file: file.path,
          message: 'No exports found in component file',
          severity: 'warning',
        });
      }

      // Duplicate export default
      const defaultExports = file.content.match(/export default /g);
      if (defaultExports && defaultExports.length > 1) {
        errors.push({
          file: file.path,
          message: 'Multiple export default statements',
          severity: 'error',
        });
      }
    }

    // 3. JSX in .ts file check (must use .tsx for JSX)
    if (file.path.match(/\.ts$/) && !file.path.match(/\.d\.ts$/)) {
      // Detect JSX syntax: opening tags like <Component or self-closing like <Component />
      // Exclude type generics by requiring uppercase after < (React components)
      const jsxPattern = /return\s*\([\s\S]*?<[A-Z]/;
      const jsxSelfClosing = /<[A-Z]\w+[\s\S]*?\/>/;
      const jsxFragment = /<>|<\/>/;
      if (jsxPattern.test(file.content) || jsxSelfClosing.test(file.content) || jsxFragment.test(file.content)) {
        errors.push({
          file: file.path,
          message: `File contains JSX but uses .ts extension — should be .tsx`,
          severity: 'error',
        });
      }
    }

    // 4. Import path validation (only local imports)
    const importRegex = /from\s+['"](@\/|\.\.?\/)([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(file.content)) !== null) {
      const importPath = match[1] + match[2];
      // Skip UI components (always available from template)
      if (importPath.includes('components/ui/')) continue;

      const resolved = resolveImportPath(file.path, importPath);
      const exists = allFilePaths.some(
        (p) =>
          p === resolved ||
          p === resolved + '.ts' ||
          p === resolved + '.tsx' ||
          p === resolved + '/index.ts' ||
          p === resolved + '/index.tsx'
      );
      if (!exists) {
        errors.push({
          file: file.path,
          message: `Import "${importPath}" may reference non-existent file`,
          severity: 'warning',
        });
      }
    }
  }

  return errors;
}

function resolveImportPath(fromFile: string, importPath: string): string {
  if (importPath.startsWith('@/')) {
    return 'src/' + importPath.slice(2);
  }
  // Relative path resolution
  const dir = fromFile.split('/').slice(0, -1).join('/');
  const parts = importPath.replace(/^\.\//, '').split('/');
  const dirParts = dir.split('/');
  for (const part of parts) {
    if (part === '..') dirParts.pop();
    else dirParts.push(part);
  }
  return dirParts.join('/');
}
