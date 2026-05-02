import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  AppState,
} from 'react-native';
import OriginalImageViewer from '../components/OriginalImageViewer';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { markOrderMessagesRead } from '../api/chat';
import {
  getOrder,
  orderMessages,
  postOrderMessage,
  sellerConfirmPayment,
  confirmDelivery,
  confirmReceipt,
  updateOrderLocation,
  helpPublisherPay,
  type OrderRow,
} from '../api/orders';
import { uploadOssUserFile } from '../api/oss';
import { fetchUserInfo, fetchUserLocations, type UserLocation } from '../api/user';
import CheckoutAddressModal, { type PaymentProofPick } from '../components/CheckoutAddressModal';
import PaymentQrModal from '../components/PaymentQrModal';
import Screen from '../components/Screen';
import { colors, radius, space } from '../theme/colors';
import { formatDistance } from '../utils/geo';
import {
  GOODS_CATEGORY_HELP,
  ORDER_CHAT_BUYER_PAYMENT_CONFIRM,
  ORDER_CHAT_SELLER_RECEIPT_CONFIRM,
} from '../utils/orderChatUi';
import type { RootStackParamList } from '../navigation/RootStack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

/** 后端：待买方完善地址与付款 */
const ORDER_STATUS_AWAIT_BUYER_LOCATION = 6;

/** 订单消息轮询间隔（无 WebSocket 时保持近似实时） */
const MSG_POLL_MS = 3000;

type Msg = {
  id: number;
  content?: string;
  image_url?: string;
  msg_type?: number;
  created_at?: string;
  sender_id?: number;
};

