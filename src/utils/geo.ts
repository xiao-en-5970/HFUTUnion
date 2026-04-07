/** 与后端 geo.HaversineMeters / 订单距离逻辑一致（WGS84 球面直线距离，米） */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || Number.isNaN(meters)) {
    return '';
  }
  if (meters < 1000) {
    return `约 ${meters}m`;
  }
  return `约 ${(meters / 1000).toFixed(1)}km`;
}
