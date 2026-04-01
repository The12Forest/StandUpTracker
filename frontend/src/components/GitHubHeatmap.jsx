import { useMemo } from 'react';

// GitHub's exact color tokens
const COLORS_DARK = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
const COLORS_LIGHT = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];

// Row labels depend on which day starts the week
const DAY_LABELS_MONDAY = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const DAY_LABELS_SUNDAY = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getLevel(seconds) {
  if (seconds === 0) return 0;
  const mins = seconds / 60;
  if (mins < 10) return 1;
  if (mins < 30) return 2;
  if (mins < 60) return 3;
  return 4;
}

const OFF_DAY_COLOR_DARK = '#2d1f3d';
const OFF_DAY_COLOR_LIGHT = '#e8d5f5';

export default function GitHubHeatmap({ data = {}, offDays = {}, darkMode = true, firstDayOfWeek = 'monday' }) {
  const colors = darkMode ? COLORS_DARK : COLORS_LIGHT;
  const offDayColor = darkMode ? OFF_DAY_COLOR_DARK : OFF_DAY_COLOR_LIGHT;
  const dayLabels = firstDayOfWeek === 'sunday' ? DAY_LABELS_SUNDAY : DAY_LABELS_MONDAY;

  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    const todayDay = today.getDay(); // 0=Sun
    // Map JS getDay to row index based on configured first day of week
    const jsToRow = firstDayOfWeek === 'sunday'
      ? [0, 1, 2, 3, 4, 5, 6] // Sun=row0, Mon=row1, ..., Sat=row6
      : [6, 0, 1, 2, 3, 4, 5]; // Mon=row0, Tue=row1, ..., Sun=row6

    // Calculate the start: go back enough to fill ~53 weeks ending today
    const totalDays = 53 * 7 - (6 - jsToRow[todayDay]); // fill up to today
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - totalDays + 1);

    // Adjust start to the configured first day
    const startDay = startDate.getDay();
    const firstDayJs = firstDayOfWeek === 'sunday' ? 0 : 1; // JS day number of configured first day
    let startOffset = firstDayJs - startDay;
    if (startOffset > 0) startOffset -= 7; // go backwards to previous first-day
    startDate.setDate(startDate.getDate() + startOffset);

    const weeksArr = [];
    const months = [];
    let currentWeek = [];
    let lastMonth = -1;

    const cursor = new Date(startDate);
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const row = jsToRow[cursor.getDay()];
      const val = typeof data[dateStr] === 'object' ? (data[dateStr]?.seconds || 0) : (data[dateStr] || 0);

      if (row === 0 && currentWeek.length > 0) {
        weeksArr.push(currentWeek);
        currentWeek = [];
      }

      // Track month labels
      const month = cursor.getMonth();
      if (month !== lastMonth && row === 0) {
        months.push({ weekIndex: weeksArr.length, label: MONTH_NAMES[month] });
        lastMonth = month;
      }

      const isOff = !!offDays[dateStr];
      currentWeek[row] = { date: dateStr, seconds: val, level: isOff ? -1 : getLevel(val) };
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) weeksArr.push(currentWeek);

    return { weeks: weeksArr, monthLabels: months };
  }, [data, offDays, firstDayOfWeek]);

  const cellSize = 11;
  const gap = 3;
  const labelWidth = 30;
  const headerHeight = 16;
  const totalWidth = labelWidth + weeks.length * (cellSize + gap);
  const totalHeight = headerHeight + 7 * (cellSize + gap);

  return (
    <div className="relative" style={{ width: totalWidth }}>
      <div>
        <svg width={totalWidth} height={totalHeight}>
          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={labelWidth + m.weekIndex * (cellSize + gap)}
              y={10}
              className={darkMode ? 'fill-[#848d97]' : 'fill-[#57606a]'}
              fontSize={10}
              fontFamily="system-ui, -apple-system, sans-serif"
            >
              {m.label}
            </text>
          ))}

          {/* Day labels */}
          {dayLabels.map((label, row) =>
            label ? (
              <text
                key={row}
                x={0}
                y={headerHeight + row * (cellSize + gap) + cellSize - 1}
                className={darkMode ? 'fill-[#848d97]' : 'fill-[#57606a]'}
                fontSize={9}
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {label}
              </text>
            ) : null
          )}

          {/* Cells */}
          {weeks.map((week, wi) =>
            week.map((day, row) =>
              day ? (
                <rect
                  key={`${wi}-${row}`}
                  x={labelWidth + wi * (cellSize + gap)}
                  y={headerHeight + row * (cellSize + gap)}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  ry={2}
                  fill={day.level === -1 ? offDayColor : colors[day.level]}
                />
              ) : null
            )
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-2 text-[10px]" style={{ color: darkMode ? '#848d97' : '#57606a' }}>
        <span>Less</span>
        {colors.map((c, i) => (
          <div key={i} style={{ width: cellSize, height: cellSize, borderRadius: 2, backgroundColor: c }} />
        ))}
        <span>More</span>
      </div>

    </div>
  );
}
