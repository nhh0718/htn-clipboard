import { useRef, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ClipboardItem } from './ClipboardItem'
import type { ClipboardItem as ClipboardItemType } from '../types/clipboard'
import { Loader2 } from 'lucide-react'

interface ClipboardListProps {
  items: ClipboardItemType[]
  selectedId: number | null
  isLoading: boolean
  onCopy: (id: number) => void
  onDelete: (id: number) => void
  onTogglePin: (id: number) => void
  onLoadMore: () => void
}

export function ClipboardList({
  items,
  selectedId,
  isLoading,
  onCopy,
  onDelete,
  onTogglePin,
  onLoadMore,
}: ClipboardListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  })

  // Intersection observer to trigger infinite scroll at bottom sentinel
  const handleLoadMore = useCallback(onLoadMore, [onLoadMore])
  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading) {
          handleLoadMore()
        }
      },
      { root: scrollRef.current, threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleLoadMore, isLoading])

  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
        <span className="text-sm">No clipboard history</span>
      </div>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-2 py-1 scrollbar-thin"
      style={{ contain: 'strict' }}
    >
      {/* Virtual scroll container */}
      <div style={{ height: totalSize, width: '100%', position: 'relative' }}>
        {virtualItems.map((vItem) => {
          const item = items[vItem.index]
          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vItem.start}px)`,
              }}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
            >
              <div className="py-0.5">
                <ClipboardItem
                  item={item}
                  isSelected={item.id === selectedId}
                  onCopy={onCopy}
                  onDelete={onDelete}
                  onTogglePin={onTogglePin}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={loadMoreRef} className="h-4" aria-hidden />

      {/* Bottom loading spinner */}
      {isLoading && items.length > 0 && (
        <div className="flex justify-center py-2">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
