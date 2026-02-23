/**
 * MasterclassTab — Pinterest / IG Reels-style video library
 *
 * Layout:
 *   • Category pill filters (subscribe-able topic folders)
 *   • Search bar
 *   • Masonry grid of video thumbnails
 *   • Click → modal with embedded video player + details
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useCategories,
  useVideos,
  useFeaturedVideos,
  useSubscriptions,
  useSubscribe,
  useUnsubscribe,
} from "@/hooks/use-masterclass";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Play,
  Clock,
  X,
  BookmarkPlus,
  BookmarkCheck,
  SlidersHorizontal,
  Film,
} from "lucide-react";
import type { MasterclassVideo, MasterclassCategory } from "@shared/schema";

// ─── Masonry helpers ───────────────────────────────────────────────────────

/** Distribute items into N columns trying to balance total "height" */
function distributeColumns<T>(items: T[], cols: number, heightFn: (item: T, idx: number) => number): T[][] {
  const columns: T[][] = Array.from({ length: cols }, () => []);
  const heights = new Array(cols).fill(0);

  for (let i = 0; i < items.length; i++) {
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest].push(items[i]);
    heights[shortest] += heightFn(items[i], i);
  }

  return columns;
}

// ─── Video Card (Pinterest pin style) ──────────────────────────────────────

