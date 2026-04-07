import React, { createContext, useContext, useMemo, useState } from 'react';
import type { PostFeedMode } from '../api/article';

/** 综合=帖子+回答+（仅 0 回答且接口返回了 answer_count 的）求助；帖子/求助/回答为单列 */
export type CommunityTab = 'combined' | 'post' | 'help' | 'answer';

type Ctx = {
  feedMode: PostFeedMode;
  setFeedMode: (m: PostFeedMode) => void;
  communityTab: CommunityTab;
  setCommunityTab: (t: CommunityTab) => void;
};

const CommunityFeedContext = createContext<Ctx | null>(null);

export function CommunityFeedProvider({ children }: { children: React.ReactNode }) {
  const [feedMode, setFeedMode] = useState<PostFeedMode>('latest');
  const [communityTab, setCommunityTab] = useState<CommunityTab>('combined');
  const value = useMemo(
    () => ({ feedMode, setFeedMode, communityTab, setCommunityTab }),
    [feedMode, communityTab],
  );
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
