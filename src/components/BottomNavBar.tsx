import React from 'react';
import { Microscope, Rocket, ClipboardList, Download } from 'lucide-react';
import { ColorTheme } from '../lib/themes';

export type NavTabId = 'workbench' | 'launchpad' | 'worklist' | 'tools';

interface BottomNavBarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  activeTheme: ColorTheme;
  queueCount: number;
}

export default function BottomNavBar({
  activeTab,
  onSelectTab,
  activeTheme,
  queueCount,
}: BottomNavBarProps) {
  const isLight = activeTheme.isLight;

  const navItems: { id: NavTabId; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'workbench', label: 'Workbench', icon: Microscope },
    { id: 'launchpad', label: 'Launchpad', icon: Rocket },
    { id: 'worklist',  label: 'Worklist',  icon: ClipboardList, badge: queueCount > 0 ? queueCount : undefined },
    { id: 'tools',     label: 'Export',    icon: Download },
  ];

  return (
    <nav
      id="bottom-navigation-bar"
      aria-label="Main Navigation"
      className={`sticky bottom-0 w-full shrink-0 h-15 border-t z-40 px-2 transition-colors ${
        isLight
          ? 'bg-white/95 backdrop-blur-md border-slate-200/90'
          : 'bg-slate-900/95 backdrop-blur-md border-slate-800'
      }`}
    >
      <div className="grid grid-cols-4 h-full items-center max-w-lg mx-auto">
        {navItems.map(({ id, label, icon: Icon, badge }) => {
          const isActive = activeTab === id;

          return (
            <button
              key={id}
              id={`nav-tab-${id}`}
              type="button"
              onClick={() => onSelectTab(id)}
              className="flex flex-col items-center justify-center h-full py-1 relative cursor-pointer select-none transition-all duration-150 group active:scale-95"
            >
              {/* Active top indicator line */}
              {isActive && (
                <div className="absolute top-0 w-8 h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              )}

              <div
                className={`relative flex items-center justify-center px-3 py-1 rounded-xl transition-all ${
                  isActive
                    ? isLight
                      ? 'bg-indigo-50/80 text-indigo-600 font-semibold'
                      : 'bg-indigo-950/60 text-indigo-400 font-semibold border border-indigo-900/40'
                    : isLight
                    ? 'text-slate-400 group-hover:text-slate-600'
                    : 'text-slate-500 group-hover:text-slate-300'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />

                {/* Badge indicator */}
                {badge !== undefined && (
                  <span
                    className={`absolute -top-1 -right-1 text-[8.5px] font-bold font-mono px-1.5 py-0.2 rounded-full leading-tight border shadow-xs ${
                      isActive
                        ? 'bg-indigo-600 text-white border-white dark:border-slate-900'
                        : isLight
                        ? 'bg-slate-200 text-slate-700 border-white'
                        : 'bg-slate-800 text-slate-300 border-slate-900'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </div>

              <span
                className={`text-[9.5px] font-sans tracking-tight mt-0.5 transition-colors ${
                  isActive
                    ? isLight
                      ? 'text-indigo-600 font-bold'
                      : 'text-indigo-400 font-bold'
                    : isLight
                    ? 'text-slate-500 font-medium group-hover:text-slate-700'
                    : 'text-slate-400 font-medium group-hover:text-slate-200'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
