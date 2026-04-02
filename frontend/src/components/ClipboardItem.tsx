import { useState } from 'react'
import type { MouseEvent } from 'react'
import { Pin, Trash2, Copy } from 'lucide-react'
import type { ClipboardItem as ClipboardItemType } from '../types/clipboard'
import { useTranslation } from '../lib/i18n'

interface ClipboardItemProps {
  item: ClipboardItemType
  isSelected: boolean
  onCopy: (id: number) => void
  onDelete: (id: number) => void
  onTogglePin: (id: number) => void
}

function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function ClipboardItem({ item, isSelected, onCopy, onDelete, onTogglePin }: ClipboardItemProps) {
  const [showCopied, setShowCopied] = useState(false)
  const t = useTranslation()
  const isImage = item.type === 'image'

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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      onKeyDown={(e) => e.key === 'Enter' && handleCopy()}
      className={[
        'group flex flex-col gap-1.5 px-3 py-2 cursor-pointer rounded-md border transition-colors select-none',
        isSelected ? 'bg-accent border-ring' : 'bg-card border-border hover:bg-accent/40',
        item.isPinned ? 'border-l-2 border-l-primary' : '',
      ].join(' ')}
    >
      {/* Row 1: badge | source app | actions (hover) | timestamp */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Type badge */}
        <span className={[
          'shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded uppercase tracking-wider',
          isImage ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400',
        ].join(' ')}>
          {isImage ? 'img' : 'txt'}
        </span>

        {/* Source app — takes remaining space */}
        <span className="text-xs text-muted-foreground truncate flex-1">
          {item.sourceApp || 'Unknown'}
        </span>

        {/* Action buttons — hidden until hover/selected, no absolute positioning */}
        <div className={[
          'flex items-center gap-0.5 shrink-0',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          'transition-opacity',
        ].join(' ')}>
          {showCopied ? (
            <span className="text-[10px] text-emerald-400 font-medium px-1">{t('copied')}</span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy() }}
              aria-label="Copy"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Copy size={11} />
            </button>
          )}
          <button
            onClick={handlePin}
            aria-label={item.isPinned ? 'Unpin' : 'Pin'}
            className={[
              'p-1 rounded transition-colors',
              item.isPinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            ].join(' ')}
          >
            <Pin size={11} />
          </button>
          <button
            onClick={handleDelete}
            aria-label="Delete"
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted"
          >
            <Trash2 size={11} />
          </button>
        </div>

        {/* Timestamp — always visible, never hidden by actions */}
        <span className="shrink-0 text-xs text-muted-foreground">
          {relativeTime(item.createdAt)}
        </span>
      </div>

      {/* Row 2: content */}
      {isImage ? (
        <img
          src={`http://localhost:27843/api/v1/image/${item.id}`}
          alt="Clipboard image"
          className="max-h-24 rounded object-contain self-start"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <p className="font-mono text-xs text-foreground/80 line-clamp-3 whitespace-pre-wrap break-all leading-relaxed">
          {item.content.slice(0, 300)}{item.content.length > 300 ? '…' : ''}
        </p>
      )}
    </div>
  )
}
