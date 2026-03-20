import { useState, useEffect } from 'react';
import {
  FileText, CheckCircle, AlertTriangle, Star, Users,
  Clock, Download, RefreshCw, BarChart2, TrendingUp, Building2,
  Activity, ShieldCheck,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import Navbar from '../components/Navbar.jsx';

const STATUS_COLORS = {
  PENDING:     '#F59E0B',
  ASSIGNED:    '#3B82F6',
  IN_PROGRESS: '#8B5CF6',
  RESOLVED:    '#10B981',
  CLOSED:      '#6B7280',
  ESCALATED:   '#EF4444',
};

const PRIORITY_COLORS = {
  LOW:    '#10B981',
  NORMAL: '#3B82F6',
  URGENT: '#EF4444',
};

const RANGE_OPTIONS = [
  { label: '7 Days',  value: 7  },
  { label: '30 Days', value: 30 },
  { label: '90 Days', value: 90 },
];

function StatCard({ label, value, sub, icon: Icon, colorClass }) {
  return (
    <div className="card">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xl font-bold text-gray-900">{value ?? '—'}</p>
      {sub && <p className="text-xs font-medium text-gray-400 mt-0.5">{sub}</p>}
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function ReportsPage() {
  const [report, setReport]     = useState(null);
  const [servants, setServants] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange]       = useState(30);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchData = async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const [rr, sr] = await Promise.all([
        api.get(`/admin/reports?range=${range}`),
        api.get('/servants'),
      ]);
      setReport(rr.data);
      setServants(sr.data || []);
      setLastRefreshed(new Date());
    } catch {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // initial load on mount
  useEffect(() => { fetchData(true); }, []);
  // re-fetch when range changes (after initial data is loaded)
  useEffect(() => { if (report) fetchData(false); }, [range]);

  const handleExportCSV = () => {
    if (!report) return;
    const rows = [
      ['Report Generated', format(new Date(), 'yyyy-MM-dd HH:mm')],
      ['Date Range', `Last ${range} days`],
      [],
      ['KPI Summary'],
      ['Metric', 'Value'],
      ['Total Tickets',       report.total],
      ['Resolved',            report.resolved],
      ['Resolution Rate',     `${report.resolutionRate}%`],
      ['Pending',             report.pending],
      ['In Progress',         report.inProgress],
      ['Escalated',           report.escalated],
      ['SLA Compliance',      report.slaCompliance != null ? `${report.slaCompliance}%` : 'N/A'],
      ['Avg Resolution Time', report.avgResolutionHours != null ? `${report.avgResolutionHours.toFixed(1)}h` : 'N/A'],
      [],
      ['Tickets by Status'],
      ['Status', 'Count'],
      ...(report.byStatus || []).map(s => [s.status, s.count]),
      [],
      ['Tickets by Priority'],
      ['Priority', 'Count'],
      ...(report.byPriority || []).map(p => [p.priority, p.count]),
      [],
      ['Tickets by Department'],
      ['Department', 'Count'],
      ...(report.byDepartment || []).map(d => [d.department?.name || 'Unknown', d.count]),
      [],
      ['Servant Performance'],
      ['Name', 'Department', 'Status', 'Assigned', 'Resolved', 'Res. Rate', 'Avg Rating', 'Total Ratings'],
      ...mergedServants.map(s => [
        s.name, s.department, s.status,
        s.assigned, s.resolved, `${s.resolutionRate}%`,
        s.avgRating != null ? s.avgRating.toFixed(2) : 'N/A',
        s.totalRatings,
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `egov-report-${range}d-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported as CSV');
  };

  if (loading || !report) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  // ── Derived chart data ──────────────────────────────────────────────────────

  const statusData = (report.byStatus || []).map(s => ({
    name:  s.status.replace('_', ' '),
    value: s.count,
    color: STATUS_COLORS[s.status] || '#6B7280',
  }));

  const priorityData = (report.byPriority || [])
    .sort((a, b) => ['URGENT','NORMAL','LOW'].indexOf(a.priority) - ['URGENT','NORMAL','LOW'].indexOf(b.priority))
    .map(p => ({
      name:  p.priority.charAt(0) + p.priority.slice(1).toLowerCase(),
      value: p.count,
      fill:  PRIORITY_COLORS[p.priority] || '#6B7280',
    }));

  const deptData = (report.byDepartment || [])
    .sort((a, b) => b.count - a.count)
    .map(d => ({
      name:    d.department?.name || 'Unknown',
      tickets: d.count,
      fill:    d.department?.color || '#3B82F6',
    }));

  const tickInterval = range <= 7 ? 0 : range <= 30 ? 4 : 13;
  const trendData = (report.trend || []).map(t => ({
    ...t,
    label: format(new Date(t.date + 'T00:00:00'), range === 7 ? 'EEE' : 'MMM d'),
  }));

  // Merge servantPerformance with live servant status from /servants
  const servantStatusMap = Object.fromEntries(servants.map(s => [s.id, s.status]));
  const mergedServants = (report.servantPerformance || []).map(s => ({
    ...s,
    status:         servantStatusMap[s.id] || 'OFFLINE',
    resolutionRate: s.assigned ? Math.round((s.resolved / s.assigned) * 100) : 0,
  }));

  const avgResDisplay = (() => {
    const h = report.avgResolutionHours;
    if (h == null) return 'N/A';
    if (h < 1)     return `${Math.round(h * 60)}m`;
    return `${h.toFixed(1)}h`;
  })();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <BarChart2 className="w-6 h-6 text-primary-600" />
              <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
              {refreshing && (
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <p className="text-gray-500 text-sm">
              System-wide analytics &amp; performance ·{' '}
              <span className="text-gray-400">
                Updated {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5">
              {RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRange(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    range === opt.value
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => fetchData(false)}
              disabled={refreshing}
              className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button onClick={handleExportCSV} className="btn-primary flex items-center gap-2 text-sm">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* KPI Cards — 6 metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <StatCard
            label="Total Tickets"
            value={report.total}
            icon={FileText}
            colorClass="text-blue-600 bg-blue-50"
          />
          <StatCard
            label="Resolved"
            value={report.resolved}
            sub={`${report.resolutionRate}% resolution rate`}
            icon={CheckCircle}
            colorClass="text-green-600 bg-green-50"
          />
          <StatCard
            label="Pending"
            value={report.pending}
            icon={Clock}
            colorClass="text-yellow-600 bg-yellow-50"
          />
          <StatCard
            label="Escalated"
            value={report.escalated}
            icon={AlertTriangle}
            colorClass="text-red-600 bg-red-50"
          />
          <StatCard
            label="SLA Compliance"
            value={report.slaCompliance != null ? `${report.slaCompliance}%` : 'N/A'}
            sub={report.slaCompliance != null ? 'resolved within SLA' : 'no resolved tickets'}
            icon={ShieldCheck}
            colorClass="text-purple-600 bg-purple-50"
          />
          <StatCard
            label="Avg. Resolution"
            value={avgResDisplay}
            sub={report.avgResolutionHours != null ? 'per resolved ticket' : 'no resolved tickets'}
            icon={Activity}
            colorClass="text-indigo-600 bg-indigo-50"
          />
        </div>

        {/* Ticket Trend — full width dual-line chart */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary-600" />
              Ticket Trend — Last {range} Days
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-5 h-0.5 bg-blue-500 inline-block rounded" />
                Created
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-5 h-0.5 bg-green-500 inline-block rounded" />
                Resolved
              </div>
            </div>
          </div>
          {trendData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No trend data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={tickInterval}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.date
                      ? format(new Date(payload[0].payload.date + 'T00:00:00'), 'EEEE, MMM d, yyyy')
                      : ''
                  }
                />
                <Line
                  type="monotone"
                  dataKey="created"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={range <= 7 ? { r: 4 } : false}
                  name="Created"
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={range <= 7 ? { r: 4 } : false}
                  name="Resolved"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status Distribution + Priority Breakdown */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">

          {/* Status donut */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4 text-sm">Status Distribution</h3>
            {statusData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">No data</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%" cy="50%"
                        innerRadius={42} outerRadius={68}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {statusData.map((item, i) => <Cell key={i} fill={item.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2.5">
                  {statusData.map(item => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-gray-500 flex-1 capitalize">
                        {item.name.toLowerCase().replace('_', ' ')}
                      </span>
                      <span className="font-semibold text-gray-800">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Priority bar chart */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4 text-sm">Priority Breakdown</h3>
            {priorityData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">No data</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={priorityData} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [v, 'Tickets']} />
                    <Bar dataKey="value" radius={[5, 5, 0, 0]} name="Tickets">
                      {priorityData.map((item, i) => <Cell key={i} fill={item.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-3 justify-center">
                  {[['Urgent','#EF4444'], ['Normal','#3B82F6'], ['Low','#10B981']].map(([k, c]) => (
                    <div key={k} className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                      {k}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tickets by Department — horizontal bars with dept colors */}
        <div className="card mb-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary-600" />
            Tickets by Department
          </h3>
          {deptData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No department data</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, deptData.length * 44)}>
              <BarChart data={deptData} layout="vertical" margin={{ left: 0, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                <Tooltip formatter={(v) => [v, 'Tickets']} />
                <Bar dataKey="tickets" radius={[0, 5, 5, 0]} name="Tickets">
                  {deptData.map((item, i) => <Cell key={i} fill={item.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Servant Performance Table */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-600" />
            Servant Performance
            <span className="text-xs font-normal text-gray-400 ml-1">
              — tickets assigned within the selected range
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Name', 'Department', 'Status', 'Assigned', 'Resolved', 'Res. Rate', 'Avg. Rating'].map(h => (
                    <th
                      key={h}
                      className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mergedServants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-400 py-10 text-sm">
                      No servant data for this period
                    </td>
                  </tr>
                ) : (
                  mergedServants.map(s => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 font-medium text-gray-900 whitespace-nowrap">{s.name}</td>
                      <td className="py-3 px-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full text-white font-medium whitespace-nowrap"
                          style={{ backgroundColor: s.departmentColor || '#3B82F6' }}
                        >
                          {s.department || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          s.status === 'AVAILABLE' ? 'bg-green-100  text-green-700'  :
                          s.status === 'BUSY'      ? 'bg-yellow-100 text-yellow-700' :
                                                     'bg-gray-100   text-gray-500'
                        }`}>
                          {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-medium text-gray-700">{s.assigned}</td>
                      <td className="py-3 px-3 text-center font-semibold text-green-700">{s.resolved}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2 min-w-[90px]">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                s.resolutionRate >= 80 ? 'bg-green-500'  :
                                s.resolutionRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${s.resolutionRate}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 w-7 text-right">{s.resolutionRate}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {s.avgRating != null ? (
                          <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            <span className="text-xs font-semibold text-gray-800">{s.avgRating.toFixed(1)}</span>
                            <span className="text-xs text-gray-400">({s.totalRatings})</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