export default function OrderChatScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'OrderChat'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'OrderChat'>>();
  const rawOrderId = route.params?.orderId;
  const orderId =
    typeof rawOrderId === 'number' && rawOrderId > 0 && !Number.isNaN(rawOrderId)
      ? rawOrderId
      : 0;
  const paramTitle = route.params?.goodTitle;
  const paramRole = route.params?.counterpartRole;

  const [list, setList] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [myId, setMyId] = useState<number | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [goodTitle, setGoodTitle] = useState(paramTitle ?? '');
  const [peerRole, setPeerRole] = useState<'seller' | 'buyer' | null>(paramRole ?? null);
  const [actionBusy, setActionBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** null | checkout=完善地址+付款 | proposal=申请改址 */
  const [checkoutMode, setCheckoutMode] = useState<null | 'checkout' | 'proposal'>(null);
  /** 收款码大图弹窗：买家在待付款阶段点开 */
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [sellerLocOpen, setSellerLocOpen] = useState(false);
  const [sellerAddrText, setSellerAddrText] = useState('');
  const listRef = useRef<FlatList<Msg>>(null);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const listLenRef = useRef(0);

  const st = order?.order_status ?? 0;
  const gt = order?.good?.goods_type ?? 0;
  const isHelp = order?.good?.goods_category === GOODS_CATEGORY_HELP;
  const awaitBuyerLocation = st === ORDER_STATUS_AWAIT_BUYER_LOCATION;

  const isBuyer =
    orderId > 0 &&
    myId != null &&
    order?.user_id != null &&
    Number(order.user_id) === Number(myId);

  const isSeller =
    orderId > 0 &&
    myId != null &&
    order?.good?.user_id != null &&
    Number(order.good.user_id) === Number(myId);

  const hasPendingBuyerAddr =
    order != null &&
    (order.pending_receiver_user_location_id != null ||
      (typeof order.pending_receiver_addr === 'string' && order.pending_receiver_addr.length > 0));

  const loadOrder = useCallback(async (overrideOrderId?: number) => {
    const oid = overrideOrderId ?? orderId;
    if (!oid) {
      return;
    }
    try {
      const o = await getOrder(oid);
      setOrder(o);
      if (o.good?.title) {
        setGoodTitle(o.good.title);
      }
      const me = await fetchUserInfo();
      setMyId(me?.id ?? null);
      if (me?.id != null) {
        const buyerId = o.user_id;
        const sellerId = o.good?.user_id;
        if (buyerId != null && sellerId != null) {
          setPeerRole(Number(me.id) === Number(buyerId) ? 'seller' : 'buyer');
        }
      }
    } catch {
      setOrder(null);
    }
  }, [orderId]);

  const loadMsgs = useCallback(async (overrideOrderId?: number) => {
    const oid = overrideOrderId ?? orderId;
    if (!oid) {
      return;
    }
    try {
      const res = await orderMessages(oid, 1, 100);
      const raw = res.list || [];
      setList(raw.slice().sort((a, b) => (a.id || 0) - (b.id || 0)));
      await markOrderMessagesRead(oid).catch(() => {});
    } catch {
      setList([]);
    }
  }, [orderId]);

  const openAddressModal = async (mode: 'checkout' | 'proposal') => {
    setLocLoading(true);
    setCheckoutMode(mode);
    try {
      const locs = await fetchUserLocations();
      setLocations(locs);
      if (!locs.length) {
        setCheckoutMode(null);
        Alert.alert('提示', '请先添加收货地址（建议地图选点以便计算距离）', [
          { text: '去添加', onPress: () => navigation.navigate('AddressList') },
          { text: '取消', style: 'cancel' },
        ]);
      }
    } catch {
      setCheckoutMode(null);
      Alert.alert('加载地址失败');
    } finally {
      setLocLoading(false);
    }
  };

  const onConfirmBuyerCheckout = async (locId: number, paymentProof?: PaymentProofPick) => {
    if (!paymentProof?.uri) {
      Alert.alert('提示', '请选择付款截图后再提交');
      return;
    }
    setCheckoutMode(null);
    try {
      setActionBusy(true);
      const me = await fetchUserInfo();
      const uid = me?.id;
      if (uid == null) {
        Alert.alert('提示', '请先登录');
        return;
      }
      await updateOrderLocation(orderId, {
        type: 'buyer',
        user_location_id: locId,
        proposal_only: false,
      });
      const imgUrl = await uploadOssUserFile(
        uid,
        paymentProof.uri,
        paymentProof.type || 'image/jpeg',
        paymentProof.fileName || 'payment.jpg',
      );
      await postOrderMessage(orderId, { msg_type: 1, content: ORDER_CHAT_BUYER_PAYMENT_CONFIRM });
      await postOrderMessage(orderId, { msg_type: 2, image_url: imgUrl });
      await loadOrder();
      await loadMsgs();
    } catch (e: any) {
      Alert.alert('提交失败', e?.message || '');
    } finally {
      setActionBusy(false);
    }
  };

  const onConfirmProposalAddress = async (locId: number) => {
    setCheckoutMode(null);
    try {
      setActionBusy(true);
      await updateOrderLocation(orderId, {
        type: 'buyer',
        user_location_id: locId,
        proposal_only: true,
      });
      await loadOrder();
      Alert.alert('已提交', '等卖家确认');
    } catch (e: any) {
      Alert.alert('提交失败', e?.message || '');
    } finally {
      setActionBusy(false);
    }
  };

  const onSellerConfirmBuyerLocation = async () => {
    try {
      setActionBusy(true);
      await updateOrderLocation(orderId, {
        type: 'seller',
        confirm_buyer_location: true,
      });
      await loadOrder();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '');
    } finally {
      setActionBusy(false);
    }
  };

  const onSellerRejectBuyerLocation = async () => {
    try {
      setActionBusy(true);
      await updateOrderLocation(orderId, {
        type: 'seller',
        reject_buyer_location: true,
      });
      await loadOrder();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '');
    } finally {
      setActionBusy(false);
    }
  };

  const submitSellerLocation = async () => {
    const addr = sellerAddrText.trim();
    if (!addr) {
      Alert.alert('提示', '请填写发货地址');
      return;
    }
    setSellerLocOpen(false);
    try {
      setActionBusy(true);
      await updateOrderLocation(orderId, {
        type: 'seller',
        sender_addr: addr,
      });
      await loadOrder();
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '');
    } finally {
      setActionBusy(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let poll: ReturnType<typeof setInterval> | undefined;
      if (orderId) {
        loadOrder();
        loadMsgs();
        poll = setInterval(() => {
          loadMsgs().catch(() => {});
        }, MSG_POLL_MS);
      }
      (async () => {
        const me = await fetchUserInfo();
        setMyId(me?.id ?? null);
      })();
      return () => {
        if (poll) {
          clearInterval(poll);
        }
      };
    }, [orderId, loadOrder, loadMsgs]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && orderId) {
        loadOrder().catch(() => {});
        loadMsgs().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [orderId, loadOrder, loadMsgs]);

  useEffect(() => {
    if (list.length > listLenRef.current) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
    listLenRef.current = list.length;
  }, [list]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: goodTitle
        ? goodTitle.length > 12
          ? `${goodTitle.slice(0, 12)}…`
          : goodTitle
        : '沟通',
      headerRight:
        orderId > 0
          ? () => (
              <TouchableOpacity
                onPress={() => navigation.navigate('OrderDetail', { id: orderId })}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                <Text style={styles.headerLink}>订单</Text>
              </TouchableOpacity>
            )
          : undefined,
    });
  }, [navigation, orderId, goodTitle]);

  const refreshAll = async () => {
    await loadOrder();
    await loadMsgs();
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const sendText = async () => {
    if (!orderId) {
      return;
    }
    if (!text.trim()) {
      return;
    }
    try {
      await postOrderMessage(orderId, { msg_type: 1, content: text.trim() });
      setText('');
      await refreshAll();
    } catch (e: any) {
      Alert.alert('发送失败', e?.message || '');
    }
  };

  const onSellerConfirmPayment = async () => {
    if (!myId) {
      Alert.alert('提示', '请先登录');
      return;
    }
    const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    if (r.didCancel || !r.assets?.[0]?.uri) {
      return;
    }
    const a = r.assets[0];
    const uri = a.uri;
    if (!uri) {
      return;
    }
    try {
      setActionBusy(true);
      const imgUrl = await uploadOssUserFile(
        myId,
        uri,
        a.type || 'image/jpeg',
        a.fileName || 'receipt.jpg',
      );
      await postOrderMessage(orderId, { msg_type: 1, content: ORDER_CHAT_SELLER_RECEIPT_CONFIRM });
      await postOrderMessage(orderId, { msg_type: 2, image_url: imgUrl });
      await sellerConfirmPayment(orderId);
      await refreshAll();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '');
    } finally {
      setActionBusy(false);
    }
  };

  const onConfirmDelivery = async () => {
    if (!myId) {
      Alert.alert('提示', '请先登录');
      return;
    }
    const r = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 9,
    });
    if (r.didCancel || !r.assets?.length) {
      return;
    }
    try {
      setActionBusy(true);
      const urls: string[] = [];
      for (const a of r.assets) {
        const uri = a.uri;
        if (!uri) {
          continue;
        }
        const imgUrl = await uploadOssUserFile(
          myId,
          uri,
          a.type || 'image/jpeg',
          a.fileName || 'delivery.jpg',
        );
        urls.push(imgUrl);
      }
      if (urls.length === 0) {
        Alert.alert('提示', '请至少选择一张送达凭证照片');
        return;
      }
      await confirmDelivery(orderId, { delivery_images: urls });
      await refreshAll();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '');
    } finally {
      setActionBusy(false);
    }
  };

  const onConfirmReceipt = async () => {
    try {
      setActionBusy(true);
      await confirmReceipt(orderId);
      await refreshAll();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '');
    } finally {
      setActionBusy(false);
    }
  };

  // 有偿求助：发布者上传付酬截图，订单从「进行中」转到「已付酬 · 待接单者确认」
  const onHelpPublisherPay = async () => {
    if (!myId) {
      Alert.alert('提示', '请先登录');
      return;
    }
    const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    if (r.didCancel || !r.assets?.[0]?.uri) {
      return;
    }
    const a = r.assets[0];
    const uri = a.uri;
    if (!uri) {
      return;
    }
    try {
      setActionBusy(true);
      const imgUrl = await uploadOssUserFile(
        myId,
        uri,
        a.type || 'image/jpeg',
        a.fileName || 'help_pay.jpg',
      );
      await helpPublisherPay(orderId, { payment_image: imgUrl });
      await refreshAll();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '');
    } finally {
      setActionBusy(false);
    }
  };

  const openAttachMenu = () => {
    setAttachMenuVisible(true);
  };

  const pickAndSendImage = async () => {
    setAttachMenuVisible(false);
    if (!orderId) {
      Alert.alert('提示', '缺少订单');
      return;
    }
    if (!myId) {
      Alert.alert('提示', '请先登录');
      return;
    }
    const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    if (r.didCancel || !r.assets?.[0]?.uri) {
      return;
    }
    const a = r.assets[0];
    const uri = a.uri;
    if (!uri) {
      return;
    }
    setUploading(true);
    try {
      const url = await uploadOssUserFile(
        myId,
        uri,
        a.type || 'image/jpeg',
        a.fileName || 'chat.jpg',
      );
      await postOrderMessage(orderId, { msg_type: 2, image_url: url });
      await refreshAll();
    } catch (e: any) {
      Alert.alert('图片发送失败', e?.message || '');
    } finally {
      setUploading(false);
    }
  };

  const renderSellerPendingBuyerBanner = () => {
    if (!order || !isSeller || !hasPendingBuyerAddr || isHelp) {
      return null;
    }
    return (
      <View style={[styles.banner, styles.bannerPending]}>
        <Text style={styles.bannerTitle}>买家申请改址</Text>
        <Text style={styles.bannerAddr}>新地址：{order.pending_receiver_addr || '—'}</Text>
        <Text style={styles.bannerDesc}>确认后更新收货地</Text>
        <View style={styles.bannerRow}>
          <TouchableOpacity
            style={[styles.bannerBtnSm, actionBusy && styles.bannerBtnDisabled]}
            disabled={actionBusy}
            onPress={onSellerConfirmBuyerLocation}>
            {actionBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bannerBtnText}>确认新地址</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bannerBtnGhost, actionBusy && styles.bannerBtnDisabled]}
            disabled={actionBusy}
            onPress={onSellerRejectBuyerLocation}>
            <Text style={styles.bannerBtnGhostText}>拒绝</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHelpBanner = () => {
    if (!order) {
      return null;
    }
    if (st === 5) {
      return (
        <View style={[styles.banner, styles.bannerHelp]}>
          <Text style={styles.bannerTitle}>求助已取消</Text>
          <Text style={styles.bannerDesc}>仍可在此沟通后续问题</Text>
        </View>
      );
    }
    if (st === 4) {
      return (
        <View style={[styles.banner, styles.bannerHelp]}>
          <Text style={styles.bannerTitle}>任务已完成</Text>
          <Text style={styles.bannerDesc}>酬劳已确认；如有问题请在此继续沟通</Text>
        </View>
      );
    }
    if (st === 1 && isSeller) {
      return (
        <View style={[styles.banner, styles.bannerHelp]}>
          <Text style={styles.bannerTitle}>进行中 · 待您支付酬劳</Text>
          <Text style={styles.bannerDesc}>
            请与接单者在此协商进度；完成后上传付酬截图，接单者确认后任务关闭。
          </Text>
          <TouchableOpacity
            style={[styles.bannerBtn, actionBusy && styles.bannerBtnDisabled]}
            disabled={actionBusy}
            onPress={onHelpPublisherPay}>
            {actionBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bannerBtnText}>上传付酬截图</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }
    if (st === 1 && isBuyer) {
      return (
        <View style={[styles.banner, styles.bannerHelpMuted]}>
          <Text style={styles.bannerTitle}>进行中</Text>
          <Text style={styles.bannerDesc}>
            请按求助内容完成任务；发布者会在完成后上传付酬截图。
          </Text>
        </View>
      );
    }
    if (st === 3 && isBuyer) {
      return (
        <View style={[styles.banner, styles.bannerHelp]}>
          <Text style={styles.bannerTitle}>发布者已付酬 · 待您确认</Text>
          <Text style={styles.bannerDesc}>
            请核对付酬截图；确认收到后点下方按钮，任务将标记为已完成。
          </Text>
          <TouchableOpacity
            style={[styles.bannerBtn, actionBusy && styles.bannerBtnDisabled]}
            disabled={actionBusy}
            onPress={onConfirmReceipt}>
            {actionBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bannerBtnText}>确认已收到酬劳</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }
    if (st === 3 && isSeller) {
      return (
        <View style={[styles.banner, styles.bannerHelpMuted]}>
          <Text style={styles.bannerTitle}>已上传付酬 · 待对方确认</Text>
          <Text style={styles.bannerDesc}>
            等待接单者核对付酬截图并点「确认已收到酬劳」。
          </Text>
        </View>
      );
    }
    return null;
  };

  const renderBanner = () => {
    if (orderId && !order) {
      return (
        <View style={styles.banner}>
          <Text style={styles.bannerDesc}>加载订单…</Text>
        </View>
      );
    }
    if (!order) {
      return null;
    }
    if (isHelp) {
      return renderHelpBanner();
    }
    if (st === ORDER_STATUS_AWAIT_BUYER_LOCATION && isBuyer) {
      const hasQr = !!order.good?.payment_qr_url;
      return (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>待付款</Text>
          <Text style={styles.bannerDesc}>
            {hasQr
              ? '扫卖家收款码付款，付款后点「确认付款」上传截图。'
              : '卖家未提供收款码，请在聊天里商定付款方式，付款后点「确认付款」上传截图。'}
          </Text>
          <View style={styles.bannerBtnRow}>
            {hasQr ? (
              <TouchableOpacity
                style={styles.bannerQrBtn}
                activeOpacity={0.85}
                onPress={() => setQrModalVisible(true)}>
                <Ionicons name="qr-code-outline" size={16} color={colors.primary} />
                <Text style={styles.bannerQrText}>查看收款码</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.bannerBtn, styles.bannerBtnGrow, actionBusy && styles.bannerBtnDisabled]}
              disabled={actionBusy}
              onPress={() => openAddressModal('checkout')}>
              {actionBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.bannerBtnText}>确认付款</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    if (st === ORDER_STATUS_AWAIT_BUYER_LOCATION && isSeller) {
      return (
        <View style={[styles.banner, styles.bannerMuted]}>
          <Text style={styles.bannerTitle}>待买家付款</Text>
          <Text style={styles.bannerDesc}>买家还没付款，可先在此沟通</Text>
        </View>
      );
    }
    if (st === 5) {
      return (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>订单已取消</Text>
          <Text style={styles.bannerDesc}>仍可在此沟通</Text>
        </View>
      );
    }
    if (st === 4) {
      return (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>交易已完成</Text>
          <Text style={styles.bannerDesc}>
            有问题可继续和{peerRole === 'seller' ? '卖家' : '买家'}沟通
          </Text>
        </View>
      );
    }
    if (st === 1 && isBuyer) {
      const dm = order.distance_meters;
      return (
        <View style={[styles.banner, styles.bannerMuted]}>
          <Text style={styles.bannerTitle}>待卖家确认收款</Text>
          <Text style={styles.bannerAddr}>收货：{order.receiver_addr || '—'}</Text>
          {dm != null ? (
            <Text style={styles.bannerAddr}>直线距离：{formatDistance(dm)}</Text>
          ) : null}
          <Text style={styles.bannerDesc}>付款凭证已发送，等卖家确认</Text>
        </View>
      );
    }
    if (st === 1 && isSeller) {
      const dm = order.distance_meters;
      return (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>待确认收款</Text>
          <Text style={styles.bannerAddr}>买家收货：{order.receiver_addr || '—'}</Text>
          {dm != null ? (
            <Text style={styles.bannerAddr}>直线距离：{formatDistance(dm)}</Text>
          ) : null}
          <Text style={styles.bannerDesc}>核对买家付款截图后，上传你的收款截图完成确认</Text>
          <TouchableOpacity
            style={[styles.bannerBtn, actionBusy && styles.bannerBtnDisabled]}
            disabled={actionBusy}
            onPress={onSellerConfirmPayment}>
            {actionBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bannerBtnText}>确认收款</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }
    if (st === 2 && isSeller && gt !== 3) {
      return (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{gt === 2 ? '待自提 / 送达' : '待送达'}</Text>
          <Text style={styles.bannerDesc}>送达后上传至少一张凭证图确认</Text>
          <TouchableOpacity
            style={[styles.bannerBtn, actionBusy && styles.bannerBtnDisabled]}
            disabled={actionBusy}
            onPress={onConfirmDelivery}>
            {actionBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bannerBtnText}>上传凭证并确认送达</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }
    if (st === 2 && isBuyer) {
      return (
        <View style={[styles.banner, styles.bannerMuted]}>
          <Text style={styles.bannerTitle}>进行中</Text>
          <Text style={styles.bannerDesc}>
            {gt === 2 ? '请按约定自提或等卖家送达' : '卖家正在发货'}
          </Text>
        </View>
      );
    }
    if (st === 3 && isBuyer) {
      return (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>待确认收货</Text>
          <Text style={styles.bannerDesc}>收到商品无误后点确认</Text>
          <TouchableOpacity
            style={[styles.bannerBtn, actionBusy && styles.bannerBtnDisabled]}
            disabled={actionBusy}
            onPress={onConfirmReceipt}>
            {actionBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bannerBtnText}>确认收货</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }
    if (st === 3 && isSeller) {
      return (
        <View style={[styles.banner, styles.bannerMuted]}>
          <Text style={styles.bannerTitle}>待买家收货</Text>
          <Text style={styles.bannerDesc}>等买家确认收货</Text>
        </View>
      );
    }
    return null;
  };

  const renderMsg = ({ item }: { item: Msg }) => {
    const mt = item.msg_type ?? 1;
    if (mt === 3) {
      return (
        <View style={styles.officialWrap}>
          <Text style={styles.official}>{item.content || ''}</Text>
        </View>
      );
    }
    const mine = myId != null && item.sender_id === myId;
    const mineBubbleStyle = isHelp ? styles.bubbleMineHelp : styles.bubbleMine;
    return (
      <View style={[styles.msgRow, mine ? styles.rowMine : styles.rowOther]}>
        <View style={[styles.bubble, mine ? mineBubbleStyle : styles.bubbleOther]}>
          {mt === 2 && item.image_url ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                if (item.image_url) {
                  setImagePreviewUri(item.image_url);
                }
              }}>
              <Image source={{ uri: item.image_url }} style={styles.msgImg} resizeMode="cover" />
            </TouchableOpacity>
          ) : (
            <Text style={[styles.msgText, mine && styles.msgTextMine]}>{item.content || ''}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen scroll={false} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        {peerRole ? (
          <View style={[styles.roleBar, isHelp && styles.roleBarHelp]}>
            <Text style={[styles.roleBarText, isHelp && styles.roleBarTextHelp]}>
              {isHelp
                ? `对方是${peerRole === 'seller' ? '发布者' : '接单者'}`
                : `对方是${peerRole === 'seller' ? '卖家' : '买家'}`}
            </Text>
          </View>
        ) : null}
        {renderSellerPendingBuyerBanner()}
        {renderBanner()}
        <FlatList
          ref={listRef}
          data={list}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMsg}
          contentContainerStyle={[styles.list, list.length === 0 && styles.listEmpty]}
          ListEmptyComponent={
            <Text style={styles.listEmptyText}>
              {isHelp
                ? isSeller
                  ? '先和接单者聊聊需求，完成后点上方付酬'
                  : '先和发布者聊聊进度，完成后等对方付酬'
                : awaitBuyerLocation
                  ? '付款请点上方「确认付款」'
                  : '暂无消息'}
            </Text>
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="输入消息…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={800}
          />
          <TouchableOpacity
            onPress={openAttachMenu}
            style={styles.iconBtn}
            disabled={uploading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="add-circle-outline" size={30} color={colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={sendText} style={styles.sendBtn} activeOpacity={0.85}>
            <Text style={styles.sendText}>发送</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <CheckoutAddressModal
        visible={checkoutMode !== null}
        onClose={() => setCheckoutMode(null)}
        locations={locations}
        loading={locLoading}
        goodsLat={order?.good?.goods_lat}
        goodsLng={order?.good?.goods_lng}
        goodsTypeLabel={order?.good?.goods_type_label}
        proposalOnly={checkoutMode === 'proposal'}
        paymentProofRequired={checkoutMode === 'checkout'}
        headerTitle={
          checkoutMode === 'proposal' ? '修改收货地址' : '确认付款'
        }
        hint={
          checkoutMode === 'proposal'
            ? '提交后等卖家确认'
            : '选收货地址，上传付款截图'
        }
        submitLabel={checkoutMode === 'proposal' ? '提交申请' : '提交'}
        onConfirm={(locId, proof) => {
          if (checkoutMode === 'proposal') {
            onConfirmProposalAddress(locId);
          } else {
            onConfirmBuyerCheckout(locId, proof);
          }
        }}
      />

      <Modal transparent visible={attachMenuVisible} animationType="fade" onRequestClose={() => setAttachMenuVisible(false)}>
        <View style={styles.attachOverlay}>
          <TouchableOpacity style={styles.attachBackdrop} activeOpacity={1} onPress={() => setAttachMenuVisible(false)} />
          <View style={styles.attachSheet}>
            <Text style={styles.attachTitle}>更多</Text>
            <TouchableOpacity
              style={styles.attachRow}
              onPress={() => {
                pickAndSendImage().catch(() => {});
              }}>
              <Ionicons name="image-outline" size={22} color={colors.primary} />
              <Text style={styles.attachRowText}>发送图片</Text>
            </TouchableOpacity>
            {!isHelp && isBuyer && (st === 1 || st === 2) ? (
              <TouchableOpacity
                style={styles.attachRow}
                onPress={() => {
                  setAttachMenuVisible(false);
                  openAddressModal('proposal').catch(() => {});
                }}>
                <Ionicons name="location-outline" size={22} color={colors.primary} />
                <Text style={styles.attachRowText}>修改收货地址</Text>
              </TouchableOpacity>
            ) : null}
            {!isHelp && isSeller && (st === ORDER_STATUS_AWAIT_BUYER_LOCATION || st === 1 || st === 2) ? (
              <TouchableOpacity
                style={styles.attachRow}
                onPress={() => {
                  setAttachMenuVisible(false);
                  setSellerAddrText(order?.sender_addr ?? '');
                  setSellerLocOpen(true);
                }}>
                <Ionicons name="navigate-outline" size={22} color={colors.primary} />
                <Text style={styles.attachRowText}>修改发货地址</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.attachCancel} onPress={() => setAttachMenuVisible(false)}>
              <Text style={styles.attachCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <OriginalImageViewer
        uris={imagePreviewUri ? [imagePreviewUri] : []}
        initialIndex={0}
        visible={!!imagePreviewUri}
        onRequestClose={() => setImagePreviewUri(null)}
      />

      <PaymentQrModal
        visible={qrModalVisible && !isHelp}
        qrUrl={order?.good?.payment_qr_url ?? null}
        payeeName={goodTitle ? `商品《${goodTitle}》卖家` : '卖家'}
        onPickProof={() => openAddressModal('checkout')}
        onClose={() => setQrModalVisible(false)}
      />

      <Modal transparent visible={sellerLocOpen} animationType="slide" onRequestClose={() => setSellerLocOpen(false)}>
        <View style={styles.sellerLocOverlay}>
          <View style={styles.sellerLocCard}>
            <Text style={styles.sellerLocTitle}>修改发货地址</Text>
            <Text style={styles.sellerLocHint}>保存后重新计算到买家的距离</Text>
            <TextInput
              style={styles.sellerLocInput}
              placeholder="发货/自提点地址"
              value={sellerAddrText}
              onChangeText={setSellerAddrText}
              multiline
            />
            <View style={styles.sellerLocActions}>
              <TouchableOpacity style={styles.sellerLocGhost} onPress={() => setSellerLocOpen(false)}>
                <Text style={styles.sellerLocGhostText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sellerLocOk}
                onPress={() => {
                  submitSellerLocation().catch(() => {});
                }}>
                <Text style={styles.sellerLocOkText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerLink: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  roleBar: {
    paddingVertical: 8,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  roleBarText: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  roleBarHelp: { backgroundColor: '#FFF7ED' },
  roleBarTextHelp: { color: '#B45309', fontWeight: '600' },
  banner: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: '#E8F5F4',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  bannerMuted: { backgroundColor: '#F3F4F6' },
  bannerPending: {
    backgroundColor: '#FFF7ED',
    borderBottomColor: '#FDBA74',
  },
  // 有偿求助整体用橙色系，和二手商品的青绿系拉开区分
  bannerHelp: {
    backgroundColor: '#FFF7ED',
    borderBottomColor: '#FDBA74',
  },
  bannerHelpMuted: {
    backgroundColor: '#FFFBEB',
    borderBottomColor: '#FDE68A',
  },
  bannerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, alignItems: 'center' },
  bannerBtnSm: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    minWidth: 120,
    alignItems: 'center',
  },
  bannerBtnGhost: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bannerBtnGhostText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  attachOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  attachBackdrop: { flex: 1 },
  attachSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.md,
    paddingBottom: 28,
    paddingTop: 8,
  },
  attachTitle: { fontSize: 13, color: colors.textMuted, marginBottom: 8, textAlign: 'center' },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  attachRowText: { fontSize: 16, fontWeight: '600', color: colors.text },
  attachCancel: { paddingVertical: 16, alignItems: 'center' },
  attachCancelText: { fontSize: 16, color: colors.textMuted, fontWeight: '600' },
  sellerLocOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: space.lg,
  },
  sellerLocCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
  },
  sellerLocTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sellerLocHint: { fontSize: 12, color: colors.textMuted, marginTop: 8, lineHeight: 18 },
  sellerLocInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    minHeight: 80,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
  sellerLocActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: space.md },
  sellerLocGhost: { paddingVertical: 10, paddingHorizontal: 16 },
  sellerLocGhostText: { color: colors.textSecondary, fontWeight: '600' },
  sellerLocOk: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.md,
  },
  sellerLocOkText: { color: '#fff', fontWeight: '700' },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  bannerDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },
  bannerAddr: { fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 18 },
  bannerBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    minWidth: 160,
    alignItems: 'center',
  },
  bannerBtnDisabled: { opacity: 0.6 },
  bannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  bannerBtnRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 10 },
  bannerBtnGrow: { flex: 1, marginTop: 0, alignSelf: 'auto', alignItems: 'center' },
  bannerQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  bannerQrText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  list: { padding: space.md, paddingBottom: 12, flexGrow: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center', minHeight: 120 },
  listEmptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    paddingHorizontal: space.lg,
  },
  msgRow: { marginBottom: space.sm, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleMineHelp: { backgroundColor: '#F97316' },
  bubbleOther: { backgroundColor: '#ECEFF2' },
  msgText: { fontSize: 16, color: colors.text, lineHeight: 22 },
  msgTextMine: { color: '#fff' },
  msgImg: { width: 200, height: 200, borderRadius: radius.sm },
  officialWrap: { alignItems: 'center', marginBottom: space.sm },
  official: {
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: '#EEF1F4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 6,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  iconBtn: { padding: 4, marginBottom: 2 },
  sendBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 2,
  },
  sendText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
});
