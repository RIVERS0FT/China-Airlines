export interface OrganizationCamera { x: number; y: number; zoom: number }
export interface OrganizationSize { width: number; height: number }
export interface OrganizationPoint { x: number; y: number }
export const ORG_CAMERA_PADDING = 20;
export const ORG_CAMERA_TOOLBAR = 56;
export const ORG_MAX_ZOOM = 2;

/** Camera coordinates are logical UI pixels, independent of the outer game scale. */
export function fitOrganization(content: OrganizationSize, viewport: OrganizationSize): OrganizationCamera {
  const width = Math.max(1, viewport.width - ORG_CAMERA_PADDING * 2);
  const height = Math.max(1, viewport.height - ORG_CAMERA_PADDING * 2 - ORG_CAMERA_TOOLBAR);
  const zoom = Math.min(1.25, width / Math.max(1, content.width), height / Math.max(1, content.height));
  return { x: (viewport.width - content.width * zoom) / 2,
    y: ORG_CAMERA_PADDING + (height - content.height * zoom) / 2, zoom };
}

/** Preserve the world point under the pointer, including at either zoom limit. */
export function zoomOrganization(camera: OrganizationCamera, factor: number, anchor: OrganizationPoint, minZoom: number): OrganizationCamera {
  const zoom = Math.max(minZoom, Math.min(ORG_MAX_ZOOM, camera.zoom * factor));
  const ratio = zoom / camera.zoom;
  return { x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio, zoom };
}
