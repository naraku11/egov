/**
 * @file ServantDashboard.jsx
 * @description Work dashboard for public servants (government staff) of the
 * Aluguinsan E-Gov Portal.
 *
 * Layout: a two-panel split view — a scrollable ticket list on the left and a
 * full ticket detail / messaging panel on the right. On mobile screens only
 * one panel is visible at a time.
 *
 * Key behaviours:
 *
 *  Data loading
 *  - On mount and whenever the status filter changes, `loadData()` fetches the
 *    servant's assigned tickets and their personal stats simultaneously.
 *
 *  Heartbeat
 *  - A heartbeat PATCH is sent to `/servants/heartbeat` immediately on mount
 *    and every 60 seconds thereafter. When the servant navigates away (unmount)
 *    the status is set to OFFLINE so the admin presence view stays accurate.
 *
 *  Real-time updates (Socket.IO)
 *  - When a ticket is open, the dashboard joins the `ticket:<id>` room and
 *    listens for `message:new` (incoming resident messages) and
 *    `ticket:updated` (status changes from other parties).
 *  - A separate listener on `ticket:assigned` refreshes the list whenever a
 *    new ticket is assigned to this servant.
 *
 *  Actions available to the servant:
 *  - Update ticket status (IN_PROGRESS → RESOLVED → CLOSED)
 *  - Escalate a ticket to a supervisor with a mandatory reason
 *  - Send a reply to the resident or an internal-only note
 *  - Change their own availability status (AVAILABLE / BUSY / OFFLINE)
 */

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Clock, AlertTriangle, MessageSquare, ChevronDown, Send, ArrowUpCircle, X, Paperclip, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import SidebarLayout from '../components/SidebarLayout.jsx';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge.jsx';

/**
 * Status action options available in the ticket detail panel.
 * These are filtered at render time to exclude the ticket's current status.
 *
 * @type {Array<{ value: string, label: string, color: string }>}
 */
const STATUS_ACTIONS = [
  { value: 'IN_PROGRESS', label: 'Mark In Progress', color: 'bg-indigo-600 hover:bg-indigo-700' },
  { value: 'RESOLVED', label: 'Mark Resolved', color: 'bg-green-600 hover:bg-green-700' },
  { value: 'CLOSED', label: 'Close Ticket', color: 'bg-gray-600 hover:bg-gray-700' },
];

/**
 * ServantDashboard component.
 *
 * Manages all ticket listing, filtering, real-time socket subscriptions,
 * message sending, status updates, escalation, and presence heartbeating.
 *
 * @returns {JSX.Element} The servant dashboard split-view layout.
 */
