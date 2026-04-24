import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  FlatList,
} from 'react-native';
import OriginalImageViewer from '../components/OriginalImageViewer';
import LoadingMask from '../components/LoadingMask';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { createOrder } from '../api/orders';
import { getGood } from '../api/goods';
import { likeAdd, likeRemove, collectAdd, collectRemove } from '../api/social';
import Screen from '../components/Screen';
import PrimaryButton from '../components/PrimaryButton';
import SocialActionRow from '../components/SocialActionRow';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors, radius, space } from '../theme/colors';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import { fetchUserInfo } from '../api/user';
import { readCachedUserInfo } from '../utils/userCache';
import { resolveCurrentUserId } from '../utils/userId';
import { markViewed } from '../utils/viewedTracker';

const EXT_GOODS = 4;

const W = Dimensions.get('window').width;
const HERO_H = 360;

function formatPrice(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function discountPercent(marked: number, price: number): number {
  if (marked <= price) {
    return 0;
  }
  return Math.min(99, Math.round((1 - price / marked) * 100));
}

function normalizeFlag(v: unknown): boolean {
  if (v === true || v === 1 || v === '1') {
    return true;
  }
  return false;
}

function normalizeGoodFlags(row: any) {
  if (!row) {
    return row;
  }
  return {
    ...row,
    is_liked: normalizeFlag(row.is_liked ?? row.liked),
    is_collected: normalizeFlag(row.is_collected ?? row.collected),
  };
}

function mergeGoodFromApi(row: any, prev: any) {
  return normalizeGoodFlags({
    ...prev,
    ...row,
    like_count: row.like_count ?? prev.like_count,
    collect_count: row.collect_count ?? prev.collect_count,
    view_count: row.view_count ?? prev.view_count,
  });
}

export default function GoodDetailScreen({ route }: any) {
  const navigation = useNavigation<any>();
  const id = Number(route.params?.id);
  const [g, setG] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wantBusy, setWantBusy] = useState(false);
  const [imgViewerVisible, setImgViewerVisible] = useState(false);
  const [imgViewerIndex, setImgViewerIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [myUserId, setMyUserId] = useState<number | null>(null);

  const cacheKey = `good:detail:v1:${id}`;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const i = viewableItems[0]?.index;
      if (i != null) {
        setGalleryIndex(i);
      }
    },
  ).current;

  const load = useCallback(async () => {
    let hadCache = false;
    try {
      const cached = await cacheGet<any>(cacheKey);
      if (cached && typeof cached === 'object') {
        hadCache = true;
        setG(normalizeGoodFlags(cached));
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }
    try {
      const row = await getGood(id);
      const normalized = normalizeGoodFlags(row);
      setG(normalized);
      await cacheSet(cacheKey, normalized);
    } catch (e: any) {
      if (!hadCache) {
        Alert.alert('加载失败', e?.message || '网络异常');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, cacheKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 进入详情即打标：列表外入口（聊天链接 / 推送等）也能正确变灰
  useEffect(() => {
    if (Number.isFinite(id) && id > 0) {
      markViewed('good', id);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchUserInfo();
        let uid = resolveCurrentUserId(me);
        if (uid == null) {
          uid = resolveCurrentUserId(await readCachedUserInfo());
        }
        if (!cancelled) {
          setMyUserId(uid);
        }
      } catch {
        if (!cancelled) {
          setMyUserId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLike = async () => {
    if (!g) {
      return;
    }
    const was = normalizeFlag(g.is_liked ?? g.liked);
    const snapshot = { ...g };
    const nextLiked = !was;
    setG((row: any) =>
      row
        ? {
            ...row,
            is_liked: nextLiked,
            liked: undefined,
            like_count: Math.max(0, (row.like_count ?? 0) + (nextLiked ? 1 : -1)),
          }
        : row,
    );
    try {
      if (was) {
        await likeRemove(EXT_GOODS, id);
      } else {
        await likeAdd(EXT_GOODS, id);
      }
      const row = await getGood(id);
      setG((prev: any) => {
        if (!prev) {
          return prev;
        }
        const merged = mergeGoodFromApi(row, prev);
        void cacheSet(cacheKey, merged);
        return merged;
      });
    } catch (e: any) {
      setG(snapshot);
      Alert.alert('操作失败', e?.message ?? '');
    }
  };

  const toggleCollect = async () => {
    if (!g) {
      return;
    }
    const was = normalizeFlag(g.is_collected ?? g.collected);
    const snapshot = { ...g };
    const nextCol = !was;
    setG((row: any) =>
      row
        ? {
            ...row,
            is_collected: nextCol,
            collected: undefined,
            collect_count: Math.max(
              0,
              (row.collect_count ?? 0) + (nextCol ? 1 : -1),
            ),
          }
        : row,
    );
    try {
      if (was) {
        await collectRemove(EXT_GOODS, id, 0);
      } else {
        await collectAdd(EXT_GOODS, id, 0);
      }
      const row = await getGood(id);
      setG((prev: any) => {
        if (!prev) {
          return prev;
        }
        const merged = mergeGoodFromApi(row, prev);
        void cacheSet(cacheKey, merged);
        return merged;
      });
    } catch (e: any) {
      setG(snapshot);
      Alert.alert('操作失败', e?.message ?? '');
    }
  };

  const goWant = async () => {
    if (!g) {
      return;
    }
    const sid =
      g.user_id != null && g.user_id !== ''
        ? Number(g.user_id)
        : g.author?.id != null
          ? Number(g.author.id)
          : null;
    if (
      myUserId != null &&
      sid != null &&
      Number.isFinite(sid) &&
      sid === myUserId
    ) {
      Alert.alert('提示', '不能购买自己发布的商品');
      return;
    }
    try {
      setWantBusy(true);
      const { id: orderId } = await createOrder({ goods_id: id });
      navigation.navigate('OrderChat', {
        orderId,
        goodTitle: g.title,
        counterpartRole: 'seller',
      });
    } catch (e: any) {
      Alert.alert('创建订单失败', e?.message || '');
    } finally {
      setWantBusy(false);
    }
  };

  if (!g) {
    return (
      <Screen scroll={false}>
        <LoadingMask visible={loading} hint="加载中…" />
        {!loading ? (
          <Text style={styles.muted}>暂无数据，请下拉重试</Text>
        ) : null}
      </Screen>
    );
  }

  const marked = g.marked_price as number | undefined;
  const hasDisc = marked != null && marked > g.price;
  const pct = hasDisc ? discountPercent(marked, g.price) : 0;

  const galleryUrls = ((g.images as string[] | undefined)?.filter(Boolean) ?? []) as string[];

  const liked = normalizeFlag(g.is_liked ?? g.liked);
  const collected = normalizeFlag(g.is_collected ?? g.collected);

  const sellerUid =
    g.user_id != null && g.user_id !== ''
      ? Number(g.user_id)
      : g.author?.id != null
        ? Number(g.author.id)
        : null;
  const isOwnGood =
    myUserId != null &&
    sellerUid != null &&
    Number.isFinite(sellerUid) &&
    sellerUid === myUserId;

  return (
    <Screen scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.pad}>
        {galleryUrls.length ? (
          <View style={styles.galleryWrap}>
            <FlatList
              data={galleryUrls}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u, i) => `${u}-${i}`}
              getItemLayout={(_, index) => ({
                length: W,
                offset: W * index,
                index,
              })}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              renderItem={({ item: u, index }) => (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => {
                    setImgViewerIndex(index);
                    setImgViewerVisible(true);
                  }}>
                  <Image source={{ uri: u }} style={[styles.hero, { width: W }]} />
                </TouchableOpacity>
              )}
            />
            {galleryUrls.length > 1 ? (
              <View style={styles.galleryBadge} pointerEvents="none">
                <Text style={styles.galleryBadgeText}>
                  {galleryIndex + 1} / {galleryUrls.length}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.hero, styles.ph, { width: W }]} />
        )}

        <View style={styles.priceBlock}>
          <View style={styles.priceMainRow}>
            <Text style={styles.price}>{formatPrice(g.price)}</Text>
            {hasDisc ? (
              <>
                <Text style={styles.old}>{formatPrice(marked)}</Text>
                <View style={styles.discTag}>
                  <Text style={styles.discTagText}>省{pct}%</Text>
                </View>
              </>
            ) : null}
          </View>
          <Text style={styles.title}>{g.title}</Text>
          <View style={styles.chips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{g.goods_type_label || '商品'}</Text>
            </View>
            <Text style={styles.meta}>库存 {g.stock}</Text>
          </View>
          <View style={styles.addrRow}>
            <Text style={styles.addr}>
              {g.goods_addr || g.pickup_addr || '见详情'}
            </Text>
            {g.goods_lat != null && g.goods_lng != null ? (
              <TouchableOpacity
                style={styles.routeBtn}
                onPress={() =>
                  navigation.navigate('MapRoute', {
                    dest: { lng: Number(g.goods_lng), lat: Number(g.goods_lat) },
                    destLabel: g.goods_addr || g.pickup_addr || '商品位置',
                    title: '到商品的路线',
                  })
                }
                activeOpacity={0.85}>
                <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                <Text style={styles.routeBtnText}>路线</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {g.view_count != null || g.like_count != null || g.collect_count != null ? (
            <Text style={styles.statsLine}>
              {[
                g.view_count != null ? `${g.view_count} 浏览` : null,
                g.like_count != null ? `${g.like_count} 赞` : null,
                g.collect_count != null ? `${g.collect_count} 收藏` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <SocialActionRow
            liked={liked}
            collected={collected}
            onLike={toggleLike}
            onCollect={toggleCollect}
            gap={14}
            likeCount={g.like_count ?? 0}
            collectCount={g.collect_count ?? 0}
          />
        </View>

        <Text style={styles.body}>{g.content}</Text>
        <View style={styles.seller}>
          <Text style={styles.sellerLabel}>卖家</Text>
          <Text style={styles.sellerName}>{g.author?.username || '匿名'}</Text>
        </View>
        {isOwnGood ? (
          <Text style={styles.ownGoodHint}>
            这是您发布的商品，无法向自己购买；买家可在「我想要」与您沟通。
          </Text>
        ) : (
          <PrimaryButton title="我想要" onPress={goWant} loading={wantBusy} style={styles.buy} />
        )}
      </ScrollView>

      <OriginalImageViewer
        uris={galleryUrls}
        initialIndex={imgViewerIndex}
        visible={imgViewerVisible}
        onRequestClose={() => setImgViewerVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: 40 },
  galleryWrap: { position: 'relative' },
  galleryBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  galleryBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hero: { height: HERO_H, backgroundColor: colors.border },
  ph: { backgroundColor: colors.bg },
  priceBlock: { paddingHorizontal: space.md, marginTop: space.md },
  priceMainRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  price: { fontSize: 32, fontWeight: '800', color: colors.accent },
  old: {
    fontSize: 16,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  discTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  discTagText: { fontSize: 12, fontWeight: '800', color: '#DC2626' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 12 },
  chips: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10, flexWrap: 'wrap' },
  chip: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  meta: { fontSize: 13, color: colors.textSecondary },
  addr: { fontSize: 14, color: colors.textSecondary, marginTop: 8, lineHeight: 20, flex: 1 },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  routeBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.xl,
  },
  routeBtnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  statsLine: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textMuted,
  },
  actions: {
    marginTop: 12,
    paddingHorizontal: space.md,
  },
  body: { fontSize: 15, lineHeight: 22, color: colors.text, paddingHorizontal: space.md, marginTop: 16 },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: space.md,
    gap: 8,
  },
  sellerLabel: { fontSize: 13, color: colors.textMuted },
  sellerName: { fontSize: 15, fontWeight: '600', color: colors.primary },
  buy: { marginHorizontal: space.md, marginTop: 24 },
  ownGoodHint: {
    marginHorizontal: space.md,
    marginTop: 24,
    padding: space.md,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  muted: { color: colors.textMuted, padding: space.md },
});
