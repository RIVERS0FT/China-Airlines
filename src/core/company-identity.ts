export const COMPANY_NAME_LIMIT = 24;
export const COMPANY_LOGO_LIMIT = 100_000;
export const COMPANY_LOGOS = ['wing', 'sunrise', 'bird', 'compass', 'mountain', 'orbit'] as const;
export type CompanyLogo = { kind: 'preset'; id: typeof COMPANY_LOGOS[number] } | { kind: 'custom'; data: string };
export interface CompanyIdentity { name: string; logo: CompanyLogo }

export function validCompanyName(name: unknown): name is string {
  return typeof name === 'string' && name === name.trim() && [...name].length >= 1
    && [...name].length <= COMPANY_NAME_LIMIT && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(name);
}

function exact(value: unknown, fields: string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === fields.sort().join('|'));
}

/** Bounded PNG data only: no URLs, SVG, animation or executable markup in saves. */
function validLogoPng(data: unknown): data is string {
  if (typeof data !== 'string' || data.length > COMPANY_LOGO_LIMIT || !data.startsWith('data:image/png;base64,')) return false;
  const encoded = data.slice(22);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return false;
  const binary = atob(encoded);
  if (btoa(binary) !== encoded || binary.slice(0, 8) !== '\x89PNG\r\n\x1a\n') return false;
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  let offset = 8, header = false, pixels = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), end = offset + 8 + length;
    if (end + 4 > bytes.length) return false;
    const type = binary.slice(offset + 4, offset + 8);
    let crc = 0xffffffff;
    for (let i = offset + 4; i < end; i++) {
      crc ^= bytes[i]!;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end)) return false;
    if (!header && type !== 'IHDR') return false;
    if (type === 'IHDR') {
      if (header || length !== 13) return false;
      const width = view.getUint32(offset + 8), height = view.getUint32(offset + 12);
      if (!width || !height || width > 128 || height > 128 || bytes[offset + 16] !== 8
        || ![0, 2, 4, 6].includes(bytes[offset + 17]!) || bytes[offset + 18] !== 0
        || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0) return false;
      header = true;
    } else if (type === 'IDAT') { pixels = true; }
    else if (type === 'IEND') return header && pixels && length === 0 && end + 4 === bytes.length;
    else if (!['sRGB', 'gAMA', 'cHRM', 'pHYs'].includes(type)) return false;
    offset = end + 4;
  }
  return false;
}

export function validateCompanyIdentity(value: unknown): CompanyIdentity {
  if (!exact(value, ['name', 'logo']) || !validCompanyName(value.name)) throw new Error('公司名称须为 1–24 个字符，不能包含控制字符');
  const logo = value.logo;
  if (!(exact(logo, ['kind', 'id']) && logo.kind === 'preset' && COMPANY_LOGOS.includes(logo.id as typeof COMPANY_LOGOS[number]))
    && !(exact(logo, ['kind', 'data']) && logo.kind === 'custom' && validLogoPng(logo.data))) throw new Error('公司标志无效，请重新选择图片');
  return structuredClone(value) as unknown as CompanyIdentity;
}