export default function ServantDashboard() {
  // Servant profile from auth context; updateServant syncs changes back to localStorage
  const { servant, updateServant } = useAuth();
  const { t } = useLanguage();
  // Socket instance from context — used to join/leave ticket rooms and listen for events
  const socket = useSocket();

  // ── State ───────────────────────────────────────────────────────────────────

  /** Assigned tickets for the servant (filtered by `filter` when non-empty) */
  const [tickets, setTickets] = useState([]);

  /** Full ticket object currently open in the detail panel; null when none selected */
  const [selected, setSelected] = useState(null);

  /** Servant-level performance stats returned by GET /servants/stats */
  const [stats, setStats] = useState({});

  /** True while the initial data load is in progress */
  const [loading, setLoading] = useState(true);

  /** Status filter applied to the ticket list; empty string = show all */
  const [filter, setFilter] = useState('');

  /** Current value of the message / internal-note input */
  const [message, setMessage] = useState('');
  /** File attachments for the current message */
  const [msgFiles, setMsgFiles] = useState([]);
  const fileInputRef = useRef(null);

  /** When true the message will be saved as an internal note (hidden from resident) */
  const [isInternal, setIsInternal] = useState(false);

  /** Optional status-change note text, cleared after each status update */
  const [statusNote, setStatusNote] = useState('');

  /** Text entered when the escalation panel is open */
  const [escalateReason, setEscalateReason] = useState('');

  /** Controls visibility of the escalation reason input panel */
  const [showEscalate, setShowEscalate] = useState(false);

  /**
   * Local copy of the servant's availability status.
   * Kept in sync with the DB via loadData() to avoid stale localStorage values
   * overriding the actual server-side status.
   */
  const [servantStatus, setServantStatus] = useState(servant?.status || 'AVAILABLE');

  // ── Refs ────────────────────────────────────────────────────────────────────

  /** DOM ref used to auto-scroll to the latest message in the conversation */
  const messagesEndRef = useRef(null);

  /** setInterval ID for the 60-second heartbeat, cleared on unmount */
  const heartbeatRef   = useRef(null);

  // ── Effects ─────────────────────────────────────────────────────────────────

  /**
   * Reload tickets and stats whenever the status filter changes.
   * Also runs once on initial mount (empty filter = all tickets).
   */
  useEffect(() => { loadData(); }, [filter]);

  /**
   * Heartbeat effect.
   * Sends an immediate ping on mount, then repeats every 60 seconds.
   * On unmount (navigate away or tab close) the status is set to OFFLINE.
   */
  useEffect(() => {
    const sendHeartbeat = () => api.patch('/servants/heartbeat').catch(() => {});
    sendHeartbeat(); // immediate ping so presence is visible right away
    heartbeatRef.current = setInterval(sendHeartbeat, 60000);
    return () => {
      clearInterval(heartbeatRef.current);
      // Mark servant offline when they leave the dashboard (navigate away or close tab)
      api.patch('/servants/status', { status: 'OFFLINE' }).catch(() => {});
    };
  }, []);

  /**
   * Auto-scroll effect.
   * Scrolls the message list to the bottom whenever a new message is added
   * to the selected ticket.
   */
  useEffect(() => {
    if (selected?.messages?.length) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [selected?.messages?.length]);

  /**
   * Socket room effect.
   * Joins the `ticket:<id>` room when a ticket is opened and leaves it when
   * the selection changes or the component unmounts.
   *
   * Listens for:
   *   `message:new`    — New message from the resident; appended if not already present.
   *   `ticket:updated` — External status or field change; merged into both the
   *                       selected ticket and the list row.
   */
  useEffect(() => {
    if (!selected) return;
    const room = `ticket:${selected.id}`;
    socket.emit('join', { room });

    const onMessage = (msg) => {
      if (msg.senderType === 'SERVANT') return; // already shown via API response
      setSelected(prev => {
        if (!prev || prev.id !== msg.ticketId) return prev;
        // Deduplicate by id in case the event fires more than once
        const exists = prev.messages.some(m => m.id === msg.id);
        if (exists) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
    };

    const onUpdated = (update) => {
      // Merge update into the selected ticket and the matching list item
      setSelected(prev => prev?.id === update.id ? { ...prev, ...update } : prev);
      setTickets(prev => prev.map(t => t.id === update.id ? { ...t, ...update } : t));
    };

    socket.on('message:new', onMessage);
    socket.on('ticket:updated', onUpdated);

    return () => {
      socket.emit('leave', { room });
      socket.off('message:new', onMessage);
      socket.off('ticket:updated', onUpdated);
    };
  }, [selected?.id]);

  /**
   * New-assignment socket effect.
   * Listens for `ticket:assigned` at the servant level (not room-scoped) so
   * newly routed tickets appear in the list immediately without a page refresh.
   */
  useEffect(() => {
    const onAssigned = () => loadData();
    socket.on('ticket:assigned', onAssigned);
    return () => socket.off('ticket:assigned', onAssigned);
  }, []);

  // ── Data fetching helpers ───────────────────────────────────────────────────

  /**
   * Fetches assigned tickets (optionally filtered by status) and servant stats
   * in parallel. Also syncs the local servantStatus from the DB response so it
   * cannot drift from the actual value.
   */
  const loadData = async () => {
    try {
      const params = filter ? `?status=${filter}` : '';
      const [ticketsRes, statsRes] = await Promise.all([
        api.get(`/tickets/servant/assigned${params}`),
        api.get('/servants/stats'),
      ]);
      setTickets(ticketsRes.data.tickets || []);
      setStats(statsRes.data || {});
      // Always sync status from DB (overrides stale localStorage value)
      if (statsRes.data?.status) setServantStatus(statsRes.data.status);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetches a single ticket's full detail (including messages and attachments)
   * and sets it as the selected ticket to open the detail panel.
   *
   * @param {string} id - The ticket's database ID.
   */
  const loadTicket = async (id) => {
    try {
      const { data } = await api.get(`/tickets/${id}`);
      setSelected(data);
    } catch (err) {
      toast.error('Failed to load ticket');
    }
  };

  /**
   * Updates the selected ticket's status, optionally attaching a note.
   * Refreshes both the detail view and the list after a successful update.
   *
   * @param {string} status - The new status value (e.g. 'IN_PROGRESS', 'RESOLVED').
   */
  const updateStatus = async (status) => {
    try {
      await api.patch(`/tickets/${selected.id}/status`, { status, notes: statusNote || undefined });
      toast.success(`Ticket ${status.toLowerCase().replace('_', ' ')}`);
      setStatusNote('');
      await loadTicket(selected.id);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  /**
   * Sends a message or internal note on the selected ticket.
   * Clears the message input on success and reloads the ticket detail so the
   * new message appears immediately.
   */
  const sendMessage = async () => {
    if (!message.trim() && msgFiles.length === 0) return;
    try {
      const formData = new FormData();
      formData.append('message', message);
      formData.append('isInternal', isInternal);
      msgFiles.forEach(f => formData.append('attachments', f));
      await api.post(`/tickets/${selected.id}/message`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage('');
      setMsgFiles([]);
      await loadTicket(selected.id);
    } catch (err) {
      toast.error('Failed to send');
    }
  };

  /**
   * Escalates the selected ticket with a mandatory reason string.
   * Closes the escalation panel and refreshes the detail + list on success.
   */
  const escalate = async () => {
    if (!escalateReason.trim()) return toast.error('Reason is required');
    try {
      await api.patch(`/tickets/${selected.id}/escalate`, { reason: escalateReason });
      toast.success('Ticket escalated');
      setShowEscalate(false);
      setEscalateReason('');
      await loadTicket(selected.id);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  /**
   * Updates the servant's own availability status (AVAILABLE / BUSY / OFFLINE).
   * Also calls updateServant() to sync the change to AuthContext and localStorage
   * so the Navbar indicator updates without a page reload.
   *
   * @param {'AVAILABLE'|'BUSY'|'OFFLINE'} status - The new availability status.
   */
  const updateServantStatus = async (status) => {
    try {
      await api.patch('/servants/status', { status });
      setServantStatus(status);
      updateServant({ status }); // syncs auth context + localStorage → Navbar updates immediately
      const labels = { AVAILABLE: 'Available', BUSY: 'Busy', OFFLINE: 'Offline' };
      toast.success(`Status set to ${labels[status] || status}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  /**
   * Sort order mapping: URGENT tickets surface first, then NORMAL, then LOW.
   * Unknown priorities default to 1 (NORMAL).
   */
  const priorityOrder = { URGENT: 0, NORMAL: 1, LOW: 2 };
  const sortedTickets = [...tickets].sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

  /** Count of active (non-resolved, non-closed) URGENT tickets — drives the alert badge */
  const urgentCount = tickets.filter(t => t.priority === 'URGENT' && !['RESOLVED','CLOSED'].includes(t.status)).length;

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* ── Page Header ────────────────────────────────────────────────────
            Displays servant name + department on the left.
            On the right: urgent ticket alert badge + availability status
            toggle (AVAILABLE / BUSY / OFFLINE).
        ──────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Servant Dashboard</h1>
            <p className="text-gray-500 text-sm">{servant?.name} · {servant?.department?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Urgent badge — only rendered when there are active urgent tickets */}
            {urgentCount > 0 && (
              <div className="flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-1.5 rounded-full text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                {urgentCount} urgent
              </div>
            )}
            {/* Availability status toggle — three mutually exclusive buttons */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
              {[
                { value: 'AVAILABLE', label: 'Available', dot: 'bg-green-500',  active: 'bg-green-50  text-green-700  border-green-300' },
                { value: 'BUSY',      label: 'Busy',      dot: 'bg-yellow-500', active: 'bg-yellow-50 text-yellow-700 border-yellow-300' },
                { value: 'OFFLINE',   label: 'Offline',   dot: 'bg-gray-400',   active: 'bg-gray-100  text-gray-700   border-gray-300' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateServantStatus(opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    servantStatus === opt.value
                      ? `${opt.active} shadow-sm`
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Performance Stats ───────────────────────────────────────────────
            Five summary cards: total assigned, pending, in-progress, resolved,
            and average satisfaction rating. Values come from GET /servants/stats.
        ──────────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4 mb-6">
          {[
            { label: 'Total Assigned', value: stats.total || 0, color: 'text-blue-600 bg-blue-50' },
            { label: 'Pending', value: stats.pending || 0, color: 'text-yellow-600 bg-yellow-50' },
            { label: 'In Progress', value: stats.inProgress || 0, color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Resolved', value: stats.resolved || 0, color: 'text-green-600 bg-green-50' },
            // Rating is formatted to one decimal place; shows 'N/A' until feedback exists
            { label: 'Avg Rating', value: stats.avgRating ? `${stats.avgRating.toFixed(1)}⭐` : 'N/A', color: 'text-amber-600 bg-amber-50' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card text-center py-4">
              <p className={`text-xl font-bold ${color.split(' ')[0]}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Split-Panel Layout ──────────────────────────────────────────────
            Left panel: ticket list (hidden on mobile when a ticket is open).
            Right panel: ticket detail (hidden on mobile when no ticket is open).
        ──────────────────────────────────────────────────────────────────── */}
        <div className="flex gap-4 lg:gap-6 min-h-[500px] lg:h-[calc(100vh-18rem)]">

          {/* ── Ticket List panel ─────────────────────────────────────────────
              Shows when no ticket is selected (mobile) or always on desktop.
              Includes a status filter dropdown and sorts tickets by priority.
          ──────────────────────────────────────────────────────────────────── */}
          <div className={`${selected ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 xl:w-96 flex-shrink-0`}>
            <div className="card flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">{t('myAssignments')}</h2>
                <span className="text-sm text-gray-500">{tickets.length} tickets</span>
              </div>

              {/* Status filter — changing this updates the `filter` state which
                  triggers the loadData() effect */}
              <select className="input-field text-sm mb-4" value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="">{t('all')}</option>
                <option value="PENDING">Pending</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="ESCALATED">Escalated</option>
              </select>

              {/* Scrollable ticket button list, sorted by priority */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center h-20">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent" />
                  </div>
                ) : sortedTickets.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No tickets assigned</p>
                  </div>
                ) : sortedTickets.map(ticket => (
                  /* Clicking a ticket calls loadTicket() to fetch its full detail */
                  <button
                    key={ticket.id}
                    onClick={() => loadTicket(ticket.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selected?.id === ticket.id ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-gray-500">{ticket.ticketNumber}</span>
                      <div className="flex items-center gap-1">
                        {/* Red dot indicator for URGENT tickets */}
                        {ticket.priority === 'URGENT' && <span className="w-2 h-2 rounded-full bg-red-500" />}
                        <StatusBadge status={ticket.status} />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{ticket.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{ticket.user?.name} · {ticket.user?.barangay}</p>
                    <div className="flex items-center justify-between mt-2">
                      <PriorityBadge priority={ticket.priority} />
                      <span className="text-xs text-gray-400">{format(new Date(ticket.createdAt), 'MMM d')}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Ticket Detail panel ───────────────────────────────────────────
              Shown when a ticket is selected. Contains:
              - Ticket meta header (number, status, priority, resident info)
              - Concern description block
              - Attachments list (if any)
              - Conversation thread with message bubbles
              - Action area: status buttons, escalate panel, message input
                (hidden entirely once the ticket is RESOLVED or CLOSED)
          ──────────────────────────────────────────────────────────────────── */}
          {selected ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="card flex flex-col h-full overflow-hidden">

                {/* Ticket header — ticket number, status/priority badges, resident details */}
                <div className="flex items-start gap-3 mb-4 pb-4 border-b border-gray-100">
                  {/* Back arrow: mobile-only — returns to the ticket list */}
                  <button onClick={() => setSelected(null)} className="lg:hidden p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{selected.ticketNumber}</span>
                      <StatusBadge status={selected.status} />
                      <PriorityBadge priority={selected.priority} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
                    {/* Resident contact details */}
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                      <span>👤 {selected.user?.name}</span>
                      <span>📍 {selected.user?.barangay}</span>
                      {selected.user?.phone && <span>📱 {selected.user?.phone}</span>}
                      <span>📅 {format(new Date(selected.createdAt), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                  </div>
                </div>

                {/* Scrollable content area */}
                <div className="flex-1 overflow-y-auto space-y-4">

                  {/* Concern description block */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Concern Description</p>
                    <p className="text-sm text-gray-800 leading-relaxed">{selected.description}</p>
                  </div>

                  {/* Attachments — only rendered when at least one file is present */}
                  {selected.attachments?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attachments</p>
                      <div className="flex flex-wrap gap-2">
                        {selected.attachments.map(att => (
                          <a key={att.id} href={att.filePath} target="_blank" rel="noreferrer"
                            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors">
                            📎 {att.fileName}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Conversation thread */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Conversation
                    </p>

                    {selected.messages?.length === 0 ? (
                      <div className="flex flex-col items-center py-8 text-gray-400">
                        <MessageSquare className="w-10 h-10 mb-2 opacity-25" />
                        <p className="text-sm">No messages yet</p>
                        <p className="text-xs mt-1">Reply to the resident below</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selected.messages.map(msg => {
                          // System event pill — centred, italic, no avatar
                          if (msg.senderType === 'SYSTEM') {
                            return (
                              <div key={msg.id} className="flex justify-center my-1">
                                <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full italic">{msg.message}</span>
                              </div>
                            );
                          }
                          // Internal note — right-aligned, amber styling, visible only to servants
                          if (msg.isInternal) {
                            return (
                              <div key={msg.id} className="flex justify-end">
                                <div className="max-w-[72%] flex flex-col items-end">
                                  <div className="px-4 py-2.5 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl rounded-br-sm">
                                    <p className="text-xs font-semibold text-amber-600 mb-1">🔒 Internal Note</p>
                                    {msg.message && <p>{msg.message}</p>}
                                    {(() => { const atts = msg.attachments ? JSON.parse(msg.attachments) : []; if (!atts.length) return null; const apiBase = api.defaults.baseURL?.replace('/api', '') || ''; return (<div className={`${msg.message ? 'mt-2 pt-2 border-t border-amber-200' : ''} space-y-1.5`}>{atts.map((att, idx) => { const fileUrl = `${apiBase}${att.filePath}`; return att.mimeType?.startsWith('image/') ? (<a key={idx} href={fileUrl} target="_blank" rel="noopener noreferrer" className="block"><img src={fileUrl} alt={att.fileName} className="max-w-[200px] rounded-lg mt-1" /></a>) : (<a key={idx} href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-amber-700 hover:text-amber-900"><Download className="w-3.5 h-3.5" /><span className="underline truncate max-w-[150px]">{att.fileName}</span></a>); })}</div>); })()}
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1 px-1">{format(new Date(msg.createdAt), 'h:mm a · MMM d')}</p>
                                </div>
                                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5 ml-2 self-end select-none">
                                  {msg.senderName?.charAt(0).toUpperCase()}
                                </div>
                              </div>
                            );
                          }
                          // Regular message — right-aligned (indigo) for servant, left-aligned (white) for resident
                          const isMe = msg.senderType === 'SERVANT';
                          return (
                            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                              {/* Avatar — client side (left of bubble) */}
                              {!isMe && (
                                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5 select-none">
                                  {msg.senderName?.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className={`max-w-[72%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                {/* Sender name label — only on the client side */}
                                {!isMe && <p className="text-xs text-gray-500 mb-1 px-1">{msg.senderName}</p>}
                                <div className={`px-4 py-2.5 text-sm leading-relaxed ${
                                  isMe
                                    ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm'
                                    : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-bl-sm shadow-sm'
                                }`}>
                                  {msg.message && <p>{msg.message}</p>}
                                  {(() => {
                                    const atts = msg.attachments ? JSON.parse(msg.attachments) : [];
                                    if (!atts.length) return null;
                                    const apiBase = api.defaults.baseURL?.replace('/api', '') || '';
                                    return (
                                      <div className={`${msg.message ? 'mt-2 pt-2 border-t' : ''} ${isMe ? 'border-white/20' : 'border-gray-100'} space-y-1.5`}>
                                        {atts.map((att, idx) => {
                                          const fileUrl = `${apiBase}${att.filePath}`;
                                          return att.mimeType?.startsWith('image/') ? (
                                            <a key={idx} href={fileUrl} target="_blank" rel="noopener noreferrer" className="block">
                                              <img src={fileUrl} alt={att.fileName} className="max-w-[200px] rounded-lg mt-1" />
                                            </a>
                                          ) : (
                                            <a key={idx} href={fileUrl} target="_blank" rel="noopener noreferrer"
                                              className={`flex items-center gap-2 text-xs ${isMe ? 'text-white/90 hover:text-white' : 'text-primary-600 hover:text-primary-700'}`}>
                                              <Download className="w-3.5 h-3.5 flex-shrink-0" />
                                              <span className="underline truncate max-w-[150px]">{att.fileName}</span>
                                              <span className="opacity-60">({(att.fileSize / 1024).toFixed(0)} KB)</span>
                                            </a>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <p className="text-xs text-gray-400 mt-1 px-1">{format(new Date(msg.createdAt), 'h:mm a · MMM d')}</p>
                              </div>
                              {/* Avatar — servant side (right of bubble) */}
                              {isMe && (
                                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5 select-none">
                                  {msg.senderName?.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Invisible scroll anchor — scrollIntoView() targets this element */}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* ── Action Area ─────────────────────────────────────────────
                    Hidden once the ticket reaches a terminal state (RESOLVED / CLOSED).
                    Contains:
                    1. Status update buttons (filtered to exclude current status)
                    2. Escalate button + collapsible reason input
                    3. Internal-note checkbox + message input + send button
                ──────────────────────────────────────────────────────────────── */}
                {!['RESOLVED', 'CLOSED'].includes(selected.status) && (
                  <div className="pt-4 border-t border-gray-100 space-y-3">

                    {/* Status update buttons — at most 2 shown (excluding current status) */}
                    <div className="flex gap-2">
                      {STATUS_ACTIONS.filter(a => a.value !== selected.status).slice(0, 2).map(action => (
                        <button key={action.value} onClick={() => updateStatus(action.value)}
                          className={`text-xs text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex-1 ${action.color}`}>
                          {action.label}
                        </button>
                      ))}
                      {/* Escalate button toggles the escalation panel */}
                      <button
                        onClick={() => setShowEscalate(!showEscalate)}
                        className="text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center gap-1"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        Escalate
                      </button>
                    </div>

                    {/* Collapsible escalation panel — requires a non-empty reason */}
                    {showEscalate && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                        <p className="text-sm font-medium text-red-800">Escalate Reason</p>
                        <input type="text" className="input-field text-sm" placeholder="Reason for escalation..."
                          value={escalateReason} onChange={e => setEscalateReason(e.target.value)} />
                        <div className="flex gap-2">
                          <button onClick={escalate} className="btn-danger text-sm flex-1">Confirm Escalation</button>
                          <button onClick={() => setShowEscalate(false)} className="btn-secondary text-sm">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Message composer — supports both public replies and internal notes */}
                    <div className="space-y-2">
                      {/* Internal-note toggle checkbox */}
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" className="w-3.5 h-3.5 rounded" checked={isInternal}
                            onChange={e => setIsInternal(e.target.checked)} />
                          <span className="text-xs text-gray-600">Internal note only</span>
                        </label>
                      </div>
                      {/* File preview strip */}
                      {msgFiles.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {msgFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5 text-xs text-gray-600">
                              {f.type.startsWith('image/') ? <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5 text-orange-500" />}
                              <span className="max-w-[120px] truncate">{f.name}</span>
                              <button type="button" onClick={() => setMsgFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Text input + attach + send button */}
                      <div className="flex gap-2 items-center">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0"
                          title="Attach file"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,.pdf,.doc,.docx,.mp4,.mov"
                          className="hidden"
                          onChange={e => {
                            const newFiles = Array.from(e.target.files || []);
                            setMsgFiles(prev => [...prev, ...newFiles].slice(0, 5));
                            e.target.value = '';
                          }}
                        />
                        <input
                          type="text"
                          className="input-field flex-1 text-sm"
                          placeholder={isInternal ? 'Add internal note...' : 'Reply to resident...'}
                          value={message}
                          onChange={e => setMessage(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && sendMessage()}
                        />
                        <button onClick={sendMessage} disabled={!message.trim() && msgFiles.length === 0} className="btn-primary px-3 py-2 flex-shrink-0">
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty state shown on desktop when no ticket has been selected */
            <div className="hidden lg:flex flex-1 items-center justify-center">
              <div className="text-center text-gray-400">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium text-gray-500">Select a ticket to manage</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}
