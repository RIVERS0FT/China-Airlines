export interface RgbaImage { width: number; height: number; data: Buffer }
export function decodePng(bytes: Buffer): RgbaImage;
export function encodePng(image: RgbaImage): Buffer;
