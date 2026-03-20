import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Clock, AlertTriangle, MessageSquare, ChevronDown, Send, ArrowUpCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import Navbar from '../components/Navbar.jsx';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge.jsx';

const STATUS_ACTIONS = [
  { value: 'IN_PROGRESS', label: 'Mark In Progress', color: 'bg-indigo-600 hover:bg-indigo-700' },
  { value: 'RESOLVED', label: 'Mark Resolved', color: 'bg-green-600 hover:bg-green-700' },
  { value: 'CLOSED', label: 'Close Ticket', color: 'bg-gray-600 hover:bg-gray-700' },
];

export default function ServantDashboard() {
  const { servant, updateServant } = useAuth();
  const { t } = useLanguage();
  const socket = useSocket();
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [escalateReason, setEscalateReason] = useState('');
  const [showEscalate, setShowEscalate] = useState(false);
  const [servantStatus, setServantStatus] = useState(servant?.status || 'AVAILABLE');

  const messagesEndRef = useRef(null);
  const heartbeatRef   = useRef(null);

  useEffect(() => { loadData(); }, [filter]);

  // Heartbeat: ping every 60 s to keep lastActiveAt fresh; mark OFFLINE on unmount
  useEffect(() => {
    const sendHeartbeat = () => api.patch('/servants/heartbeat').catch(() => {});
    sendHeartbeat(); // immediate ping on mount
    heartbeatRef.current = setInterval(sendHeartbeat, 60000);
    return () => {
      clearInterval(heartbeatRef.current);
      // Mark servant offline when they leave the dashboard (navigate away or close tab)
      api.patch('/servants/status', { status: 'OFFLINE' }).catch(() => {});
    };
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    if (selected?.messages?.length) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [selected?.messages?.length]);

  // Real-time: join ticket room when a ticket is open
  useEffect(() => {
    if (!selected) return;
    const room = `ticket:${selected.id}`;
    socket.emit('join', { room });

    const onMessage = (msg) => {
      if (msg.senderType === 'SERVANT') return; // already shown via API response
      setSelected(prev => {
        if (!prev || prev.id !== msg.ticketId) return prev;
        const exists = prev.messages.some(m => m.id === msg.id);
        if (exists) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
    };

    const onUpdated = (update) => {
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

  // Real-time: listen for newly assigned tickets
  useEffect(() => {
    const onAssigned = () => loadData();
    socket.on('ticket:assigned', onAssigned);
    return () => socket.off('ticket:assigned', onAssigned);
  }, []);

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

  const loadTicket = async (id) => {
    try {
      const { data } = await api.get(`/tickets/${id}`);
      setSelected(data);
    } catch (err) {
      toast.error('Failed to load ticket');
    }
  };

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

  const sendMessage = async () => {
    if (!message.trim()) return;
    try {
      await api.post(`/tickets/${selected.id}/message`, { message, isInternal });
      setMessage('');
      await loadTicket(selected.id);
    } catch (err) {
      toast.error('Failed to send');
    }
  };

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

  const priorityOrder = { URGENT: 0, NORMAL: 1, LOW: 2 };
  const sortedTickets = [...tickets].sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

  const urgentCount = tickets.filter(t => t.priority === 'URGENT' && !['RESOLVED','CLOSED'].includes(t.status)).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Servant Dashboard</h1>
            <p className="text-gray-500 text-sm">{servant?.name} · {servant?.department?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {urgentCount > 0 && (
              <div className="flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-1.5 rounded-full text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                {urgentCount} urgent
              </div>
            )}
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

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4 mb-6">
          {[
            { label: 'Total Assigned', value: stats.total || 0, color: 'text-blue-600 bg-blue-50' },
            { label: 'Pending', value: stats.pending || 0, color: 'text-yellow-600 bg-yellow-50' },
            { label: 'In Progress', value: stats.inProgress || 0, color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Resolved', value: stats.resolved || 0, color: 'text-green-600 bg-green-50' },
            { label: 'Avg Rating', value: stats.avgRating ? `${stats.avgRating.toFixed(1)}⭐` : 'N/A', color: 'text-amber-600 bg-amber-50' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card text-center py-4">
              <p className={`text-xl font-bold ${color.split(' ')[0]}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4 lg:gap-6 min-h-[500px] lg:h-[calc(100vh-18rem)]">
          {/* Ticket List */}
          <div className={`${selected ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 xl:w-96 flex-shrink-0`}>
            <div className="card flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">{t('myAssignments')}</h2>
                <span className="text-sm text-gray-500">{tickets.length} tickets</span>
              </div>

              <select className="input-field text-sm mb-4" value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="">{t('all')}</option>
                <option value="PENDING">Pending</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="ESCALATED">Escalated</option>
              </select>

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

          {/* Ticket Detail */}
          {selected ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="card flex flex-col h-full overflow-hidden">
                {/* Header */}
                <div className="flex items-start gap-3 mb-4 pb-4 border-b border-gray-100">
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
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                      <span>👤 {selected.user?.name}</span>
                      <span>📍 {selected.user?.barangay}</span>
                      {selected.user?.phone && <span>📱 {selected.user?.phone}</span>}
                      <span>📅 {format(new Date(selected.createdAt), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4">
                  {/* Description */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Concern Description</p>
                    <p className="text-sm text-gray-800 leading-relaxed">{selected.description}</p>
                  </div>

                  {/* Attachments */}
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

                  {/* Conversation */}
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
                          // System pill
                          if (msg.senderType === 'SYSTEM') {
                            return (
                              <div key={msg.id} className="flex justify-center my-1">
                                <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full italic">{msg.message}</span>
                              </div>
                            );
                          }
                          // Internal note — always on right, amber
                          if (msg.isInternal) {
                            return (
                              <div key={msg.id} className="flex justify-end">
                                <div className="max-w-[72%] flex flex-col items-end">
                                  <div className="px-4 py-2.5 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl rounded-br-sm">
                                    <p className="text-xs font-semibold text-amber-600 mb-1">🔒 Internal Note</p>
                                    {msg.message}
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1 px-1">{format(new Date(msg.createdAt), 'h:mm a · MMM d')}</p>
                                </div>
                                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5 ml-2 self-end select-none">
                                  {msg.senderName?.charAt(0).toUpperCase()}
                                </div>
                              </div>
                            );
                          }
                          const isMe = msg.senderType === 'SERVANT';
                          return (
                            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                              {/* Avatar — client side */}
                              {!isMe && (
                                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5 select-none">
                                  {msg.senderName?.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className={`max-w-[72%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                {!isMe && <p className="text-xs text-gray-500 mb-1 px-1">{msg.senderName}</p>}
                                <div className={`px-4 py-2.5 text-sm leading-relaxed ${
                                  isMe
                                    ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm'
                                    : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-bl-sm shadow-sm'
                                }`}>
                                  {msg.message}
                                </div>
                                <p className="text-xs text-gray-400 mt-1 px-1">{format(new Date(msg.createdAt), 'h:mm a · MMM d')}</p>
                              </div>
                              {/* Avatar — servant side */}
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
                    {/* Scroll anchor */}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Actions */}
                {!['RESOLVED', 'CLOSED'].includes(selected.status) && (
                  <div className="pt-4 border-t border-gray-100 space-y-3">
                    {/* Status update */}
                    <div className="flex gap-2">
                      {STATUS_ACTIONS.filter(a => a.value !== selected.status).slice(0, 2).map(action => (
                        <button key={action.value} onClick={() => updateStatus(action.value)}
                          className={`text-xs text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex-1 ${action.color}`}>
                          {action.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setShowEscalate(!showEscalate)}
                        className="text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center gap-1"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        Escalate
                      </button>
                    </div>

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

                    {/* Message */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" className="w-3.5 h-3.5 rounded" checked={isInternal}
                            onChange={e => setIsInternal(e.target.checked)} />
                          <span className="text-xs text-gray-600">Internal note only</span>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="input-field flex-1 text-sm"
                          placeholder={isInternal ? 'Add internal note...' : 'Reply to resident...'}
                          value={message}
                          onChange={e => setMessage(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && sendMessage()}
                        />
                        <button onClick={sendMessage} disabled={!message.trim()} className="btn-primary px-3 py-2 flex-shrink-0">
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="hidden lg:flex flex-1 items-center justify-center">
              <div className="text-center text-gray-400">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium text-gray-500">Select a ticket to manage</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
