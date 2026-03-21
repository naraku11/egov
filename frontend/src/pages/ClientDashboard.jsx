/**
 * @file ClientDashboard.jsx
 * @description Resident (client) home screen shown after a successful login.
 *
 * On mount, two API calls are made in parallel:
 *  - GET /tickets?limit=5  — fetches the five most recent tickets for the
 *    logged-in resident so they appear in the "My Tickets" panel.
 *  - GET /notifications    — fetches all notifications for the resident;
 *    unread items get a red badge count.
 *
 * Derived summary statistics (total, pending, in-progress, resolved) are
 * computed from the ticket array in-memory — no separate stats endpoint is used.
 *
 * The layout is split into two columns on large screens:
 *  - Left (2/3): stat cards + recent ticket list.
 *  - Right (1/3): quick-action links + notifications panel.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, AlertTriangle, Bell, ArrowRight, Star } from 'lucide-react';
import { format } from 'date-fns';
import api from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import Navbar from '../components/Navbar.jsx';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge.jsx';

/**
 * ClientDashboard component.
 *
 * Renders a personalised overview for a logged-in resident, including their
 * ticket history summary, recent submissions, quick-action shortcuts, and
 * an in-app notification feed.
 *
 * @returns {JSX.Element} The resident dashboard page, or a full-page spinner
 *   while the initial data load is in progress.
 */
export default function ClientDashboard() {
  // Pull the current resident's profile from auth context (used for greeting)
  const { user } = useAuth();
  const { t } = useLanguage();

  // ── State ───────────────────────────────────────────────────────────────────
  /** The five most recently submitted tickets belonging to this resident */
  const [tickets, setTickets] = useState([]);

  /** All notifications for this resident (read + unread) */
  const [notifications, setNotifications] = useState([]);

  /** True while the initial parallel API calls are in flight */
  const [loading, setLoading] = useState(true);

  // ── Data Loading ────────────────────────────────────────────────────────────
  /**
   * Fetch tickets and notifications simultaneously on first render.
   * The empty dependency array ensures this only runs once after mount.
   */
  useEffect(() => {
    const loadData = async () => {
      try {
        // Both requests are made at the same time to minimise perceived load time
        const [ticketRes, notifRes] = await Promise.all([
          api.get('/tickets?limit=5'),
          api.get('/notifications'),
        ]);
        setTickets(ticketRes.data.tickets || []);
        setNotifications(notifRes.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // ── Derived Statistics ──────────────────────────────────────────────────────
  /**
   * Summary counts computed directly from the tickets array.
   * ASSIGNED and IN_PROGRESS are grouped together under "In Progress" for the
   * resident-facing display to keep the UI simple.
   */
  const stats = {
    total: tickets.length,
    pending: tickets.filter(t => t.status === 'PENDING').length,
    inProgress: tickets.filter(t => ['ASSIGNED', 'IN_PROGRESS'].includes(t.status)).length,
    resolved: tickets.filter(t => t.status === 'RESOLVED').length,
  };

  /** Number of notifications the resident has not yet read — drives the red badge */
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        {/* Full-page centred spinner shown while API calls are in flight */}
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Page Header ────────────────────────────────────────────────────
            Personalised greeting using the resident's first name, their
            barangay, and today's date.
        ──────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Maayong Adlaw, {user?.name?.split(' ')[0]}! 👋
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Barangay {user?.barangay} · {format(new Date(), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* ── Summary Stat Cards ─────────────────────────────────────────────
            Four clickable cards, each linking to the tickets list filtered by
            the corresponding status. Values are derived from the tickets array.
        ──────────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Concerns', value: stats.total, icon: FileText, color: 'text-blue-600 bg-blue-50', link: '/tickets' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-yellow-600 bg-yellow-50', link: '/tickets?status=PENDING' },
            { label: 'In Progress', value: stats.inProgress, icon: AlertTriangle, color: 'text-indigo-600 bg-indigo-50', link: '/tickets?status=IN_PROGRESS' },
            { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-green-600 bg-green-50', link: '/tickets?status=RESOLVED' },
          ].map(({ label, value, icon: Icon, color, link }) => (
            <Link key={label} to={link} className="card hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{label}</p>
            </Link>
          ))}
        </div>

        {/* ── Two-Column Content Area ─────────────────────────────────────────
            Left (2/3 wide): recent tickets panel.
            Right (1/3 wide): quick actions + notifications.
        ──────────────────────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Recent Tickets panel — shows up to 5 latest submissions */}
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">{t('myTickets')}</h2>
              <Link to="/tickets" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Empty state */}
            {tickets.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">{t('noTickets')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map(ticket => (
                  /* Each row is a link to the full ticket detail page */
                  <Link
                    key={ticket.id}
                    to={`/tickets/${ticket.id}`}
                    className="block p-4 border border-gray-100 rounded-xl hover:border-primary-200 hover:bg-primary-50/30 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {/* Department colour dot for quick visual identification */}
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: ticket.department?.color || '#3B82F6' }}
                          />
                          <span className="text-xs text-gray-500 font-medium">{ticket.ticketNumber}</span>
                        </div>
                        <p className="font-medium text-gray-900 text-sm truncate group-hover:text-primary-700 transition-colors">
                          {ticket.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {ticket.department?.name} · {format(new Date(ticket.createdAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                      {/* Status and priority badges stacked on the right */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <StatusBadge status={ticket.status} />
                        <PriorityBadge priority={ticket.priority} />
                      </div>
                    </div>
                    {/* Assigned servant name — only rendered when a servant has been assigned */}
                    {ticket.servant && (
                      <p className="text-xs text-gray-400 mt-2">
                        Assigned to: {ticket.servant.name}
                      </p>
                    )}
                    {/* Star rating row — only rendered when the resident has submitted feedback */}
                    {ticket.feedback?.rating && (
                      <div className="flex items-center gap-1 mt-2">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} className={`w-3 h-3 ${s <= ticket.feedback.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ── Right Sidebar ────────────────────────────────────────────────
              Stacked panels: Quick Actions on top, Notifications below.
          ──────────────────────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Quick Actions — shortcut links to the most common resident tasks */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-2">
                {[
                  { label: t('trackTicket'), to: '/tickets', icon: '🔍', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                  { label: 'Barangay Directory', to: '/directory', icon: '📋', color: 'bg-green-50 text-green-700 hover:bg-green-100' },
                  { label: 'Announcements', to: '/announcements', icon: '📢', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                ].map(action => (
                  <Link
                    key={action.label}
                    to={action.to}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors font-medium text-sm ${action.color}`}
                  >
                    <span className="text-lg">{action.icon}</span>
                    {action.label}
                    <ArrowRight className="w-4 h-4 ml-auto" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Notifications panel — shows up to 5 most recent notifications;
                unread items have a blue background; the red badge count is
                shown next to the "Notifications" heading */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Notifications
                  {/* Red badge — only rendered when there are unread notifications */}
                  {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                  )}
                </h2>
              </div>

              {notifications.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No notifications yet</p>
              ) : (
                /* Scrollable list capped at a fixed height; slice(0,5) limits to 5 items */
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {notifications.slice(0, 5).map(notif => (
                    <div key={notif.id} className={`p-3 rounded-xl text-sm ${notif.isRead ? 'bg-gray-50' : 'bg-blue-50 border border-blue-100'}`}>
                      <p className="font-medium text-gray-900 text-xs">{notif.title}</p>
                      <p className="text-gray-600 text-xs mt-0.5">{notif.message}</p>
                      <p className="text-gray-400 text-xs mt-1">{format(new Date(notif.createdAt), 'MMM d, h:mm a')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
