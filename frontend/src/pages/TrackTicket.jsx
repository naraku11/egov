/**
 * TrackTicket.jsx
 *
 * Dual-panel page where a citizen can browse and interact with their submitted
 * tickets (concerns).
 *
 * Left panel  – Scrollable list of the user's tickets with search and status
 *               filter controls.  On mobile the list takes the full screen;
 *               selecting a ticket switches to the detail panel.
 *
 * Right panel – Chat-style ticket detail view that shows:
 *               • A status timeline bar (Submitted → Assigned → In Progress → Resolved)
 *               • The original concern description and any uploaded attachments
 *               • A real-time message thread shared between the citizen and the
 *                 assigned servant, updated via Socket.IO
 *               • A feedback/star-rating prompt once the ticket is resolved
 *               • A message input bar (hidden for resolved/closed tickets)
 *
 * Real-time updates are received over the SocketContext which emits
 * `message:new` and `ticket:updated` events while the user has a ticket room
 * open.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Search, Send, Star, ArrowLeft, Paperclip, Clock, CheckCircle, AlertCircle, XCircle, MessageSquare, X, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import SidebarLayout from '../components/SidebarLayout.jsx';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge.jsx';

/**
 * Ordered steps used to render the visual status timeline.
 * Each item maps a ticket status to a display label and icon component.
 */
const statusTimeline = [
  { status: 'PENDING',     label: 'Submitted',   icon: Clock         },
  { status: 'ASSIGNED',    label: 'Assigned',     icon: CheckCircle   },
  { status: 'IN_PROGRESS', label: 'In Progress',  icon: AlertCircle   },
  { status: 'RESOLVED',    label: 'Resolved',     icon: CheckCircle   },
];

/**
 * Numeric order for statuses — used to determine which timeline steps to
 * highlight as "active" (i.e. already reached).
 */
const statusOrder = { PENDING: 0, ASSIGNED: 1, IN_PROGRESS: 2, RESOLVED: 3, CLOSED: 3, ESCALATED: 1 };

/**
 * TrackTicket
 *
 * Dual-panel ticket tracking page with real-time chat, status timeline,
 * file attachments, and citizen feedback collection.
 *
 * @returns {JSX.Element} The full-page ticket tracking view.
 */
