import { useState, useRef, useEffect } from 'react';
import { Plus, X, Search } from 'lucide-react';
import type { StockBase } from '@shared/api.interface';
import { marketDataApi } from '@client/src/api';
import { logger } from '@client/src/api';

interface SelectedStock {
  code: string;
  name: string;
}

interface StockSelectorProps {
  stocks: SelectedStock[];
  onChange: (stocks: SelectedStock[]) => void;
  onCompare: () => void;
  loading: boolean;
}

const MIN_STOCKS = 2;
const MAX_STOCKS = 5;

const StockSelector = ({ stocks, onChange, onCompare, loading }: StockSelectorProps) => {
  const [searchIndex, setSearchIndex] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<StockBase[]>([]);
  const [searching, setSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSearchIndex(null);
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!keyword.trim() || searchIndex === null) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await marketDataApi.searchStocks(keyword.trim());
        setResults(data);
      } catch (err) {
        logger.error('search stocks error', { error: err });
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword, searchIndex]);

  const addSlot = () => {
    if (stocks.length >= MAX_STOCKS) return;
    onChange([...stocks, { code: '', name: '' }]);
  };

  const removeSlot = (index: number) => {
    if (stocks.length <= MIN_STOCKS) return;
    onChange(stocks.filter((_, i) => i !== index));
  };

  const handleSelect = (stock: StockBase, index: number) => {
    const next = [...stocks];
    next[index] = { code: stock.code, name: stock.name };
    onChange(next);
    setSearchIndex(null);
    setResults([]);
    setKeyword('');
  };

  const openSearch = (index: number) => {
    setSearchIndex(index);
    setKeyword(stocks[index]?.name || '');
    setResults([]);
  };

  const canCompare = stocks.filter((s) => s.code).length >= MIN_STOCKS;

  return (
    <div className="bg-bg-secondary border border-border-color rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-text-primary">选择对比股票</div>
        <div className="text-xs text-text-muted">
          已选 {stocks.filter((s) => s.code).length} / {MAX_STOCKS} 只
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        {stocks.map((stock, index) => (
          <div
            key={index}
            className="relative flex-1 min-w-[200px] bg-bg-tertiary/60 border border-border-color rounded-lg p-3"
            ref={searchIndex === index ? dropdownRef : undefined}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-muted">股票 {index + 1}</span>
              {stocks.length > MIN_STOCKS && (
                <button
                  onClick={() => removeSlot(index)}
                  className="text-text-muted hover:text-rise transition-colors"
                  title="移除"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {stock.code ? (
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => openSearch(index)}
              >
                <div>
                  <div className="text-sm font-medium text-text-primary">{stock.name}</div>
                  <div className="text-xs text-text-muted font-mono">{stock.code}</div>
                </div>
                <Search size={14} className="text-text-muted" />
              </div>
            ) : (
              <div
                className="flex items-center gap-2 cursor-pointer text-text-muted hover:text-text-primary transition-colors"
                onClick={() => openSearch(index)}
              >
                <Search size={14} />
                <span className="text-sm">点击搜索添加</span>
              </div>
            )}

            {searchIndex === index && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-bg-secondary border border-border-color rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="p-2 border-b border-border-color">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="输入代码或名称"
                      autoFocus
                      className="w-full pl-8 pr-3 py-2 bg-bg-tertiary border border-border-color rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60"
                    />
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {searching && (
                    <div className="px-3 py-4 text-xs text-text-muted text-center">搜索中...</div>
                  )}
                  {!searching && results.length === 0 && keyword.trim() && (
                    <div className="px-3 py-4 text-xs text-text-muted text-center">无匹配结果</div>
                  )}
                  {!searching && results.length > 0 && results.map((item) => (
                    <button
                      key={item.code}
                      onClick={() => handleSelect(item, index)}
                      className="w-full px-3 py-2 text-left hover:bg-bg-tertiary transition-colors flex items-center justify-between"
                    >
                      <span className="text-sm text-text-primary">{item.name}</span>
                      <span className="text-xs text-text-muted font-mono">{item.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {stocks.length < MAX_STOCKS && (
          <button
            onClick={addSlot}
            className="flex-1 min-w-[200px] min-h-[76px] bg-bg-tertiary/30 border border-dashed border-border-color rounded-lg flex flex-col items-center justify-center gap-1 text-text-muted hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Plus size={20} />
            <span className="text-xs">添加股票</span>
          </button>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={onCompare}
          disabled={!canCompare || loading}
          className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
            canCompare && !loading
              ? 'bg-primary text-primary-foreground hover:opacity-90'
              : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
          }`}
        >
          {loading ? '对比中...' : '开始对比'}
        </button>
      </div>
    </div>
  );
};

export default StockSelector;
