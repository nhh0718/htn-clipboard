import { useState } from 'react'
import type { MouseEvent } from 'react'
import { Pin, Trash2, Copy, Image } from 'lucide-react'
import type { ClipboardItem as ClipboardItemType } from '../types/clipboard'

interface ClipboardItemProps {
  item: ClipboardItemType
  isSelected: boolean
  onCopy: (id: number) => void
  onDelete: (id: number) => void
  onTogglePin: (id: number) => void
}

/** Returns a human-readable relative time string. */
function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function ClipboardItem({
  item,
  isSelected,
  onCopy,
  onDelete,
  onTogglePin,
}: ClipboardItemProps) {
  const [showCopied, setShowCopied] = useState(false)

  function handleCopy() {
    onCopy(item.id)
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 1500)
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation()
    onDelete(item.id)
  }

  function handlePin(e: MouseEvent) {
    e.stopPropagation()
    onTogglePin(item.id)
  }

  const isImage = item.type === 'image'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      onKeyDown={(e) => e.key === 'Enter' && handleCopy()}
      className={[
        'group relative flex flex-col gap-1 px-3 py-2 cursor-pointer',
        'rounded-md border transition-colors select-none',
        'hover:bg-accent/50',
        isSelected ? 'bg-accent border-ring' : 'bg-card border-border',
        item.isPinned ? 'border-l-2 border-l-primary' : '',
      ].join(' ')}
      aria-label={`Clipboard item from ${item.sourceApp}`}
    >
      {/* Top row: type badge + source app + timestamp */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={[
            'shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide',
            isImage
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-emerald-500/20 text-emerald-400',
          ].join(' ')}
        >
          {isImage ? 'img' : 'txt'}
        </span>

        <span className="text-xs text-muted-foreground truncate flex-1">
          {item.sourceApp || 'Unknown'}
        </span>

        <span className="shrink-0 text-xs text-muted-foreground">
          {relativeTime(item.createdAt)}
        </span>
      </div>

      {/* Content preview */}
      {isImage ? (
        <img
          src={`wails://localhost/${item.filePath}`}
          alt="Clipboard screenshot"
          className="max-h-20 rounded object-contain self-start"
          onError={(e) => {
            // Hide broken image gracefully
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <p className="font-mono text-xs text-foreground/90 line-clamp-3 whitespace-pre-wrap break-all leading-relaxed">
          {item.content.slice(0, 200)}
          {item.content.length > 200 ? '…' : ''}
        </p>
      )}

      {/* Action buttons — visible on hover or when selected */}
      <div
        className={[
          'absolute right-2 top-2 flex items-center gap-1',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          isSelected ? 'opacity-100' : '',
        ].join(' ')}
      >
        {showCopied ? (
          <span className="text-[10px] text-emerald-400 font-medium pr-1">
            Copied!
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy() }}
            aria-label="Copy to clipboard"
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy size={12} />
          </button>
        )}

        <button
          onClick={handlePin}
          aria-label={item.isPinned ? 'Unpin item' : 'Pin item'}
          className={[
            'p-1 rounded transition-colors',
            item.isPinned
              ? 'text-primary hover:bg-muted'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          ].join(' ')}
        >
          <Pin size={12} />
        </button>

        <button
          onClick={handleDelete}
          aria-label="Delete item"
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Image placeholder icon when no filePath */}
      {isImage && !item.filePath && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Image size={14} />
          <span className="text-xs">Image</span>
        </div>
      )}
    </div>
  )
}
