import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Pressable,
  Alert,
  TextInput,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listGoods, GoodRow, type GoodsListSort } from '../api/goods';
import { fetchUserLocations, type UserLocation } from '../api/user';
import Screen from '../components/Screen';
import { colors, radius, space } from '../theme/colors';
import { haversineMeters, formatDistance } from '../utils/geo';
import {
  resolveMarketplaceRef,
  saveMarketplaceRefPref,
} from '../utils/marketplaceRefLocation';
import {
  ensureAndroidFineLocation,
  formatGpsErrorMessage,
  requestGpsPosition,
} from '../utils/locationGps';
import { cacheGet, cacheSet } from '../utils/cacheStorage';
import CreateFab from '../components/CreateFab';
import LoadingMask from '../components/LoadingMask';
import {
  PAGE_SIZE,
  mergeById,
  hasMorePages,
} from '../utils/pagination';
import { markViewed, useViewedSet } from '../utils/viewedTracker';

function goodsCacheKey(keyword: string, sort: GoodsListSort) {
  const k = keyword.trim() || '__all__';
  return `goods:list:v2:${k}:${sort}`;
}

function formatPrice(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function discountPercent(marked: number, price: number): number {
  if (marked <= price) {
    return 0;
  }
  return Math.min(99, Math.round((1 - price / marked) * 100));
}

export default function GoodListScreen() {
  const navigation = useNavigation<any>();
  const tabBarHeight = useBottomTabBarHeight();
  const [list, setList] = useState<GoodRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const [refPoint, setRefPoint] = useState<{ lat: number; lng: number } | null>(null);
  /** 地址条第二行：地址簿名称 / 当前定位 / 提示 */
  const [refSubline, setRefSubline] = useState('');
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gpsPicking, setGpsPicking] = useState(false);
  const [keyword, setKeyword] = useState('');
  const keywordRef = useRef('');
  const [goodsSort, setGoodsSort] = useState<GoodsListSort>('newest');
  /** 推荐模式下后端返回的 refresh_token，翻页复用保持顺序稳定；下拉刷新清空以触发新一条推荐流 */
  const goodsTokenRef = useRef<string | undefined>(undefined);
  /** 已点击过的商品 ID 集合：点击打标，列表再次渲染变灰字 */
  const viewedGoods = useViewedSet('good');

  const applyLocationsAndRef = useCallback(async (locs: UserLocation[]) => {
    setLocations(locs);
    const r = await resolveMarketplaceRef(locs);
    setRefPoint(r.point);
    setRefSubline(r.subline);
  }, []);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const load = useCallback(async () => {
    const qTrim = keywordRef.current.trim();
    // 推荐模式：每次刷新都应给出新的个性化流，不读也不写本地缓存；其它排序走缓存预热
    const isRecommend = goodsSort === 'recommend' && !qTrim;
    const cacheKey = goodsCacheKey(qTrim, goodsSort);
    let hadCache = false;
    if (!isRecommend) {
      try {
        const cached = await cacheGet<{ list: GoodRow[] }>(cacheKey);
        if (cached?.list?.length) {
          hadCache = true;
          setList(cached.list);
          setListLoading(false);
        }
      } catch {
        /* noop */
      }
    }
    if (!hadCache) {
      setListLoading(true);
    }
    pageRef.current = 1;
    loadingMoreRef.current = false;
    // 新一轮加载：清空推荐 token，让后端返回新 token 开启新个性化流
    goodsTokenRef.current = undefined;
    try {
      const q = qTrim;
      const [res, locs] = await Promise.all([
        listGoods(1, PAGE_SIZE, {
          q: q || undefined,
          sort: goodsSort,
        }),
        fetchUserLocations().catch(() => [] as UserLocation[]),
      ]);
      const rows = res.list || [];
      const total = res.total;
      if (res.refresh_token) {
        goodsTokenRef.current = res.refresh_token;
      }
      setList(rows);
      const more = hasMorePages(rows.length, PAGE_SIZE, total, rows.length);
      setHasMore(more);
      hasMoreRef.current = more;
      if (!isRecommend) {
        await cacheSet(cacheKey, { list: rows });
      }
      await applyLocationsAndRef(locs);
    } catch {
      if (!hadCache) {
        setList([]);
      }
      setHasMore(false);
      hasMoreRef.current = false;
    } finally {
      setListLoading(false);
      setRefreshing(false);
    }
  }, [applyLocationsAndRef, goodsSort]);

  const loadMore = useCallback(async () => {
    if (!hasMoreRef.current || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const qTrim = keywordRef.current.trim();
    try {
      const nextPage = pageRef.current + 1;
      const res = await listGoods(nextPage, PAGE_SIZE, {
        q: qTrim || undefined,
        sort: goodsSort,
        refreshToken: goodsSort === 'recommend' ? goodsTokenRef.current : undefined,
      });
      if (res.refresh_token) {
        goodsTokenRef.current = res.refresh_token;
      }
      const rows = res.list || [];
      const total = res.total;
      setList((prev) => {
        const merged = mergeById(prev, rows);
        const more = hasMorePages(rows.length, PAGE_SIZE, total, merged.length);
        setHasMore(more);
        hasMoreRef.current = more;
        return merged;
      });
      if (rows.length > 0) {
        pageRef.current = nextPage;
      }
    } catch {
      /* keep list */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [goodsSort]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pickSaved = async (loc: UserLocation) => {
    await saveMarketplaceRefPref({ v: 1, mode: 'saved', locationId: loc.id });
    const locs = await fetchUserLocations().catch(() => [] as UserLocation[]);
    await applyLocationsAndRef(locs);
    setPickerOpen(false);
  };

  const pickGps = async () => {
    const ok = await ensureAndroidFineLocation();
    if (!ok) {
      Alert.alert('提示', '需要定位权限才能使用当前定位');
      return;
    }
    setGpsPicking(true);
    try {
      const { latitude, longitude } = await requestGpsPosition();
      await saveMarketplaceRefPref({
        v: 1,
        mode: 'gps',
        lat: latitude,
        lng: longitude,
      });
      const locs = await fetchUserLocations().catch(() => [] as UserLocation[]);
      await applyLocationsAndRef(locs);
      setPickerOpen(false);
    } catch (err) {
      Alert.alert('定位失败', formatGpsErrorMessage(err));
    } finally {
      setGpsPicking(false);
    }
  };

  return (
    <Screen scroll={false}>
      <View style={styles.wrap}>
        <LoadingMask visible={listLoading && list.length === 0} hint="正在加载市集…" />
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={20} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索商品标题"
            placeholderTextColor={colors.textMuted}
            value={keyword}
            onChangeText={(t) => {
              keywordRef.current = t;
              setKeyword(t);
            }}
            onSubmitEditing={() => load()}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={() => load()} hitSlop={8}>
            <Text style={styles.searchGo}>搜索</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.sortRow}>
          <View style={styles.sortLeft}>
            <Text style={styles.sortLabel}>排序</Text>
            <TouchableOpacity
              style={[styles.sortChip, goodsSort === 'recommend' && styles.sortChipOn]}
              onPress={() => setGoodsSort('recommend')}
              activeOpacity={0.85}>
              <Text style={[styles.sortChipText, goodsSort === 'recommend' && styles.sortChipTextOn]}>
                推荐
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortChip, goodsSort === 'newest' && styles.sortChipOn]}
              onPress={() => setGoodsSort('newest')}
              activeOpacity={0.85}>
              <Text style={[styles.sortChipText, goodsSort === 'newest' && styles.sortChipTextOn]}>
                最新上架
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortChip, goodsSort === 'updated_at' && styles.sortChipOn]}
              onPress={() => setGoodsSort('updated_at')}
              activeOpacity={0.85}>
              <Text style={[styles.sortChipText, goodsSort === 'updated_at' && styles.sortChipTextOn]}>
                最近更新
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.refLocationCompact}
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.75}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
            <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.refLocationText} numberOfLines={1}>
              {refSubline || '参考位置'}
            </Text>
            <Ionicons name="chevron-down" size={11} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <FlatList
          style={styles.flex}
          data={list}
          numColumns={2}
          columnWrapperStyle={styles.row}
          keyExtractor={(item) => String(item.id)}
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
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 72 }]}
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.listFooter} color={colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>暂无商品，发布一件闲置试试吧</Text>
          }
          renderItem={({ item }) => {
            const dist =
              refPoint &&
              item.goods_lat != null &&
              item.goods_lng != null &&
              !Number.isNaN(item.goods_lat) &&
              !Number.isNaN(item.goods_lng)
                ? haversineMeters(
                    item.goods_lat,
                    item.goods_lng,
                    refPoint.lat,
                    refPoint.lng,
                  )
                : null;
            const marked = item.marked_price;
            const hasDisc = marked != null && marked > item.price;
            const pct = hasDisc ? discountPercent(marked, item.price) : 0;
            const hasCover = Boolean(item.images?.[0]);
            // 本地 viewedTracker ∪ 后端 is_viewed（跨设备），任一命中即灰字
            const viewed = viewedGoods.has(item.id) || !!item.is_viewed;

            return (
              <TouchableOpacity
                style={[styles.card, !hasCover && styles.cardCompact]}
                activeOpacity={0.85}
                onPress={() => {
                  markViewed('good', item.id);
                  navigation.navigate('GoodDetail', { id: item.id });
                }}>
                {hasCover && item.images?.[0] ? (
                  <>
                    <Image source={{ uri: item.images[0] }} style={styles.cover} />
                    {item.goods_type_label ? (
                      <View style={styles.typeTag}>
                        <Text style={styles.typeTagText} numberOfLines={1}>
                          {item.goods_type_label}
                        </Text>
                      </View>
                    ) : null}
                    <Text
                      numberOfLines={2}
                      style={[styles.title, viewed && styles.viewedText]}>
                      {item.title}
                    </Text>
                  </>
                ) : (
                  <View style={styles.noCoverHead}>
                    <View style={styles.noCoverBadge}>
                      <Text style={styles.noCoverBadgeText}>无图</Text>
                    </View>
                    <View style={styles.noCoverHeadMain}>
                      {item.goods_type_label ? (
                        <View style={styles.typeTagInline}>
                          <Text style={styles.typeTagInlineText} numberOfLines={1}>
                            {item.goods_type_label}
                          </Text>
                        </View>
                      ) : null}
                      <Text
                        numberOfLines={2}
                        style={[styles.titleNoCover, viewed && styles.viewedText]}>
                        {item.title}
                      </Text>
                    </View>
                  </View>
                )}
                <View style={[styles.priceRow, !hasCover && styles.priceRowCompact]}>
                  <Text style={[styles.price, viewed && styles.viewedPrice]}>
                    {formatPrice(item.price)}
                  </Text>
                  {hasDisc ? (
                    <>
                      <Text style={styles.oldPrice}>{formatPrice(marked)}</Text>
                      <View style={styles.discBadge}>
                        <Text style={styles.discBadgeText}>省{pct}%</Text>
                      </View>
                    </>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.metaLine,
                    !hasCover && styles.metaLineCompact,
                    viewed && styles.viewedMeta,
                  ]}
                  numberOfLines={1}>
                  {dist != null
                    ? `距参考点 ${formatDistance(dist)}`
                    : refPoint == null
                      ? '右上角选择参考位置后可显示距离'
                      : '商品无坐标时无法算距'}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        <CreateFab onPress={() => navigation.navigate('GoodCreate')} accessibilityLabel="发布闲置" />
      </View>

      <Modal visible={pickerOpen} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>市集距离参考</Text>
            <Text style={styles.modalHint}>
              用来算商品与你的距离。可从地址簿选一条，或用当前定位。
            </Text>

            <TouchableOpacity
              style={styles.modalGpsRow}
              onPress={() => pickGps()}
              disabled={gpsPicking}
              activeOpacity={0.85}>
              {gpsPicking ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="navigate-outline" size={22} color={colors.primary} />
              )}
              <Text style={styles.modalGpsText}>使用当前定位</Text>
            </TouchableOpacity>

            <Text style={styles.modalSection}>地址簿</Text>
            <FlatList
              style={styles.modalList}
              data={locations}
              keyExtractor={(i) => String(i.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>还没有保存的地址，可在下方管理地址后添加</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalAddrRow}
                  onPress={() => pickSaved(item)}
                  activeOpacity={0.85}>
                  <View style={styles.modalAddrBody}>
                    <Text style={styles.modalAddrLabel}>{item.label || '地址'}</Text>
                    <Text style={styles.modalAddrText} numberOfLines={2}>
                      {item.addr}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity
              style={styles.modalManage}
              onPress={() => {
                setPickerOpen(false);
                navigation.navigate('AddressList');
              }}>
              <Text style={styles.modalManageText}>管理收货地址</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalClose} onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalCloseText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, position: 'relative' },
  flex: { flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 4,
  },
  searchGo: { fontSize: 15, fontWeight: '600', color: colors.primary },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    gap: 8,
  },
  sortLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 4,
    gap: 6,
  },
  sortLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  sortChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sortChipOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  sortChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  sortChipTextOn: { color: colors.primary },
  refLocationCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '38%',
    flexShrink: 0,
    gap: 3,
  },
  refLocationText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  row: { justifyContent: 'space-between', paddingHorizontal: space.md },
  list: { paddingBottom: 32 },
  listFooter: { marginVertical: 16 },
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: space.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardCompact: {
    marginBottom: space.sm,
  },
  cover: { width: '100%', aspectRatio: 1, backgroundColor: colors.border },
  noCoverHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  noCoverBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noCoverBadgeText: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
  noCoverHeadMain: { flex: 1, minWidth: 0 },
  titleNoCover: {
    fontSize: 13,
    lineHeight: 17,
    color: colors.text,
    fontWeight: '500',
  },
  typeTagInline: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
    maxWidth: '100%',
  },
  typeTagInlineText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  typeTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    maxWidth: '70%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeTagText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  title: { fontSize: 14, paddingHorizontal: 8, paddingTop: 8, color: colors.text, fontWeight: '500' },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 6,
    gap: 6,
  },
  price: { fontSize: 17, fontWeight: '800', color: colors.accent },
  oldPrice: {
    fontSize: 12,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  discBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discBadgeText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
  priceRowCompact: { paddingTop: 4 },
  metaLine: {
    fontSize: 11,
    color: colors.textMuted,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 10,
  },
  metaLineCompact: { paddingTop: 2, paddingBottom: 6, fontSize: 10 },
  /** 已看过：标题、价格、距离行全部降灰，让用户一眼看出「这件我点过」 */
  viewedText: { color: colors.textMuted, fontWeight: '400' },
  viewedPrice: { color: colors.textMuted, fontWeight: '700' },
  viewedMeta: { color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: space.lg },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    maxHeight: '78%',
    elevation: 6,
    zIndex: 2,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  modalHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
    lineHeight: 18,
  },
  modalGpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: space.md,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  modalGpsText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  modalSection: {
    marginTop: space.md,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  modalList: { marginTop: 8, maxHeight: 220 },
  modalEmpty: { fontSize: 13, color: colors.textMuted, paddingVertical: 12 },
  modalAddrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalAddrBody: { flex: 1, minWidth: 0 },
  modalAddrLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  modalAddrText: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  modalManage: { marginTop: space.sm, alignItems: 'center', paddingVertical: 8 },
  modalManageText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  modalClose: { marginTop: 4, alignItems: 'center', paddingVertical: 10 },
  modalCloseText: { fontSize: 15, color: colors.textMuted },
});
