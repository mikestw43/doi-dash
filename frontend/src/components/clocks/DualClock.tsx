import { useClock } from '../../hooks/useClock';
import { Clock } from 'lucide-react';

const SESSION_COLORS: Record<string, string> = {
  'Sydney': 'text-blue-400',
  'Tokyo': 'text-purple-400',
  'London': 'text-yellow-400',
  'New York': 'text-green-400',
  'Market Closed': 'text-gray-500',
};

const getSessionColor = (session: string): string => {
  for (const [key, cls] of Object.entries(SESSION_COLORS)) {
    if (session.includes(key)) return cls;
  }
  return 'text-gray-400';
};

export const DualClock = () => {
  const { thai, ny, session } = useClock();

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5">
      <div className="flex flex-col items-center">
        <span className="font-pixel text-[7px] text-gray-600 tracking-widest uppercase mb-0.5">Bangkok</span>
        <span className="font-display text-xl leading-none text-accent-blue whitespace-nowrap">{thai}</span>
      </div>

      <div className="hidden sm:block h-6 w-px bg-border2" />

      <div className="flex flex-col items-center">
        <span className="font-pixel text-[7px] text-gray-600 tracking-widest uppercase mb-0.5">New York</span>
        <span className="font-display text-xl leading-none text-accent-purple whitespace-nowrap">{ny}</span>
      </div>

      <div className="hidden sm:block h-6 w-px bg-border2" />

      <div className="flex items-center">
        <span className={`font-pixel text-[8px] tracking-wider ${getSessionColor(session)}`}>
          ◆ {session}
        </span>
      </div>
    </div>
  );
};
