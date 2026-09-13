/** Reinterpret game CSS in the named logical canvas, never the physical device viewport. */
module.exports = () => ({
  postcssPlugin: 'china-airlines-logical-viewport',
  Once(root) {
    if (/(?:^|[\\/])viewport\.css$/.test(root.source?.input.file || '')) return;
    root.walkAtRules('media', rule => {
      if (/\((?:min-|max-)?(?:width|height|aspect-ratio|orientation)\s*:/.test(rule.params)) {
        // Environmental preferences (reduced motion, contrast, etc.) stay @media.
        rule.name = 'container'; rule.raws.afterName = ' '; rule.params = `game-viewport ${rule.params}`;
      }
    });
    root.walkDecls(decl => {
      decl.value = decl.value.replace(/(-?(?:\d*\.)?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)\b/g, (_, value, unit) => {
        const axis = unit.endsWith('vh') ? 'vh' : unit.endsWith('vw') ? 'vw' : unit;
        return `calc(var(--game-${axis}) * ${value})`;
      });
    });
  },
});
module.exports.postcss = true;
