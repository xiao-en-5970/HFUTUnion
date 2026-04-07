import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserLocation } from '../api/user';

const STORAGE_KEY = '@hfut_marketplace_ref_v1';

export type MarketplaceRefStored =
  | { v: 1; mode: 'saved'; locationId: number }
  | { v: 1; mode: 'gps'; lat: number; lng: number };

export type MarketplaceRefResolved = {
  point: { lat: number; lng: number } | null;
  mode: 'saved' | 'gps' | 'none';
  /**
   * 地址条第二行：地址簿名称（mode=saved）、或「当前定位」、或提示文案。
   * 首行固定为「当前地址」，由界面单独渲染。
   */
  subline: string;
};

function firstWithCoords(locs: UserLocation[]): UserLocation | undefined {
  return locs.find((l) => l.lat != null && l.lng != null && !Number.isNaN(l.lat) && !Number.isNaN(l.lng));
}

function savedName(loc: UserLocation): string {
  return (loc.label && loc.label.trim()) || '地址';
}

/**
 * 根据持久化偏好 + 最新地址簿，解析市集「距离参考点」。
 */
export async function resolveMarketplaceRef(
  locations: UserLocation[],
): Promise<MarketplaceRefResolved> {
  let stored: MarketplaceRefStored | null = null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      stored = JSON.parse(raw) as MarketplaceRefStored;
    }
  } catch {
    stored = null;
  }

  if (stored?.mode === 'saved' && stored.locationId != null) {
    const loc = locations.find((l) => l.id === stored.locationId);
    if (loc) {
      if (loc.lat != null && loc.lng != null) {
        return {
          mode: 'saved',
          point: { lat: loc.lat, lng: loc.lng },
          subline: savedName(loc),
        };
      }
      return {
        mode: 'saved',
        point: null,
        subline: `${savedName(loc)}（无坐标）`,
      };
    }
  }

  if (stored?.mode === 'gps' && stored.lat != null && stored.lng != null) {
    return {
      mode: 'gps',
      point: { lat: stored.lat, lng: stored.lng },
      subline: '当前定位',
    };
  }

  const def = locations.find((l) => l.is_default) || locations[0];
  const withCoords = firstWithCoords(locations);
  const pick = def?.lat != null && def?.lng != null ? def : withCoords;
  if (pick && pick.lat != null && pick.lng != null) {
    return {
      mode: 'saved',
      point: { lat: pick.lat, lng: pick.lng },
      subline: savedName(pick),
    };
  }

  return { mode: 'none', point: null, subline: '点击设置' };
}

export async function saveMarketplaceRefPref(pref: MarketplaceRefStored) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
}
