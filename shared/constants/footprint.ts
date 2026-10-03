export interface Rect {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export const HQ_BASE_HALF_SIZE = 10;
export const DEFAULT_EXPAND_MARGIN = 2;

export function getHQRect(x: number, y: number): Rect {
    return {
        minX: x - HQ_BASE_HALF_SIZE,
        minY: y - HQ_BASE_HALF_SIZE,
        maxX: x + HQ_BASE_HALF_SIZE,
        maxY: y + HQ_BASE_HALF_SIZE,
    };
}

export function getLandmarkRect(x: number, y: number, w: number, h: number): Rect {
    return {
        minX: x,
        minY: y,
        maxX: x + w - 1,
        maxY: y + h - 1,
    };
}

export function expandRect(rect: Rect, margin: number = DEFAULT_EXPAND_MARGIN): Rect {
    return {
        minX: rect.minX - margin,
        minY: rect.minY - margin,
        maxX: rect.maxX + margin,
        maxY: rect.maxY + margin,
    };
}
