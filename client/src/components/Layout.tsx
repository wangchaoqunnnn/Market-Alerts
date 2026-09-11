import { NavLink, Outlet } from 'react-router-dom';
import {
  Zap,
  TrendingUp,
  AlertTriangle,
  Filter,
  FileBarChart,
  GitCompare,
  Star,
  Activity,
  Clock,
  Radio,
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: '/surge', label: '涨速榜', icon: <Zap size={20} /> },
  { path: '/limit-up', label: '涨停个股', icon: <TrendingUp size={20} /> },
  { path: '/limit-broken', label: '炸板监控', icon: <AlertTriangle size={20} /> },
  { path: '/screener', label: '选股工具', icon: <Filter size={20} /> },
  { path: '/research', label: '个股研究', icon: <FileBarChart size={20} /> },
  { path: '/compare', label: '多股对比', icon: <GitCompare size={20} /> },
  { path: '/watchlist', label: '自选股', icon: <Star size={20} /> },
];

const Layout = () => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [marketStatus, setMarketStatus] = useState<'open' | 'closed' | 'pre'>('closed');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      setCurrentTime(timeStr);

      const totalMinutes = hours * 60 + minutes;
      // 9:15-9:25 集合竞价, 9:30-11:30 上午, 13:00-15:00 下午
      if (totalMinutes >= 570 && totalMinutes < 690) {
        // 9:30 - 11:30
        setMarketStatus('open');
      } else if (totalMinutes >= 780 && totalMinutes < 900) {
        // 13:00 - 15:00
        setMarketStatus('open');
      } else if ((totalMinutes >= 555 && totalMinutes < 570) || (totalMinutes >= 690 && totalMinutes < 780)) {
        setMarketStatus('pre');
      } else {
        setMarketStatus('closed');
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  const statusColor =
    marketStatus === 'open'
      ? 'text-rise'
      : marketStatus === 'pre'
        ? 'text-warning'
        : 'text-text-muted';
  const statusLabel =
    marketStatus === 'open' ? '交易中' : marketStatus === 'pre' ? '休市/集合竞价' : '已休市';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary text-text-primary font-sans">
      {/* 桌面端侧边栏 */}
      <aside className="hidden md:flex flex-col w-56 lg:w-60 bg-bg-secondary border-r border-border-color shrink-0">
        {/* Logo / 标题区 */}
        <div className="h-14 flex items-center px-4 border-b border-border-color">
          <Activity size={22} className="text-rise shrink-0" />
          <span className="ml-2 text-base font-semibold tracking-tight text-text-primary">
            异动监控
          </span>
        </div>

        {/* 市场状态 */}
        <div className="px-4 py-3 border-b border-border-color">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Radio size={14} className={statusColor} />
              <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
            </div>
            <div className="flex items-center gap-1 text-text-muted text-xs font-mono tabular-nums">
              <Clock size={12} />
              {currentTime}
            </div>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((item: NavItem) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `relative flex items-center px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-bg-tertiary text-text-primary'
                    : 'text-text-secondary hover:bg-bg-tertiary/60 hover:text-text-primary'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-rise rounded-r" />
                  )}
                  <span className="shrink-0">{item.icon}</span>
                  <span className="ml-3 truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 底部免责声明（桌面端侧边栏） */}
        <div className="px-4 py-3 border-t border-border-color">
          <p className="text-[10px] text-text-muted leading-relaxed">
            仅供参考，不构成投资建议
          </p>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏（移动端显示标题） */}
        <header className="h-14 bg-bg-secondary border-b border-border-color flex items-center px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-2 md:hidden">
            <Activity size={20} className="text-rise" />
            <span className="text-base font-semibold text-text-primary">异动监控</span>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span className="text-base font-semibold text-text-primary tracking-tight">
              盘中异动监控系统
            </span>
            <span className="text-xs text-text-muted">A股实时监控 · AI 投研</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden md:flex items-center gap-1.5">
              <Radio size={14} className={statusColor} />
              <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
            </div>
            <div className="flex items-center gap-1 text-text-muted text-xs font-mono tabular-nums">
              <Clock size={12} />
              {currentTime}
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>

        {/* 底部免责声明（桌面端主内容区底部） */}
        <div className="hidden md:block border-t border-border-color bg-bg-secondary">
          <p className="text-center py-2 text-[11px] text-text-muted">
            ⚠ 本系统仅供参考，不构成任何投资建议。股市有风险，入市需谨慎。
          </p>
        </div>
      </div>

      {/* 移动端底部 Tab 导航 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-secondary border-t border-border-color z-50">
        <div className="grid grid-cols-4 h-14">
          {navItems.slice(0, 4).map((item: NavItem) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                  isActive ? 'text-rise' : 'text-text-muted'
                }`
              }
            >
              {item.icon && <span style={{ transform: 'scale(0.9)' }}>{item.icon}</span>}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="grid grid-cols-3 h-14 border-t border-border-color">
          {navItems.slice(4, 7).map((item: NavItem) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                  isActive ? 'text-rise' : 'text-text-muted'
                }`
              }
            >
              {item.icon && <span style={{ transform: 'scale(0.9)' }}>{item.icon}</span>}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
