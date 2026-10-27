export type ReportSeries = {
  version: string; label: string; date: string; color: string;
  x: number[]; y: (number | null)[]; dates: string[]; daily: number[];
};
export type ReleaseReport = {
  slug: string; postDays: number; through: string;
  releases: { version: string; label: string; date: string; color: string }[];
  metrics: { id: string; label: string; description: string; unit: string }[];
  series: Record<string, Record<string, Record<string, ReportSeries[]>>>;
  windows: Record<string, Record<string, Record<string, { post: number; runup: number }>>>;
  milestones: { release: string; label: string; date: string; offset: number }[];
  calendar: { dates: string[]; daily: number[]; mean7: (number | null)[]; events: { date: string; label: string }[] };
  plannedRelease?: { version: string; date: string; offset: number; source: string };
};

export function releaseFigure(report: ReleaseReport, metric: string, baseline: string, view: string, narrow = false) {
  const series = report.series[metric]?.[baseline]?.[view];
  if (!series) throw new Error('Unknown report selection');
  const cumulative = view === 'cumulative';
  const values = series.flatMap(s => s.y.filter((value): value is number => value !== null));
  const top = Math.ceil(Math.max(1.5, ...values) * 1.45 * 2) / 2;
  const markerLevels = [-Infinity, -Infinity, -Infinity];
  const planned = metric === 'issues_opened' ? report.plannedRelease : undefined;
  const milestones = [...report.milestones, ...(planned ? [{ release: '2.0.0', label: `${planned.version} (planned)`, date: planned.date, offset: planned.offset }] : [])];
  const markerLabels = milestones
    .filter(m => m.offset >= (cumulative ? 0 : -56) && m.offset <= (cumulative ? 28 : 42))
    .sort((a, b) => a.offset-b.offset).map(m => {
      const available = markerLevels.findIndex(last => m.offset-last >= (narrow ? 20 : 14));
      const level = available < 0 ? 2 : available;
      markerLevels[level] = m.offset;
      return { x: m.offset, y: .98-level*.15, xref: 'x', yref: 'paper',
        text: `${m.label.replace(' / freeze', '/freeze')}<br>${m.date}`,
        showarrow: false, yanchor: 'top', xanchor: 'center', bgcolor: '#fffdf7',
        bordercolor: '#4b4b4b', borderwidth: 1, borderpad: 4,
        font: { color: report.releases.find(r => r.version === m.release)!.color, size: narrow ? 8 : 9 },
      };
    });
  const data: Record<string, unknown>[] = [];
  for (const s of series) {
    const rawLabel = metric === 'issues_per_filer' ? 'Issues opened on this date' : 'Raw daily count';
    data.push({
      type: 'scatter', mode: 'lines', name: s.label, x: s.x, y: s.y,
      line: { color: s.color, width: s.version === '2.0.0' ? 3.5 : 2, dash: 'solid' },
      connectgaps: false,
      customdata: s.dates.map((date, i) => [date, s.daily[i]]),
      hovertemplate: `Day %{x} · %{customdata[0]}<br><b>%{y:.2f}× normal</b><br>${rawLabel}: %{customdata[1]:,.0f}<extra>${s.label}</extra>`,
    });
    const last = s.x.length - 1;
    data.push({ type: 'scatter', mode: 'markers', x: [s.x[last]], y: [s.y[last]],
      marker: { color: s.color, size: s.version === '2.0.0' ? 8 : 5, line: { color: '#fffdf7', width: 1.5 } },
      hoverinfo: 'skip', showlegend: false });
    const milestones = report.milestones.filter(m => m.release === s.version && m.offset >= (cumulative ? 0 : -56) && m.offset <= (cumulative ? 28 : 42));
    data.push({ type: 'scatter', mode: 'markers', x: milestones.map(m => m.offset), y: milestones.map(() => top * .025),
      customdata: milestones.map(m => [m.label, m.date]), marker: { color: s.color, size: 6, symbol: 'diamond-open' },
      hovertemplate: `%{customdata[0]} · %{customdata[1]}<br>Day %{x} on the ${s.label} clock<extra>Release milestone</extra>`, showlegend: false });
  }
  return {
    data,
    layout: {
      autosize: true, paper_bgcolor: '#fffdf7', plot_bgcolor: '#fffdf7', showlegend: true,
      legend: { orientation: 'h', x: 0, y: 1.3, font: { size: narrow ? 11 : 13 }, traceorder: 'normal',
        bgcolor: '#fffdf7', bordercolor: '#4b4b4b', borderwidth: 1 },
      font: { family: 'Noto Sans, sans-serif', color: '#4f5355', size: narrow ? 10 : 12 },
      margin: { l: narrow ? 40 : 48, r: 12, t: narrow ? 96 : 85, b: 55 },
      hovermode: 'closest', dragmode: false,
      hoverlabel: { bgcolor: '#fffdf7', bordercolor: '#b9bbb5', font: { color: '#211a12' } },
      xaxis: {
        range: cumulative ? [-.5, 29] : [-57, 44], fixedrange: true,
        title: { text: 'Days from each release', standoff: 18 }, zeroline: false, showgrid: false,
        tickvals: cumulative ? [0, 7, 14, 21, 28] : [-56, -42, -28, -14, 0, 14, 28, 42],
        ticktext: cumulative ? ['0', '7', '14', '21', '28'] : ['−56', '−42', '−28', '−14', '0', '+14', '+28', '+42'],
        linecolor: '#b9bbb5', ticks: '', automargin: true,
      },
      yaxis: { range: [0, top], fixedrange: true, ticksuffix: '×', gridcolor: '#deded8', zeroline: false, nticks: 7, automargin: true },
      shapes: [
        ...[...new Set(report.milestones.map(m => m.offset))]
          .filter(offset => offset >= (cumulative ? 0 : -56) && offset <= (cumulative ? 28 : 42))
          .map(offset => ({ type: 'line', xref: 'x', yref: 'paper', x0: offset, x1: offset, y0: 0, y1: 1,
            line: { color: '#4b4b4b', width: .8 }, opacity: .45, layer: 'below' })),
        { type: 'rect', xref: 'x', yref: 'paper', x0: 0, x1: report.postDays-.5, y0: 0, y1: 1, fillcolor: report.releases.find(r => r.version === '2.0.0')!.color, opacity: .06, line: { width: 0 }, layer: 'below' },
        { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: '#777b7c', width: 1 } },
        { type: 'line', xref: 'x', yref: 'paper', x0: 0, x1: 0, y0: 0, y1: 1, line: { color: '#211a12', width: 1 } },
        ...(planned ? [{ type: 'line', xref: 'x', yref: 'paper', x0: planned.offset, x1: planned.offset, y0: 0, y1: 1,
          line: { color: '#4b4b4b', width: 1.2, dash: 'dot' }, layer: 'below' }] : []),
      ],
      annotations: [
        { x: 0, y: 1.03, xref: 'x', yref: 'paper', text: 'Release day', showarrow: false, xanchor: 'center', yanchor: 'bottom',
          bgcolor: '#fffdf7', bordercolor: '#4b4b4b', borderwidth: 1, borderpad: 4, font: { color: '#211a12', size: 10 } },
        ...markerLabels,
      ],
    },
    config: { responsive: true, displaylogo: false, displayModeBar: false, scrollZoom: false },
  };
}

