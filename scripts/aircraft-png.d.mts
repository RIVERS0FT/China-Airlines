export interface RgbaImage { width: number; height: number; data: Buffer }
export function decodePng(bytes: Buffer): RgbaImage;
export function encodePng(image: RgbaImage): Buffer;
export function registerLayer(source: RgbaImage, canvas: { width: number; height: number }, bounds: { x: number; y: number; width: number; height: number }): RgbaImage;
export function composite(base: RgbaImage, near: RgbaImage): RgbaImage;
