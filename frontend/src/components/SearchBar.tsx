import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Search, X, Filter } from 'lucide-react'
import type { SearchFilter } from '../types/clipboard'
import { useTranslation } from '../lib/i18n'

interface SearchBarProps {
  filter: SearchFilter
  onSearch: (filter: SearchFilter) => void
  isSearching?: boolean
  placeholder?: string
}

export function SearchBar({ filter, onSearch, isSearching = false, placeholder = 'Search…' }: SearchBarProps) {
  const [value, setValue] = useState(filter.query)
  const [showFilters, setShowFilters] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t = useTranslation()

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function emitSearch(query: string, itemType?: string, timeRange?: string) {
    onSearch({
      query,
      itemType: itemType ?? filter.itemType,
      timeRange: timeRange ?? filter.timeRange,
    })
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setValue(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => emitSearch(next), 300)
  }

  function handleClear() {
    setValue('')
    onSearch({ query: '', itemType: '', timeRange: '' })
    setShowFilters(false)
    inputRef.current?.focus()
  }

  function handleTypeChange(itemType: string) {
    emitSearch(value, itemType)
  }

  function handleTimeChange(timeRange: string) {
    emitSearch(value, undefined, timeRange)
  }

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const hasFilters = filter.itemType !== '' || filter.timeRange !== ''

  return (
    <div className="flex flex-col w-full gap-1">
      {/* Search input row */}
      <div className="relative flex items-center w-full">
        <Search
          className="absolute left-3 text-muted-foreground pointer-events-none"
          size={16}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          aria-label={placeholder}
          className={[
            'w-full h-9 pl-9 pr-16 rounded-md text-sm',
            'bg-muted text-foreground placeholder:text-muted-foreground',
            'border border-border focus:outline-none focus:ring-1 focus:ring-ring',
            'transition-colors',
            isSearching ? 'opacity-70' : '',
          ].join(' ')}
        />
        <div className="absolute right-2 flex items-center gap-0.5">
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(v => !v)}
            aria-label={t('filter')}
            className={[
              'p-1 rounded transition-colors',
              showFilters || hasFilters
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Filter size={14} />
          </button>
          {/* Clear */}
          {(value || hasFilters) && (
            <button
              onClick={handleClear}
              aria-label="Clear search"
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips row */}
      {showFilters && (
        <div className="flex flex-wrap gap-1 px-1">
          {/* Type filter */}
          <FilterChip
            label={t('filter_all')}
            active={filter.itemType === ''}
            onClick={() => handleTypeChange('')}
          />
          <FilterChip
            label={t('filter_text')}
            active={filter.itemType === 'text'}
            onClick={() => handleTypeChange('text')}
          />
          <FilterChip
            label={t('filter_image')}
            active={filter.itemType === 'image'}
            onClick={() => handleTypeChange('image')}
          />

          <span className="w-px h-5 bg-border self-center mx-0.5" />

          {/* Time filter */}
          <FilterChip
            label={t('filter_anytime')}
            active={filter.timeRange === ''}
            onClick={() => handleTimeChange('')}
          />
          <FilterChip
            label="1h"
            active={filter.timeRange === '1h'}
            onClick={() => handleTimeChange('1h')}
          />
          <FilterChip
            label="24h"
            active={filter.timeRange === '24h'}
            onClick={() => handleTimeChange('24h')}
          />
          <FilterChip
            label="7d"
            active={filter.timeRange === '7d'}
            onClick={() => handleTimeChange('7d')}
          />
          <FilterChip
            label="30d"
            active={filter.timeRange === '30d'}
            onClick={() => handleTimeChange('30d')}
          />
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-accent',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
