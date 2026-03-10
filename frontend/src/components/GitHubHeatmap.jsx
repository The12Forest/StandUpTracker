import { useMemo } from 'react';

// GitHub's exact color tokens
const COLORS_DARK = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
const COLORS_LIGHT = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getLevel(seconds) {
  if (seconds === 0) return 0;
  const mins = seconds / 60;
  if (mins < 10) return 1;
  if (mins < 30) return 2;
  if (mins < 60) return 3;
  return 4;
}

export default function GitHubHeatmap({ data = {}, darkMode = true }) {
  const colors = darkMode ? COLORS_DARK : COLORS_LIGHT;

  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    const todayDay = today.getDay(); // 0=Sun
    // GitHub: columns are weeks, rows are Mon-Sun (Mon=row0, Sun=row6)
    // We need to map JS getDay (0=Sun) to row index: Mon=0, Tue=1, ..., Sun=6
    const jsToRow = [6, 0, 1, 2, 3, 4, 5]; // JS day -> row index

    // Calculate the start: go back enough to fill ~53 weeks ending today
    const endDate = new Date(today);
    const totalDays = 53 * 7 - (6 - jsToRow[todayDay]); // fill up to today
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - totalDays + 1);

    // Adjust start to a Monday
    const startDay = startDate.getDay();
    const startOffset = startDay === 0 ? -6 : 1 - startDay; // offset to prev Monday
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

      currentWeek[row] = { date: dateStr, seconds: val, level: getLevel(val) };
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) weeksArr.push(currentWeek);

    return { weeks: weeksArr, monthLabels: months };
  }, [data]);

  const cellSize = 11;
  const gap = 3;
  const labelWidth = 30;
  const headerHeight = 16;
  const totalWidth = labelWidth + weeks.length * (cellSize + gap);
  const totalHeight = headerHeight + 7 * (cellSize + gap);

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-2">
        <svg width={totalWidth} height={totalHeight} style={{ minWidth: totalWidth }}>
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
          {DAY_LABELS.map((label, row) =>
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
                  fill={colors[day.level]}
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
