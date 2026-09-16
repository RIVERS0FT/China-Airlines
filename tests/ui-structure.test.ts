import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('UI structural boundaries', () => {
  it('keeps all physical viewport rules in their unconverted file', () => {
    const imports = read('src/ui/styles/index.ts');
    expect(imports).toContain("import '../viewport.css'");
    expect(imports).toContain("import './tokens.css'");
    expect(read('src/main.tsx')).toContain("import './ui/styles/index.js'");
    expect(read('src/ui/viewport.css')).toContain('env(safe-area-inset');
    expect(read('src/ui/styles/layout.css')).not.toContain('100vh');
  });
  it('keeps shared containers independent from business writers', () => {
    for (const path of ['src/ui/layout/PageFrame.tsx','src/ui/components/GameDialog.tsx','src/ui/shell/navigation.ts','src/ui/shell/PageState.tsx']) {
      const code = read(path);
      expect(code).not.toMatch(/controller\.command|indexedDB|Dexie|localStorage\.setItem/);
    }
  });
  it('delegates temporary route overlays and settings to the same modal', () => {
    expect(read('src/ui/DispatchDialog.tsx')).toContain('<GameDialog');
    expect(read('src/ui/Panels.tsx')).toContain('<GameDialog');
    expect(read('src/ui/App.tsx')).not.toContain('function Modal(');
    expect(read('src/ui/layout/PageFrame.tsx')).toContain('<main');
  });
});
