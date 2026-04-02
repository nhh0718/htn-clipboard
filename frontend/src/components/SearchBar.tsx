import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  isSearching?: boolean
}

export function SearchBar({ onSearch, isSearching = false }: SearchBarProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setValue(next)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSearch(next)
    }, 300)
  }

  function handleClear() {
    setValue('')
    onSearch('')
    inputRef.current?.focus()
  }

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
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
        placeholder="Search clipboard history…"
        aria-label="Search clipboard history"
        className={[
          'w-full h-9 pl-9 pr-8 rounded-md text-sm',
          'bg-muted text-foreground placeholder:text-muted-foreground',
          'border border-border focus:outline-none focus:ring-1 focus:ring-ring',
          'transition-colors',
          isSearching ? 'opacity-70' : '',
        ].join(' ')}
      />
      {value && (
        <button
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
