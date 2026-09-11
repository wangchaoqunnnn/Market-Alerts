import { useState, useEffect, useMemo } from 'react';
import {
  Star,
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  X,
  Tag,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { watchlistApi, marketDataApi } from '@client/src/api';
import type { WatchlistStock, StockQuote, StockBase } from '@shared/api.interface';
import { formatPrice, formatPercent, getPriceColorClass } from '@client/src/utils/format';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Badge } from '@client/src/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';

interface WatchlistWithQuote extends WatchlistStock {
  quote?: StockQuote;
}

const PRESET_TAGS = ['长线', '短线', '观察', '核心持仓', '成长', '消费', '金融'];

const WatchlistPage = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<WatchlistWithQuote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [activeTag, setActiveTag] = useState<string>('全部');
  const [addDialogOpen, setAddDialogOpen] = useState<boolean>(false);
  const [searchStockKeyword, setSearchStockKeyword] = useState<string>('');
  const [searchStockResults, setSearchStockResults] = useState<StockBase[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<string>('');
  const [tagInputId, setTagInputId] = useState<string | null>(null);
  const [tagInputValue, setTagInputValue] = useState<string>('');
  const [addingStock, setAddingStock] = useState<boolean>(false);

  // 加载自选股列表
  const loadWatchlist = async (): Promise<void> => {
    try {
      setLoading(true);
      const data = await watchlistApi.getWatchlist();
      setStocks(data.map((s: WatchlistStock) => ({ ...s, quote: undefined })));
    } catch (error) {
      logger.error('加载自选股失败', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载行情数据
  const loadQuotes = async (): Promise<void> => {
    if (stocks.length === 0) return;
    try {
      const codes = stocks.map((s: WatchlistWithQuote) => s.stockCode).join(',');
      const quotes = await marketDataApi.getBatchQuotes(codes);
      const quoteMap = new Map<string, StockQuote>();
      quotes.forEach((q: StockQuote) => quoteMap.set(q.code, q));
      setStocks((prev) =>
        prev.map((s: WatchlistWithQuote) => ({
          ...s,
          quote: quoteMap.get(s.stockCode),
        })),
      );
    } catch (error) {
      logger.error('加载行情失败', error);
    }
  };

  useEffect(() => {
    loadWatchlist();
  }, []);

  useEffect(() => {
    if (stocks.length > 0 && !loading) {
      loadQuotes();
    }
    const timer = setInterval(() => {
      if (stocks.length > 0) loadQuotes();
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks.length, loading]);

  // 所有标签集合
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    stocks.forEach((s: WatchlistWithQuote) => {
      s.tags.forEach((t: string) => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, [stocks]);

  // 过滤后的列表
  const filteredStocks = useMemo(() => {
    return stocks.filter((s: WatchlistWithQuote) => {
      const keyword = searchKeyword.toLowerCase();
      const matchKeyword =
        !keyword ||
        s.stockCode.toLowerCase().includes(keyword) ||
        s.stockName.toLowerCase().includes(keyword);
      const matchTag = activeTag === '全部' || s.tags.includes(activeTag);
      return matchKeyword && matchTag;
    });
  }, [stocks, searchKeyword, activeTag]);

  // 统计数据
  const stats = useMemo(() => {
    let riseCount = 0;
    let fallCount = 0;
    let maxRise = 0;
    let maxFall = 0;
    stocks.forEach((s: WatchlistWithQuote) => {
      const change = s.quote?.changePercent ?? 0;
      if (change > 0) {
        riseCount += 1;
        if (change > maxRise) maxRise = change;
      } else if (change < 0) {
        fallCount += 1;
        if (change < maxFall) maxFall = change;
      }
    });
    return { riseCount, fallCount, maxRise, maxFall };
  }, [stocks]);

  // 搜索股票
  const handleSearchStock = async (): Promise<void> => {
    if (!searchStockKeyword.trim()) {
      setSearchStockResults([]);
      return;
    }
    try {
      setSearching(true);
      const results = await marketDataApi.searchStocks(searchStockKeyword);
      setSearchStockResults(results.slice(0, 10));
    } catch (error) {
      logger.error('搜索股票失败', error);
    } finally {
      setSearching(false);
    }
  };

  // 添加自选股
  const handleAddStock = async (stock: StockBase): Promise<void> => {
    try {
      setAddingStock(true);
      await watchlistApi.addWatchlistItem({
        stockCode: stock.code,
        stockName: stock.name,
      });
      await loadWatchlist();
    } catch (error) {
      logger.error('添加自选股失败', error);
    } finally {
      setAddingStock(false);
    }
  };

  // 删除自选股
  const handleRemove = async (id: string): Promise<void> => {
    try {
      await watchlistApi.removeWatchlistItem(id);
      setStocks((prev) => prev.filter((s: WatchlistWithQuote) => s.id !== id));
    } catch (error) {
      logger.error('删除自选股失败', error);
    }
  };

  // 编辑备注
  const startEditNotes = (stock: WatchlistWithQuote): void => {
    setEditingId(stock.id);
    setEditNotes(stock.notes);
  };

  const saveNotes = async (id: string): Promise<void> => {
    try {
      const updated = await watchlistApi.updateWatchlistItem(id, { notes: editNotes });
      setStocks((prev) =>
        prev.map((s: WatchlistWithQuote) =>
          s.id === id ? { ...s, notes: updated.notes, quote: s.quote } : s,
        ),
      );
      setEditingId(null);
    } catch (error) {
      logger.error('更新备注失败', error);
    }
  };

  // 添加标签
  const handleAddTag = async (id: string, tag: string): Promise<void> => {
    const stock = stocks.find((s: WatchlistWithQuote) => s.id === id);
    if (!stock || !tag.trim()) return;
    if (stock.tags.includes(tag.trim())) {
      setTagInputId(null);
      setTagInputValue('');
      return;
    }
    try {
      const newTags = [...stock.tags, tag.trim()];
      const updated = await watchlistApi.updateWatchlistItem(id, { tags: newTags });
      setStocks((prev) =>
        prev.map((s: WatchlistWithQuote) =>
          s.id === id ? { ...s, tags: updated.tags, quote: s.quote } : s,
        ),
      );
      setTagInputId(null);
      setTagInputValue('');
    } catch (error) {
      logger.error('添加标签失败', error);
    }
  };

  // 删除标签
  const handleRemoveTag = async (id: string, tag: string): Promise<void> => {
    const stock = stocks.find((s: WatchlistWithQuote) => s.id === id);
    if (!stock) return;
    try {
      const newTags = stock.tags.filter((t: string) => t !== tag);
      const updated = await watchlistApi.updateWatchlistItem(id, { tags: newTags });
      setStocks((prev) =>
        prev.map((s: WatchlistWithQuote) =>
          s.id === id ? { ...s, tags: updated.tags, quote: s.quote } : s,
        ),
      );
    } catch (error) {
      logger.error('删除标签失败', error);
    }
  };

  // 跳转到个股研究
  const goToResearch = (code: string): void => {
    navigate(`/research?code=${code}`);
  };

  // 检查股票是否已在自选
  const isInWatchlist = (code: string): boolean => {
    return stocks.some((s: WatchlistWithQuote) => s.stockCode === code);
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star size={22} className="text-warning" />
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">自选股</h1>
            <span className="px-2 py-0.5 bg-warning/10 text-warning text-xs rounded font-medium">
              {stocks.length} 只
            </span>
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus size={16} />
            <span className="hidden sm:inline">添加</span>
          </Button>
        </div>
        <p className="text-sm text-text-secondary">
          自定义股票池，实时追踪关注标的，支持分组管理与异动提醒
        </p>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4">
          <div className="text-xs text-text-muted mb-1">涨/跌</div>
          <div className="text-lg md:text-xl font-mono tabular-nums">
            <span className="text-rise font-semibold">{stats.riseCount}</span>
            <span className="text-text-muted mx-1">/</span>
            <span className="text-fall font-semibold">{stats.fallCount}</span>
          </div>
        </div>
        <div className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4">
          <div className="text-xs text-text-muted mb-1">最强涨幅</div>
          <div className="text-lg md:text-xl font-mono tabular-nums text-rise font-semibold">
            {stocks.length > 0 ? formatPercent(stats.maxRise) : '--'}
          </div>
        </div>
        <div className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4">
          <div className="text-xs text-text-muted mb-1">最大跌幅</div>
          <div className="text-lg md:text-xl font-mono tabular-nums text-fall font-semibold">
            {stocks.length > 0 ? formatPercent(stats.maxFall) : '--'}
          </div>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          placeholder="搜索股票代码或名称..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 分组标签 */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTag('全部')}
          className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors ${
            activeTag === '全部'
              ? 'bg-bg-tertiary text-text-primary font-medium'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60'
          }`}
        >
          全部
          <span className="ml-1 text-text-muted">{stocks.length}</span>
        </button>
        {allTags.map((tag: string) => {
          const count = stocks.filter((s: WatchlistWithQuote) => s.tags.includes(tag)).length;
          return (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors ${
                activeTag === tag
                  ? 'bg-bg-tertiary text-text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60'
              }`}
            >
              {tag}
              <span className="ml-1 text-text-muted">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 自选股列表 */}
      {loading ? (
        <div className="bg-bg-secondary border border-border-color rounded-lg p-8 flex items-center justify-center">
          <Loader2 size={24} className="text-primary animate-spin" />
        </div>
      ) : filteredStocks.length === 0 ? (
        <div className="bg-bg-secondary border border-dashed border-border-color rounded-lg p-8 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center mb-3">
            <Star size={24} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-primary mb-1">暂无自选股</p>
          <p className="text-xs text-text-muted mb-4">
            点击添加自选股开始追踪您关注的股票
          </p>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus size={16} />
            添加自选股
          </Button>
        </div>
      ) : (
        <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
          {/* 表头 */}
          <div className="grid grid-cols-12 px-4 py-2 bg-bg-tertiary/50 text-xs text-text-muted font-medium border-b border-border-color">
            <div className="col-span-5 sm:col-span-4">股票</div>
            <div className="col-span-3 sm:col-span-2 text-right">现价</div>
            <div className="col-span-4 sm:col-span-2 text-right">涨跌幅</div>
            <div className="hidden sm:block sm:col-span-4">备注/标签</div>
          </div>
          {/* 数据行 */}
          <div className="divide-y divide-border-color/50">
            {filteredStocks.map((stock: WatchlistWithQuote) => (
              <div
                key={stock.id}
                className="grid grid-cols-12 px-4 py-3 items-start text-sm hover:bg-bg-tertiary/30 transition-colors"
              >
                {/* 股票信息 */}
                <div className="col-span-5 sm:col-span-4 min-w-0">
                  <button
                    onClick={() => goToResearch(stock.stockCode)}
                    className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                  >
                    <Star size={14} className="text-warning shrink-0" />
                    <div className="min-w-0">
                      <div className="text-text-primary truncate">{stock.stockName}</div>
                      <div className="text-[10px] text-text-muted font-mono">{stock.stockCode}</div>
                    </div>
                  </button>
                </div>
                {/* 现价 */}
                <div className="col-span-3 sm:col-span-2 text-right font-mono tabular-nums text-text-primary">
                  {stock.quote ? formatPrice(stock.quote.price) : '--'}
                </div>
                {/* 涨跌幅 */}
                <div
                  className={`col-span-4 sm:col-span-2 text-right font-mono tabular-nums font-medium ${
                    stock.quote ? getPriceColorClass(stock.quote.changePercent) : 'text-text-muted'
                  }`}
                >
                  {stock.quote ? formatPercent(stock.quote.changePercent) : '--'}
                </div>
                {/* 备注和标签 */}
                <div className="col-span-12 sm:col-span-4 mt-2 sm:mt-0">
                  {/* 备注 */}
                  {editingId === stock.id ? (
                    <div className="flex gap-1">
                      <Textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="输入备注..."
                        className="text-xs min-h-[60px]"
                        autoFocus
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => saveNotes(stock.id)}
                          className="p-1 text-success hover:text-success/80 transition-colors"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 text-text-muted hover:text-text-secondary transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1">
                      <p
                        className={`text-xs flex-1 ${
                          stock.notes ? 'text-text-secondary' : 'text-text-muted italic'
                        }`}
                      >
                        {stock.notes || '点击编辑添加备注'}
                      </p>
                      <button
                        onClick={() => startEditNotes(stock)}
                        className="p-1 text-text-muted hover:text-primary transition-colors shrink-0"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>
                  )}
                  {/* 标签 */}
                  <div className="flex flex-wrap gap-1 mt-2 items-center">
                    {stock.tags.map((tag: string) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[10px] py-0 px-1.5 gap-1 bg-bg-tertiary/50 border-border-color text-text-secondary"
                      >
                        <Tag size={10} />
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(stock.id, tag)}
                          className="hover:text-destructive transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </Badge>
                    ))}
                    {tagInputId === stock.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={tagInputValue}
                          onChange={(e) => setTagInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddTag(stock.id, tagInputValue);
                            }
                          }}
                          placeholder="标签名"
                          className="h-6 text-xs w-20 px-2"
                          autoFocus
                        />
                        <button
                          onClick={() => handleAddTag(stock.id, tagInputValue)}
                          className="text-success hover:text-success/80"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => {
                            setTagInputId(null);
                            setTagInputValue('');
                          }}
                          className="text-text-muted hover:text-text-secondary"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setTagInputId(stock.id);
                          setTagInputValue('');
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-border-color text-text-muted hover:text-text-secondary hover:border-text-muted transition-colors"
                      >
                        + 标签
                      </button>
                    )}
                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleRemove(stock.id)}
                      className="ml-auto p-1 text-text-muted hover:text-destructive transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 免责声明 */}
      <p className="text-center text-xs text-text-muted pt-2 pb-4">
        ⚠ 自选股数据仅供参考，不构成任何投资建议
      </p>

      {/* 添加自选股对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md bg-bg-secondary border-border-color text-text-primary">
          <DialogHeader>
            <DialogTitle className="text-text-primary">添加自选股</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <Input
                placeholder="搜索股票代码或名称..."
                value={searchStockKeyword}
                onChange={(e) => setSearchStockKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearchStock();
                }}
                className="pl-9"
              />
            </div>
            <Button
              onClick={handleSearchStock}
              disabled={!searchStockKeyword.trim() || searching}
              className="w-full"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              搜索
            </Button>
            {/* 搜索结果 */}
            {searchStockResults.length > 0 && (
              <div className="border border-border-color rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <div className="divide-y divide-border-color/50">
                  {searchStockResults.map((stock: StockBase) => {
                    const added = isInWatchlist(stock.code);
                    return (
                      <div
                        key={stock.code}
                        className="flex items-center justify-between px-3 py-2 hover:bg-bg-tertiary/50 transition-colors"
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => goToResearch(stock.code)}
                        >
                          <div className="text-sm text-text-primary">{stock.name}</div>
                          <div className="text-[10px] text-text-muted font-mono">
                            {stock.code}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted">
                            {stock.board === 'gem' ? '创业板' : stock.board === 'star' ? '科创板' : stock.board === 'bj' ? '北交所' : '主板'}
                          </span>
                          {stock.isST && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-warning/20 text-warning rounded">ST</span>
                          )}
                          {added ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-success/10 text-success border-success/30"
                            >
                              <Check size={10} />
                              已添加
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddStock(stock)}
                              disabled={addingStock}
                              className="text-xs h-7 px-2"
                            >
                              <Plus size={12} />
                              添加
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* 预设标签提示 */}
            <div className="pt-2">
              <p className="text-xs text-text-muted mb-2">快捷标签预设：</p>
              <div className="flex flex-wrap gap-1">
                {PRESET_TAGS.map((tag: string) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] cursor-pointer hover:bg-bg-tertiary border-border-color text-text-secondary"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WatchlistPage;