function VideoCard({
  video,
  index: idx,
  onClick,
}: {
  video: MasterclassVideo;
  index: number;
  onClick: () => void;
}) {
  // Vary heights like Pinterest does (based on hash of id)
  const heightVariant = useMemo(() => {
    const hash = video.id.charCodeAt(0) + video.id.charCodeAt(video.id.length - 1);
    return hash % 3; // 0 = tall, 1 = medium, 2 = short
  }, [video.id]);

  const aspectClass =
    heightVariant === 0
      ? "aspect-[3/4]"
      : heightVariant === 1
        ? "aspect-[4/5]"
        : "aspect-square";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(idx * 0.03, 0.3), duration: 0.3 }}
    >
      <div
        className="group relative cursor-pointer rounded-xl overflow-hidden mb-3"
        onClick={onClick}
      >
        {/* Thumbnail */}
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className={`w-full object-cover ${aspectClass} transition-transform duration-300 group-hover:scale-105`}
            loading="lazy"
          />
        ) : (
          <div
            className={`w-full ${aspectClass} bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center`}
          >
            <Film className="w-10 h-10 text-muted-foreground/40" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play className="w-5 h-5 text-black ml-0.5" />
            </div>
          </div>
        </div>

        {/* Duration badge */}
        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {video.duration}
          </div>
        )}

        {/* Featured indicator */}
        {video.isFeatured && (
          <div className="absolute top-2 left-2 bg-[hsl(var(--gold))] text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
            Featured
          </div>
        )}
      </div>

      {/* Caption (below card like Pinterest) */}
      <div className="px-0.5 pb-1">
        <h4 className="text-sm font-medium line-clamp-2 leading-tight">
          {video.title}
        </h4>
        {video.instructor && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {video.instructor}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Category Pill ─────────────────────────────────────────────────────────

function CategoryPill({
  category,
  isSubscribed,
  isSelected,
  onToggleSubscribe,
  onSelect,
}: {
  category: MasterclassCategory;
  isSubscribed: boolean;
  isSelected: boolean;
  onToggleSubscribe: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={onSelect}
        className={`px-3 py-1.5 rounded-full text-sm transition-all duration-200 ${
          isSelected
            ? "bg-foreground text-background font-medium"
            : isSubscribed
              ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] border border-[hsl(var(--gold))]/30"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        {category.icon && <span className="mr-1">{category.icon}</span>}
        {category.name}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSubscribe();
        }}
        className="p-1 rounded-full hover:bg-muted transition-colors"
        title={isSubscribed ? "Unfollow" : "Follow"}
      >
        {isSubscribed ? (
          <BookmarkCheck className="w-3.5 h-3.5 text-[hsl(var(--gold))]" />
        ) : (
          <BookmarkPlus className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

// ─── Video Detail Modal ────────────────────────────────────────────────────

function VideoModal({
  video,
  categoryName,
  onClose,
}: {
  video: MasterclassVideo;
  categoryName?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Video player area */}
        <div className="relative w-full aspect-video bg-black rounded-t-lg overflow-hidden">
          {video.videoUrl.includes("youtube") || video.videoUrl.includes("vimeo") ? (
            <iframe
              src={video.videoUrl}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={video.title}
            />
          ) : (
            <video
              src={video.videoUrl}
              controls
              className="w-full h-full object-contain"
              poster={video.thumbnailUrl || undefined}
            />
          )}
        </div>

        {/* Video details */}
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl">{video.title}</h2>
              {video.instructor && (
                <p className="text-sm text-muted-foreground mt-0.5">{video.instructor}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {video.duration && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  {video.duration}
                </Badge>
              )}
              {categoryName && (
                <Badge variant="secondary" className="text-xs">
                  {categoryName}
                </Badge>
              )}
            </div>
          </div>

          {video.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {video.description}
            </p>
          )}

          {video.tags && video.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {video.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────

export function MasterclassTab() {
  const { data: categories, isLoading: catsLoading } = useCategories();
  const { data: subscriptions } = useSubscriptions();
  const subscribeMutation = useSubscribe();
  const unsubscribeMutation = useUnsubscribe();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSubscribed, setShowSubscribed] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<MasterclassVideo | null>(null);

  const subscribedIds = useMemo(
    () => new Set(subscriptions?.map((s) => s.categoryId) || []),
    [subscriptions]
  );

  const { data: videos, isLoading: videosLoading } = useVideos({
    category: selectedCategory || undefined,
    search: search || undefined,
    subscribed: showSubscribed,
  });
  const { data: featuredVideos } = useFeaturedVideos();

  // Build category lookup
  const categoryMap = useMemo(() => {
    const map: Record<string, MasterclassCategory> = {};
    categories?.forEach((c) => { map[c.id] = c; });
    return map;
  }, [categories]);

  // Select which videos to show (featured first when no filters)
  const displayVideos = useMemo(() => {
    if (search || selectedCategory || showSubscribed) return videos || [];
    // Interleave featured at top, then the rest
    const featured = featuredVideos || [];
    const rest = (videos || []).filter((v) => !v.isFeatured);
    return [...featured, ...rest];
  }, [videos, featuredVideos, search, selectedCategory, showSubscribed]);

  // Responsive column count
  const colCount = typeof window !== "undefined" && window.innerWidth < 640 ? 2 : window.innerWidth < 1024 ? 3 : 4;

  const columns = useMemo(
    () =>
      distributeColumns(displayVideos, colCount, (v) => {
        const hash = v.id.charCodeAt(0) + v.id.charCodeAt(v.id.length - 1);
        const variant = hash % 3;
        return variant === 0 ? 4 : variant === 1 ? 3.5 : 3;
      }),
    [displayVideos, colCount]
  );

  const handleToggleSubscribe = (categoryId: string) => {
    if (subscribedIds.has(categoryId)) {
      unsubscribeMutation.mutate(categoryId);
    } else {
      subscribeMutation.mutate(categoryId);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search masterclass videos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-full bg-muted/50 border-0 focus-visible:ring-1"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category filters */}
      {!catsLoading && categories && categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin -mx-1 px-1">
          {/* "All" pill */}
          <button
            onClick={() => { setSelectedCategory(null); setShowSubscribed(false); }}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all duration-200 shrink-0 ${
              !selectedCategory && !showSubscribed
                ? "bg-foreground text-background font-medium"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All
          </button>

          {/* "Following" pill */}
          {subscribedIds.size > 0 && (
            <button
              onClick={() => { setSelectedCategory(null); setShowSubscribed(!showSubscribed); }}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all duration-200 shrink-0 flex items-center gap-1 ${
                showSubscribed
                  ? "bg-foreground text-background font-medium"
                  : "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/20"
              }`}
            >
              Following
            </button>
          )}

          {categories.map((cat) => (
            <CategoryPill
              key={cat.id}
              category={cat}
              isSubscribed={subscribedIds.has(cat.id)}
              isSelected={selectedCategory === cat.id}
              onToggleSubscribe={() => handleToggleSubscribe(cat.id)}
              onSelect={() => {
                setSelectedCategory(selectedCategory === cat.id ? null : cat.id);
                setShowSubscribed(false);
              }}
            />
          ))}
        </div>
      )}

      {/* Loading state */}
      {videosLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className={`w-full rounded-xl ${i % 3 === 0 ? "aspect-[3/4]" : i % 3 === 1 ? "aspect-[4/5]" : "aspect-square"}`} />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!videosLoading && displayVideos.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <Film className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-display text-lg mb-1">
                {search ? "No videos found" : "Coming Soon"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {search
                  ? `No results for "${search}". Try a different search.`
                  : "Our masterclass library is being curated. Check back soon for expert-led wellness content."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Masonry grid */}
      {!videosLoading && displayVideos.length > 0 && (
        <div className="flex gap-3">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex-1 min-w-0">
              {col.map((video, vidIdx) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  index={colIdx * col.length + vidIdx}
                  onClick={() => setSelectedVideo(video)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Video detail modal */}
      <AnimatePresence>
        {selectedVideo && (
          <VideoModal
            video={selectedVideo}
            categoryName={categoryMap[selectedVideo.categoryId]?.name}
            onClose={() => setSelectedVideo(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