export function calendarFigure(report: ReleaseReport) {
  const c = report.calendar;
  const top = Math.max(...c.mean7.map(v => v ?? 0))*1.48;
  const levels = [-Infinity, -Infinity, -Infinity];
  const annotations = c.events.map(event => {
    const day = Date.parse(event.date)/86400000;
    const available = levels.findIndex(last => day-last >= 40);
    const level = available === -1 ? 2 : available;
    levels[level] = day;
    const major = report.releases.some(r => event.label === r.version);
    return {
      x: event.date, y: .97-level*.14, xref: 'x', yref: 'paper', showarrow: false,
      text: `${major ? '<b>' : ''}${event.label.replace(' / feature freeze', '<br>feature freeze')}${major ? '</b>' : ''}<br>${event.date}`,
      yanchor: 'top', xanchor: 'center',
      font: { size: major ? 11 : 9, color: major ? '#211a12' : '#4f5355' }, bgcolor: '#fffdf7',
      bordercolor: '#4b4b4b', borderwidth: major ? 1 : 0, borderpad: major ? 4 : 2,
    };
  });
  return {
    data: [{ type: 'scatter', mode: 'lines', x: c.dates, y: c.mean7,
      customdata: c.daily, line: { color: '#1f6fa0', width: 2.5 }, connectgaps: false,
      fill: 'tozeroy', fillcolor: 'rgba(31,111,160,.16)',
      hovertemplate: '%{x|%d %b %Y}<br><b>%{y:.1f} issues/day</b> · seven-day mean<br>%{customdata} issues on this date<extra></extra>',
    }] as Record<string, unknown>[],
    layout: {
      autosize: true, paper_bgcolor: '#fffdf7', plot_bgcolor: '#fffdf7', showlegend: false,
      font: { family: 'Noto Sans, sans-serif', color: '#4f5355', size: 11 },
      margin: { l: 58, r: 12, t: 8, b: 35 }, hovermode: 'closest', dragmode: false,
      xaxis: { range: [c.dates[0], new Date(Date.parse(report.through)+28*86400000).toISOString().slice(0,10)],
        type: 'date', dtick: 'M2', tickformat: '%b %Y', showgrid: false, zeroline: false, fixedrange: true },
      yaxis: { range: [0, top], fixedrange: true, zeroline: false, gridcolor: '#deded8',
        title: { text: 'Issues/day · seven-day mean', standoff: 12 } },
      annotations, shapes: c.events.map(event => {
        const major = report.releases.some(r => r.version === event.label);
        return { type: 'line', xref: 'x', yref: 'paper',
          x0: event.date, x1: event.date, y0: 0, y1: 1,
          line: { color: major ? '#4b4b4b' : '#777b7c', width: major ? 1.2 : .6 },
          opacity: major ? .85 : .25, layer: 'below' };
      }),
    },
    config: { responsive: true, displaylogo: false, displayModeBar: false, scrollZoom: false },
  };
}
