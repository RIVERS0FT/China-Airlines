import type { Plugin } from 'postcss';

/** Preserve quoted strings and URLs; convert only dimension tokens. */
export function logicalViewportUnits(value: string): string {
  const tokens = /url\((?:[^()"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(-?(?:\d*\.)?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)\b/gi;
  return value.replace(tokens, (token: string, amount?: string, unit?: string) => {
    if (!unit || !amount) return token;
    const dimension = unit.toLowerCase().replace(/^[dsl](?=v[wh]$)/, '');
    return `calc(${amount} * var(--game-${dimension}))`;
  });
}

/** Keep legacy styles in design coordinates instead of adding override layers.
 * Size-based media queries become named container queries on the design canvas.
 * Device preferences (reduced motion, etc.) remain real media queries. */
export function gameViewportCss(): Plugin {
  const isGameStyle = (file?: string) => {
    const path = file?.replace(/\\/g, '/').split('?')[0];
    return Boolean(path?.includes('/src/ui/') && !path.endsWith('/game-viewport.css'));
  };
  return {
    postcssPlugin: 'china-airlines-logical-viewport',
    AtRule: {
      media(rule) {
        if (!isGameStyle(rule.source?.input.file)) return;
        const features = [...rule.params.matchAll(/\(\s*([\w-]+)\s*[:<>=]/g)].map(match => match[1]!);
        const sizeFeature = /^(?:(?:min|max)-)?(?:width|height|aspect-ratio|orientation)$/;
        if (!features.some(feature => sizeFeature.test(feature))) return;
        if (features.some(feature => !sizeFeature.test(feature)) || rule.params.includes(','))
          throw rule.error('Nest device-preference queries separately from game size queries.');
        rule.name = 'container';
        // Minified @media(...) has no separator; @container requires one.
        rule.raws.afterName = ' ';
        rule.params = `game-viewport ${rule.params.replace(/^\s*(?:screen|all)\s+and\s+/i, '')}`;
      },
    },
    Declaration(decl) {
      if (!isGameStyle(decl.source?.input.file)) return;
      decl.value = logicalViewportUnits(decl.value);
    },
  };
}
