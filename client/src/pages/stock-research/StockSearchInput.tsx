import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';

import { marketDataApi } from '@client/src/api';
import type { StockBase } from '@shared/api.interface';
import { boardFullLabel } from '@shared/a-share';

interface StockSearchInputProps {
  onSelect: (code: string, name: string) => void;
  placeholder?: string;
}

const StockSearchInput = ({
  onSelect,
  placeholder = '搜索股票，如：600519 / 贵州茅台 / 茅台',
}: StockSearchInputProps) => {
  const [inputValue, setInputValue] = useState<string>('');
  const [debouncedKeyword, setDebouncedKeyword] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data: searchResults = [], isFetching } = useQuery({
    queryKey: ['stockSearch', debouncedKeyword],
    queryFn: () => marketDataApi.searchStocks(debouncedKeyword),
    enabled: debouncedKeyword.length > 0,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (stock: StockBase) => {
    setInputValue(`${stock.name} (${stock.code})`);
    setShowDropdown(false);
    onSelect(stock.code, stock.name);
  };

  const handleClear = () => {
    setInputValue('');
    setDebouncedKeyword('');
  };

  return (
    <div ref={inputRef} className="relative w-full">
      <div className="relative">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          type="text"
          value={inputValue}
          placeholder={placeholder}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className="w-full pl-11 pr-10 py-3 bg-bg-tertiary border border-border-color rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 transition-colors"
        />
        {inputValue && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showDropdown && debouncedKeyword.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-secondary border border-border-color rounded-lg shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto">
          {isFetching && (
            <div className="px-4 py-3 text-sm text-text-muted text-center">
              搜索中...
            </div>
          )}
          {!isFetching && searchResults.length === 0 && (
            <div className="px-4 py-3 text-sm text-text-muted text-center">
              未找到匹配的股票
            </div>
          )}
          {searchResults.map((stock: StockBase) => (
            <div
              key={stock.code}
              onClick={() => handleSelect(stock)}
              className="px-4 py-2.5 hover:bg-bg-tertiary/50 cursor-pointer flex items-center justify-between border-b border-border-color/50 last:border-b-0 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-text-primary">
                  {stock.name}
                </span>
                <span className="text-xs text-text-muted font-mono">
                  {stock.code}
                </span>
                <span className="text-xs text-text-muted">
                  {boardFullLabel(stock.market, stock.board)}
                </span>
              </div>
              <span className="text-xs text-text-muted">
                {stock.isST ? 'ST' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export { StockSearchInput };
