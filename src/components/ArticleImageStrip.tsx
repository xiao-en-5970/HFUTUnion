import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { launchImageLibrary } from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  type PickedArticleImage,
  newArticleImageKey,
} from '../utils/articleImages';
import { colors, radius, space } from '../theme/colors';

const DEFAULT_MAX = 9;

type Props = {
  images: PickedArticleImage[];
  onChange: (next: PickedArticleImage[]) => void;
  maxImages?: number;
  hint?: string;
};

export default function ArticleImageStrip({
  images,
  onChange,
  maxImages = DEFAULT_MAX,
  hint = '长按拖动排序，点 × 删除',
}: Props) {
  const pickImages = async () => {
    const remain = maxImages - images.length;
    if (remain <= 0) {
      return;
    }
    const r = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: remain,
    });
    if (r.didCancel || !r.assets?.length) {
      return;
    }
    const next: PickedArticleImage[] = r.assets
      .filter((a): a is NonNullable<typeof a> & { uri: string } => Boolean(a?.uri))
      .map((a) => ({
        key: newArticleImageKey(),
        uri: a.uri!,
        type: a.type,
        fileName: a.fileName ?? undefined,
      }));
    onChange([...images, ...next].slice(0, maxImages));
  };

  const removeByKey = (key: string) => {
    onChange(images.filter((p) => p.key !== key));
  };

  const renderItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<PickedArticleImage>) => (
    <TouchableOpacity
      style={[styles.thumbWrap, isActive && styles.thumbWrapDragging]}
      onLongPress={drag}
      delayLongPress={160}
      activeOpacity={0.92}>
      <Image source={{ uri: item.uri }} style={styles.thumb} />
      <TouchableOpacity
        style={styles.thumbRemove}
        onPress={() => removeByKey(item.key)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={22} color={colors.danger} />
      </TouchableOpacity>
      <View style={styles.dragHint}>
        <Ionicons name="reorder-three" size={14} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>图片（可选，最多 {maxImages} 张）</Text>
      <Text style={styles.meta}>{hint}</Text>
      <DraggableFlatList
        horizontal
        data={images}
        keyExtractor={(item) => item.key}
        onDragEnd={({ data }) => onChange(data)}
        activationDistance={14}
        containerStyle={styles.draggableList}
        contentContainerStyle={styles.draggableListContent}
        renderItem={renderItem}
        ListFooterComponent={
          images.length < maxImages ? (
            <TouchableOpacity
              style={styles.addTile}
              onPress={() => {
                pickImages().catch(() => {});
              }}>
              <Ionicons name="add" size={32} color={colors.textMuted} />
              <Text style={styles.addTileText}>添加</Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  draggableList: {
    minHeight: 96,
  },
  draggableListContent: {
    gap: 10,
    paddingRight: 4,
    alignItems: 'center',
  },
  thumbWrap: {
    width: 88,
    height: 88,
    marginRight: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  thumbWrapDragging: {
    opacity: 0.95,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  thumb: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
  },
  dragHint: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  addTile: {
    width: 88,
    height: 88,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  addTileText: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
