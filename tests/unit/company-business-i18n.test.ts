import { expect, it } from 'vitest';
import { translateCoreText } from '../../src/i18n/compat/core-text.js';

it('translates core business refusals and career records through the actual display formatter', () => {
  expect(translateCoreText('该城市已开设此业务','en-US')).toBe('This city already has this business');
  expect(translateCoreText('该业务需要3级机场','en-US')).toBe('This business requires a level 3 airport');
  expect(translateCoreText('业务管理提升至7级','en-US')).toBe('Business management reached level 7');
  expect(translateCoreText('业务专业提升至2级','en-US')).toBe('Business professional reached level 2');
  expect(translateCoreText('该城市已开设此业务','zh-CN')).toBe('该城市已开设此业务');
});
