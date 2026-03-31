// 生成应用基础模板导出接口
// 提供模板文件列表，供生成引擎使用

export interface TemplateFile {
  path: string;
  content: string;
}

export function getBaseTemplate(): TemplateFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: 'generated-app',
          version: '0.1.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
          dependencies: {
            next: '14.2.20',
            react: '^18.3.0',
            'react-dom': '^18.3.0',
            '@supabase/supabase-js': '^2.47.0',
            '@radix-ui/react-dialog': '^1.1.0',
            '@radix-ui/react-slot': '^1.1.0',
            'class-variance-authority': '^0.7.0',
            clsx: '^2.1.0',
            'lucide-react': '^0.460.0',
            'tailwind-merge': '^2.6.0',
            'tailwindcss-animate': '^1.0.7',
            zod: '^3.23.0',
          },
          devDependencies: {
            '@types/node': '^22.0.0',
            '@types/react': '^18.3.0',
            '@types/react-dom': '^18.3.0',
            autoprefixer: '^10.4.0',
            postcss: '^8.4.0',
            tailwindcss: '^3.4.0',
            typescript: '^5.7.0',
          },
        },
        null,
        2
      ),
    },
    {
      path: 'next.config.ts',
      content: `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
`,
    },
    {
      path: 'tailwind.config.ts',
      content: `import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
`,
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2017',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: { '@/*': ['./*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2
      ),
    },
  ];
}
