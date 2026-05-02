import React, { createContext, useContext, useMemo, useState } from 'react';
import type { PostFeedMode } from '../api/article';

type Ctx = {
  feedMode: PostFeedMode;
  setFeedMode: (m: PostFeedMode) => void;
};

const CommunityFeedContext = createContext<Ctx | null>(null);

export function CommunityFeedProvider({ children }: { children: React.ReactNode }) {
  // 默认进入即个性化推荐；用户可在顶栏的排序下拉里切到「最新 / 热门」
  const [feedMode, setFeedMode] = useState<PostFeedMode>('recommend');
  const value = useMemo(() => ({ feedMode, setFeedMode }), [feedMode]);
  return (
    <CommunityFeedContext.Provider value={value}>{children}</CommunityFeedContext.Provider>
  );
}

export function useCommunityFeedMode(): Ctx {
  const ctx = useContext(CommunityFeedContext);
  if (!ctx) {
    throw new Error('useCommunityFeedMode must be used within CommunityFeedProvider');
  }
  return ctx;
}