export default function TrackTicket() {
  // Route param — may be pre-set when navigating directly to a ticket URL
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const { t } = useLanguage();
  const socket = useSocket();

  // Full list of the citizen's tickets
  const [tickets, setTickets]               = useState([]);
  // Currently open ticket with messages, attachments, and feedback
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Search and filter state for the left-panel ticket list
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusFilter, setStatusFilter]     = useState('');

  // Message input value for the chat bar
  const [message, setMessage]               = useState('');

  // Feedback star rating (1–5) and optional comment
  const [rating, setRating]                 = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');

  // File attachments for messages
  const [msgFiles, setMsgFiles]             = useState([]);
  const fileInputRef                        = useRef(null);

  // Admin: department change state
  const [departments, setDepartments]       = useState([]);
  const [changingDept, setChangingDept]     = useState(false);
  const [deptLoading, setDeptLoading]       = useState(false);

  // Loading flags
  const [loading, setLoading]               = useState(true);
  const [sendingMsg, setSendingMsg]         = useState(false);

  // Ref attached to a sentinel div at the bottom of the messages list
  const messagesEndRef = useRef(null);

  // ── Auto-scroll to newest message whenever the message list grows ──────────
  useEffect(() => {
    if (selectedTicket?.messages?.length) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [selectedTicket?.messages?.length]);

  // ── Real-time Socket.IO: join the ticket room and listen for events ─────────
  useEffect(() => {
    if (!selectedTicket) return;
    const room = `ticket:${selectedTicket.id}`;
    socket.emit('join', { room });

    /**
     * Appends an incoming servant message to the selected ticket's thread.
     * CLIENT messages are skipped because they are already reflected
     * optimistically via the API response in `sendMessage`.
     *
     * @param {object} msg - The incoming socket message payload.
     */
    const onMessage = (msg) => {
      if (msg.senderType === 'CLIENT') return; // already shown via API response
      setSelectedTicket(prev => {
        if (!prev || prev.id !== msg.ticketId) return prev;
        // Deduplicate in case the event fires multiple times
        const exists = prev.messages.some(m => m.id === msg.id);
        if (exists) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
    };

    /**
     * Merges a ticket update (e.g. status change, assignment) into both the
     * selected ticket detail and the left-panel list item.
     *
     * @param {object} update - Partial ticket object from the server.
     */
    const onUpdated = (update) => {
      setSelectedTicket(prev => prev?.id === update.id ? { ...prev, ...update } : prev);
      setTickets(prev => prev.map(t => t.id === update.id ? { ...t, ...update } : t));
    };

    socket.on('message:new',    onMessage);
    socket.on('ticket:updated', onUpdated);

    // Clean up listeners and leave the room when a different ticket is selected
    return () => {
      socket.emit('leave', { room });
      socket.off('message:new',    onMessage);
      socket.off('ticket:updated', onUpdated);
    };
  }, [selectedTicket?.id]);

  // Re-fetch the ticket list whenever the status filter changes
  useEffect(() => { loadTickets(); }, [statusFilter]);

  // If the page was opened with a ticket ID in the URL, load it directly
  useEffect(() => { if (id) loadTicket(id); }, [id]);

  /**
   * Loads up to 50 of the citizen's tickets, optionally filtered by status.
   */
  const loadTickets = async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.append('status', statusFilter);
      const { data } = await api.get(`/tickets?${params}`);
      setTickets(data.tickets || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetches full detail (messages, attachments, feedback) for a single ticket
   * and sets it as the currently selected/open ticket.
   *
   * @param {string} ticketId - UUID of the ticket to load.
   */
  const loadTicket = async (ticketId) => {
    try {
      const { data } = await api.get(`/tickets/${ticketId}`);
      setSelectedTicket(data);
    } catch {
      toast.error('Could not load ticket');
    }
  };

  /**
   * POSTs a new citizen message to the selected ticket's thread, then
   * refreshes the ticket to include the saved message.
   */
  const sendMessage = async () => {
    if (!message.trim() && msgFiles.length === 0) return;
    setSendingMsg(true);
    try {
      const formData = new FormData();
      formData.append('message', message);
      msgFiles.forEach(f => formData.append('attachments', f));
      await api.post(`/tickets/${selectedTicket.id}/message`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage('');
      setMsgFiles([]);
      await loadTicket(selectedTicket.id);
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSendingMsg(false);
    }
  };

  /**
   * Submits the star rating and optional comment as feedback for a resolved
   * ticket.  Refreshes the ticket detail to reflect the saved feedback state.
   */
  const submitFeedback = async () => {
    if (!rating) return toast.error('Please select a rating');
    try {
      await api.post(`/tickets/${selectedTicket.id}/feedback`, { rating, comment: feedbackComment });
      toast.success('Feedback submitted! Thank you!');
      await loadTicket(selectedTicket.id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  /**
   * Admin: load departments list (lazy, only when admin opens the change picker).
   */
  const loadDepartments = async () => {
    if (departments.length > 0) return;
    try {
      const { data } = await api.get('/departments');
      setDepartments(data || []);
    } catch {}
  };

  /**
   * Admin: change the ticket's department.
   */
  const changeDepartment = async (departmentId) => {
    if (!selectedTicket || !departmentId) return;
    setDeptLoading(true);
    try {
      const { data } = await api.patch(`/tickets/${selectedTicket.id}/department`, { departmentId });
      setSelectedTicket(prev => ({ ...prev, ...data }));
      setTickets(prev => prev.map(t => t.id === data.id ? { ...t, ...data } : t));
      setChangingDept(false);
      toast.success('Department updated');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setDeptLoading(false);
    }
  };

  /**
   * Client-side filter: keeps tickets whose title or ticketNumber contains
   * the current search query (case-insensitive).
   */
  const filteredTickets = tickets.filter(t =>
    !searchQuery ||
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // First letter of the citizen's name — used as avatar initials in the chat
  const userInitial = user?.name?.charAt(0).toUpperCase() || 'M';

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-4 lg:gap-6 min-h-[500px] lg:h-[calc(100vh-7rem)]">

          {/* ── Left panel: Ticket list ── */}
          {/* Hidden on mobile when a ticket is selected (detail takes full screen) */}
          <div className={`${selectedTicket ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 xl:w-96 flex-shrink-0`}>
            <div className="card flex flex-col h-full">
              <h2 className="font-semibold text-gray-900 mb-4">{t('myTickets')}</h2>

              {/* Search bar */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input type="text" className="input-field pl-9 text-sm" placeholder={t('searchTickets')}
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>

              {/* Status filter removed — citizens see all tickets */}

              {/* Scrollable ticket list */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center h-20">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent" />
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">{t('noTickets')}</p>
                    <Link to="/submit" className="btn-primary text-xs mt-3 inline-block">Submit Concern</Link>
                  </div>
                ) : filteredTickets.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => loadTicket(ticket.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedTicket?.id === ticket.id
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs text-gray-500 font-mono">{ticket.ticketNumber}</span>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{ticket.title}</p>
                    {/* Department colour dot */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.department?.color || '#3B82F6' }} />
                      <p className="text-xs text-gray-500">{ticket.department?.name}</p>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-xs text-gray-400">{format(new Date(ticket.createdAt), 'MMM d, yyyy')}</p>
                      {/* Message count badge */}
                      {ticket._count?.messages > 0 && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <MessageSquare className="w-3 h-3" />
                          {ticket._count.messages}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right panel: Ticket detail / chat view ── */}
          {selectedTicket ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* ── Header: ticket number, status badges, department, assignee ── */}
                <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100 bg-white">
                  <div className="flex items-start gap-3">
                    {/* Back button — only visible on mobile */}
                    <button onClick={() => setSelectedTicket(null)} className="lg:hidden p-2.5 -ml-1 hover:bg-gray-100 rounded-lg flex-shrink-0 touch-target">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{selectedTicket.ticketNumber}</span>
                        <StatusBadge status={selectedTicket.status} />
                        <PriorityBadge priority={selectedTicket.priority} />
                      </div>
                      <h2 className="text-base font-bold text-gray-900 leading-tight">{selectedTicket.title}</h2>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                        {/* Department — admin can change it */}
                        {isAdmin ? (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedTicket.department?.color || '#3B82F6' }} />
                            {changingDept ? (
                              <select
                                autoFocus
                                className="text-xs border border-primary-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
                                defaultValue={selectedTicket.departmentId || ''}
                                onChange={e => { if (e.target.value) changeDepartment(e.target.value); }}
                                onBlur={() => setChangingDept(false)}
                                disabled={deptLoading}
                              >
                                <option value="">Select department</option>
                                {departments.map(d => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => { loadDepartments(); setChangingDept(true); }}
                                className="hover:text-primary-600 hover:underline cursor-pointer"
                                title="Change department"
                              >
                                {selectedTicket.department?.name || 'No department'}
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedTicket.department?.color || '#3B82F6' }} />
                            {selectedTicket.department?.name}
                          </span>
                        )}
                        {selectedTicket.servant && <span>👤 {selectedTicket.servant.name}</span>}
                        <span>📅 {format(new Date(selectedTicket.createdAt), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Status timeline bar ── */}
                <div className="flex-shrink-0 px-5 py-2.5 border-b border-gray-50 bg-gray-50/60 overflow-x-auto">
                  <div className="flex items-center gap-1">
                    {statusTimeline.map((item, i) => {
                      // A step is "active" when the ticket has reached or passed it
                      const current  = statusOrder[selectedTicket.status] || 0;
                      const isActive = current >= statusOrder[item.status];
                      return (
                        <div key={item.status} className="flex items-center gap-1 flex-shrink-0">
                          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            isActive ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <item.icon className="w-3 h-3" />
                            {item.label}
                          </div>
                          {/* Connector line between steps */}
                          {i < statusTimeline.length - 1 && (
                            <div className={`h-0.5 w-6 flex-shrink-0 ${isActive ? 'bg-primary-300' : 'bg-gray-200'}`} />
                          )}
                        </div>
                      );
                    })}
                    {/* Extra escalation badge appended when applicable */}
                    {selectedTicket.status === 'ESCALATED' && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 ml-2">
                        <XCircle className="w-3 h-3" /> Escalated
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Messages area (scrollable) ── */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

                  {/* Original concern shown as a read-only card at the top of the thread */}
                  <div className="bg-gray-50 rounded-2xl p-4 mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Original Concern</p>
                    <p className="text-sm text-gray-800 leading-relaxed">{selectedTicket.description}</p>
                    {/* Attachment links */}
                    {selectedTicket.attachments?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {selectedTicket.attachments.map(att => {
                          const apiBase = api.defaults.baseURL?.replace('/api', '') || '';
                          const fileUrl = att.filePath?.startsWith('http') ? att.filePath : `${apiBase}${att.filePath}`;
                          return (
                            <a key={att.id} href={fileUrl} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-primary-300 transition-colors">
                              <Paperclip className="w-3 h-3" />
                              {att.fileName}
                              {att.location && <span className="text-gray-400 ml-1">({att.location})</span>}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Message bubbles */}
                  {selectedTicket.messages?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <MessageSquare className="w-10 h-10 mb-2 opacity-25" />
                      <p className="text-sm font-medium">No messages yet</p>
                      {!['RESOLVED', 'CLOSED'].includes(selectedTicket.status) && (
                        <p className="text-xs mt-1 text-gray-400">Send a message to your assigned servant below</p>
                      )}
                    </div>
                  ) : (
                    selectedTicket.messages.map(msg => {
                      // System messages are rendered as a centred, pill-shaped label
                      if (msg.senderType === 'SYSTEM') {
                        return (
                          <div key={msg.id} className="flex justify-center my-1">
                            <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full italic">{msg.message}</span>
                          </div>
                        );
                      }
                      // `isMe` is true when the message was sent by the citizen (CLIENT)
                      const isMe = msg.senderType === 'CLIENT';
                      return (
                        <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {/* Avatar — servant side (left) */}
                          {!isMe && (
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5 select-none">
                              {msg.senderName?.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className={`max-w-[85%] sm:max-w-[72%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            {/* Sender name label — only shown for servant messages */}
                            {!isMe && (
                              <p className="text-xs text-gray-500 mb-1 px-1">{msg.senderName}</p>
                            )}
                            {/* Bubble: primary colour for citizen, white card for servant */}
                            <div className={`px-4 py-2.5 text-sm leading-relaxed break-words ${
                              isMe
                                ? 'bg-primary-600 text-white rounded-2xl rounded-br-sm'
                                : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-bl-sm shadow-sm'
                            }`}>
                              {msg.message && <p>{msg.message}</p>}
                              {/* Render file attachments */}
                              {(() => {
                                const atts = msg.attachments ? JSON.parse(msg.attachments) : [];
                                if (atts.length === 0) return null;
                                return (
                                  <div className={`${msg.message ? 'mt-2 pt-2 border-t' : ''} ${isMe ? 'border-white/20' : 'border-gray-100'} space-y-1.5`}>
                                    {atts.map((att, idx) => {
                                      const isImage = att.mimeType?.startsWith('image/');
                                      const apiBase = api.defaults.baseURL?.replace('/api', '') || '';
                                      const fileUrl = `${apiBase}${att.filePath}`;
                                      return isImage ? (
                                        <a key={idx} href={fileUrl} target="_blank" rel="noopener noreferrer" className="block">
                                          <img src={fileUrl} alt={att.fileName} className="max-w-full sm:max-w-[200px] rounded-lg mt-1" />
                                        </a>
                                      ) : (
                                        <a key={idx} href={fileUrl} target="_blank" rel="noopener noreferrer"
                                          className={`flex items-center gap-2 text-xs ${isMe ? 'text-white/90 hover:text-white' : 'text-primary-600 hover:text-primary-700'}`}>
                                          <Download className="w-3.5 h-3.5 flex-shrink-0" />
                                          <span className="underline truncate max-w-[120px] sm:max-w-[180px]">{att.fileName}</span>
                                          <span className="opacity-60">({(att.fileSize / 1024).toFixed(0)} KB)</span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                            <p className={`text-xs mt-1 px-1 ${isMe ? 'text-gray-400' : 'text-gray-400'}`}>
                              {format(new Date(msg.createdAt), 'h:mm a · MMM d')}
                            </p>
                          </div>

                          {/* Avatar — citizen side (right) */}
                          {isMe && (
                            <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5 select-none">
                              {userInitial}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* Feedback prompt — shown once the ticket is resolved and no feedback exists yet */}
                  {(selectedTicket.status === 'RESOLVED' || selectedTicket.status === 'CLOSED') && !selectedTicket.feedback && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mt-2">
                      <p className="font-semibold text-yellow-900 mb-3">{t('rateService')}</p>
                      {/* Star rating buttons */}
                      <div className="flex gap-1.5 mb-3">
                        {[1,2,3,4,5].map(s => (
                          <button key={s} onClick={() => setRating(s)} className="p-2 transition-transform hover:scale-110 active:scale-95 touch-target">
                            <Star className={`w-8 h-8 ${s <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                          </button>
                        ))}
                      </div>
                      <textarea className="input-field text-sm resize-none" rows={2} placeholder="Optional comment..."
                        value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} />
                      <button onClick={submitFeedback} className="btn-primary text-sm mt-2 w-full">{t('submitFeedback')}</button>
                    </div>
                  )}

                  {/* Already-submitted feedback — read-only star display */}
                  {selectedTicket.feedback && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> {t('thankYou')}
                      </p>
                      <div className="flex gap-1 mt-2">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} className={`w-5 h-5 ${s <= selectedTicket.feedback.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Scroll anchor — scrollIntoView targets this element */}
                  <div ref={messagesEndRef} />
                </div>

                {/* ── Message input bar — hidden for resolved/closed tickets ── */}
                {!['RESOLVED', 'CLOSED'].includes(selectedTicket.status) && (
                  <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white space-y-2 safe-bottom">
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
                    <div className="flex gap-2 items-center">
                      {/* Citizen avatar */}
                      <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0 select-none">
                        {userInitial}
                      </div>
                      {/* Attach file button */}
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
                      {/* Message text input */}
                      <input
                        type="text"
                        className="input-field flex-1 text-sm"
                        placeholder="Message your servant..."
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      />
                      {/* Send button */}
                      <button
                        onClick={sendMessage}
                        disabled={sendingMsg || (!message.trim() && msgFiles.length === 0)}
                        className="btn-primary px-3.5 py-2.5 flex-shrink-0 disabled:opacity-50"
                      >
                        {sendingMsg
                          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <Send className="w-4 h-4" />
                        }
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty state — shown on desktop when no ticket is selected */
            <div className="hidden lg:flex flex-1 items-center justify-center">
              <div className="text-center text-gray-400">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium text-gray-500">Select a concern to view details</p>
                <p className="text-sm mt-1">Click any concern from the list on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}
