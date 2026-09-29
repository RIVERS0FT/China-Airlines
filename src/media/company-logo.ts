import { COMPANY_LOGO_LIMIT, type CompanyLogo } from '../core/company-identity.js';

export class LogoUploadError extends Error {
  constructor(public reason: 'type' | 'size' | 'decode' | 'dimensions') { super(reason); }
}

export async function verifyCompanyLogo(logo: CompanyLogo) {
  if (logo.kind !== 'custom') return;
  const image = new Image();
  image.src = logo.data;
  try { await image.decode(); } catch { throw new Error('公司标志图片无法读取'); }
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 128 || image.naturalHeight > 128) throw new Error('公司标志图片无法读取');
}

/** Decode locally and normalize once; the original file never leaves the device. */
export async function prepareCompanyLogo(file: File): Promise<CompanyLogo> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new LogoUploadError('type');
  if (!file.size || file.size > 5 * 1024 * 1024) throw new LogoUploadError('size');
  const source = URL.createObjectURL(file), image = new Image();
  try {
    image.src = source;
    try { await image.decode(); } catch { throw new LogoUploadError('decode'); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new LogoUploadError('dimensions');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) throw new LogoUploadError('decode');
    const scale = Math.min(128 / image.naturalWidth, 128 / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
    const data = canvas.toDataURL('image/png');
    if (data.length > COMPANY_LOGO_LIMIT) throw new LogoUploadError('size');
    return { kind: 'custom', data };
  } finally { URL.revokeObjectURL(source); }
}
