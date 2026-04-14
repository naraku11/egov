/**
 * @file SidebarLayout.jsx
 * @description Collapsible sidebar navigation layout for authenticated users.
 *
 * Replaces the top navbar with a left sidebar that includes:
 *  - Logo and branding
 *  - Role-aware navigation links
 *  - Quick Actions section
 *  - Notification bell with unread badge
 *  - Language selector
 *  - Profile section with avatar, edit, and logout
 *
 * On mobile (<lg), the sidebar collapses into a hamburger-triggered overlay.
 * Unauthenticated pages should use the original Navbar instead.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Menu, X, Bell, LogOut, ChevronDown, ChevronLeft, Globe, LayoutDashboard,
  ClipboardList, ShieldCheck, Check, UserCog, Megaphone, BookOpen, BarChart2,
  FileText, HelpCircle, Search, Home, PlusCircle, FolderOpen, Scale,
  Users, Building2,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import ProfileModal from './ProfileModal.jsx';

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English', flag: '🇵🇭' },
  { code: 'fil', label: 'Filipino', flag: '🇵🇭' },
  { code: 'ceb', label: 'Cebuano', flag: '🇵🇭' },
];

const ROLE_META = {
  admin:   { label: 'Admin',          color: 'bg-purple-100 text-purple-700', avatar: 'bg-purple-600' },
  servant: { label: 'Public Servant', color: 'bg-green-100  text-green-700',  avatar: 'bg-green-600'  },
  client:  { label: 'Resident',       color: 'bg-blue-100   text-blue-700',   avatar: 'bg-primary-600' },
};

const STATUS_DOT = {
  AVAILABLE: 'bg-green-500',
  BUSY:      'bg-yellow-500',
  OFFLINE:   'bg-gray-400',
};

const STATUS_LABEL = {
  AVAILABLE: 'Available',
  BUSY:      'Busy',
  OFFLINE:   'Offline',
};

function getInitials(name = '') {
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

/**
 * SidebarLayout wraps page content with a left sidebar for navigation.
 * Usage: <SidebarLayout>{children}</SidebarLayout>
 */
export default function SidebarLayout({ children }) {
  const { user, servant, isAuthenticated, isAdmin, isServant, logout } = useAuth();
  const { language, changeLanguage, t } = useLanguage();
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  const langRef = useRef(null);
  const notifRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch notifications
  useEffect(() => {
    if (!isAuthenticated || isAdmin) return;
    api.get('/notifications').then(r => {
      const list = r.data || [];
      setNotifications(list);
      setUnread(list.filter(n => !n.isRead).length);
    }).catch(() => {});
  }, [isAuthenticated, isAdmin]);

  // Live notifications via socket
  useEffect(() => {
    if (!isAuthenticated || isAdmin) return;
    const onNew = (notif) => {
      setNotifications(prev => [notif, ...prev].slice(0, 50));
      setUnread(prev => prev + 1);

      // Play notification sound
      try {
        const audio = new Audio('/notification.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } catch {}

      // Show a clickable toast for citizens.
      // Servants handle their own toasts inside ServantDashboard.
      if (!isServant) {
        const iconMap = { NEW_MESSAGE: '💬', STATUS_UPDATE: '🔄', TICKET_ASSIGNED: '👤', TICKET_CREATED: '📝' };
        const icon = iconMap[notif.type] || '🔔';
        toast(
          (tst) => (
            <div
              className={`cursor-pointer ${notif.ticketId ? '' : 'cursor-default'}`}
              onClick={() => {
                toast.dismiss(tst.id);
                if (notif.ticketId) navigate(`/tickets/${notif.ticketId}`);
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{icon}</span>
                <span className="text-sm font-bold text-gray-900">{notif.title}</span>
              </div>
              <p className="text-xs text-gray-600 leading-snug line-clamp-2">{notif.message}</p>
              {notif.ticketId && <p className="text-xs text-primary-600 mt-1.5 font-medium">Click to view →</p>}
            </div>
          ),
          { duration: 6_000, position: 'top-right' }
        );
      }
    };
    socket.on('notification:new', onNew);
    return () => socket.off('notification:new', onNew);
  }, [isAuthenticated, isAdmin, isServant, socket, navigate]);

  // Announcement popup — show toast when admin publishes a new announcement
  useEffect(() => {
    if (!isAuthenticated || !socket) return;
    const onAnnouncement = (ann) => {
      // Play notification sound
      try { const a = new Audio('/notification.mp3'); a.volume = 0.5; a.play().catch(() => {}); } catch {}

      const categoryIcon = ann.category === 'ALERT' ? '🚨' : ann.category === 'EVENT' ? '📅' : '📢';
      toast(
        (tst) => (
          <div className="max-w-sm cursor-pointer" onClick={() => { toast.dismiss(tst.id); navigate('/announcements'); }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{categoryIcon}</span>
              <span className="text-sm font-bold text-gray-900">New Announcement</span>
            </div>
            <p className="text-sm font-semibold text-gray-800 leading-tight">{ann.title}</p>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ann.content}</p>
            <p className="text-xs text-primary-600 mt-2 font-medium">Click to view</p>
          </div>
        ),
        { duration: 8000, position: 'top-right' }
      );
    };
    socket.on('announcement:new', onAnnouncement);
    return () => socket.off('announcement:new', onAnnouncement);
  }, [isAuthenticated, socket, navigate]);

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnread(0);
    } catch {}
  };

  const markOneRead = (id) => {
    if (!id || id.startsWith('sn-')) return;
    api.patch(`/notifications/${id}/read`).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  const handleNotifClick = (n) => {
    if (!n.isRead) markOneRead(n.id);
    if (n.ticketId) {
      isServant
        ? navigate(`/servant?ticket=${n.ticketId}`)
        : navigate(`/tickets/${n.ticketId}`);
    }
    setNotifOpen(false);
  };

  // ── Admin: pending ID verification badge ────────────────────────────────────
  const [pendingVerifCount, setPendingVerifCount] = useState(0);

  // Load initial count on mount (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/admin/users')
      .then(r => setPendingVerifCount((r.data || []).filter(u => u.idStatus === 'PENDING_REVIEW').length))
      .catch(() => {});
  }, [isAdmin]);

  // Reset badge when admin navigates to the Citizens tab
  useEffect(() => {
    if (isAdmin && location.pathname === '/admin' && new URLSearchParams(location.search).get('tab') === 'citizens') {
      setPendingVerifCount(0);
    }
  }, [location, isAdmin]);

  // Real-time: new citizen pending verification
  useEffect(() => {
    if (!isAdmin) return;
    const onVerifPending = (data) => {
      setPendingVerifCount(prev => prev + 1);
      toast(
        (tst) => (
          <div className="cursor-pointer" onClick={() => { toast.dismiss(tst.id); navigate('/admin?tab=citizens'); }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🪪</span>
              <span className="text-sm font-bold text-gray-900">ID Verification Request</span>
            </div>
            <p className="text-sm text-gray-700 leading-snug">{data.name} submitted an ID for review</p>
            <p className="text-xs text-primary-600 mt-1.5 font-medium">Click to review →</p>
          </div>
        ),
        { duration: 10_000, position: 'top-right' }
      );
    };
    socket.on('verification:pending', onVerifPending);
    return () => socket.off('verification:pending', onVerifPending);
  }, [isAdmin, socket, navigate]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [mobileOpen]);

  // Swipe-to-close gesture for mobile drawer
  const touchStartX = useRef(null);
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 60) setMobileOpen(false); // swipe left to close
    touchStartX.current = null;
  }, []);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = () => { logout(); navigate('/'); };

  const currentPerson = servant || user;
  const currentLang = LANGUAGE_OPTIONS.find(l => l.code === language);
  const role = isAdmin ? 'admin' : isServant ? 'servant' : 'client';
  const roleMeta = ROLE_META[role];
  const initials = getInitials(currentPerson?.name || '');

  const isActive = (to) => {
    // Handle sidebar items with query params (e.g. /admin?tab=servants)
    if (to.includes('?')) {
      return location.pathname + location.search === to;
    }
    // For /admin without query, only match when there's no tab param
    if (to === '/admin') {
      return location.pathname === '/admin' && !location.search;
    }
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  // Build nav items per role
  const navItems = isAdmin
    ? [
        { to: '/admin',                  icon: ShieldCheck,     label: 'Admin Panel' },
        { to: '/admin?tab=servants',     icon: ClipboardList,   label: 'Servants' },
        { to: '/admin?tab=citizens',     icon: Users,           label: 'Citizens', badge: pendingVerifCount },
        { to: '/admin?tab=departments',  icon: Building2,       label: 'Departments' },
        { to: '/announcements',          icon: Megaphone,       label: 'Announcements' },
        { to: '/directory',              icon: BookOpen,        label: 'Directory' },
        { to: '/reports',                icon: BarChart2,       label: 'Reports' },
        { to: '/faq',                    icon: HelpCircle,      label: 'Help & FAQs' },
      ]
    : isServant
    ? [
        { to: '/servant', icon: ClipboardList, label: t('myAssignments') },
        { to: '/faq',     icon: HelpCircle,    label: 'Help & FAQs' },
      ]
    : [
        { to: '/dashboard', icon: Home,            label: t('dashboard') },
        { to: '/submit',    icon: PlusCircle,      label: t('submitConcern') },
        { to: '/tickets',   icon: FolderOpen,      label: t('myTickets') },
        { to: '/announcements', icon: Megaphone,   label: 'Announcements' },
        { to: '/directory', icon: BookOpen,         label: 'Directory' },
        { to: '/faq',      icon: HelpCircle,       label: 'FAQs & Help' },
      ];

  // Sidebar content shared between desktop and mobile
  const sidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-gray-100 flex-shrink-0 ${collapsed && !isMobile ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">
          AG
        </div>
        {(!collapsed || isMobile) && (
          <div className="leading-none">
            <p className="text-sm font-bold text-gray-900">Aloguinsan</p>
            <p className="text-[11px] text-gray-400 font-medium tracking-wide">E-GOV PORTAL</p>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto p-2.5 -mr-1 rounded-lg hover:bg-gray-100 touch-target">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

      {/* Nav Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {(!collapsed || isMobile) && (
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Navigation</p>
        )}
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <Link
            key={to}
            to={to}
            title={collapsed && !isMobile ? label : undefined}
            onClick={() => isMobile && setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive(to)
                ? 'bg-primary-50 text-primary-700 shadow-sm'
                : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
            } ${collapsed && !isMobile ? 'justify-center' : ''}`}
          >
            <div className="relative flex-shrink-0">
              <Icon className="w-5 h-5" />
              {/* Badge shown when collapsed (icon-only mode) */}
              {badge > 0 && collapsed && !isMobile && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            {(!collapsed || isMobile) && (
              <>
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="w-5 h-5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </>
            )}
          </Link>
        ))}
      </nav>

      {/* Bottom section: notifications, language, profile */}
      <div className="border-t border-gray-100 px-3 py-3 space-y-2 flex-shrink-0">
        {/* Notification bell — non-admin only */}
        {!isAdmin && (
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors ${collapsed && !isMobile ? 'justify-center' : ''}`}
            >
              <div className="relative flex-shrink-0">
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
              {(!collapsed || isMobile) && <span>Notifications</span>}
            </button>

            {notifOpen && !isMobile && (
              <div className={`absolute ${collapsed ? 'left-full ml-2 bottom-0' : 'left-0 bottom-full mb-2'} w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-[60] overflow-hidden`}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-900">Notifications</span>
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-xs text-primary-600 hover:text-primary-700 font-medium py-1 px-2">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto overscroll-contain">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No notifications</p>
                  ) : notifications.slice(0, 15).map(n => (
                    <button
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-primary-50/40' : ''} ${!n.ticketId ? 'cursor-default' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />}
                        <div className={!n.isRead ? '' : 'pl-4'}>
                          <p className="text-sm font-medium text-gray-900 leading-tight">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                          <p className="text-[11px] text-gray-400 mt-1">{format(new Date(n.createdAt), 'MMM d · h:mm a')}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Language Selector */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen(!langOpen)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors ${collapsed && !isMobile ? 'justify-center' : ''}`}
          >
            <Globe className="w-5 h-5 flex-shrink-0" />
            {(!collapsed || isMobile) && (
              <>
                <span className="flex-1 text-left">{currentLang?.label}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
          {langOpen && (
            <div className={`absolute ${collapsed && !isMobile ? 'left-full ml-2 bottom-0' : 'left-0 bottom-full mb-2'} w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-[60]`}>
              {LANGUAGE_OPTIONS.map(opt => (
                <button
                  key={opt.code}
                  onClick={() => { changeLanguage(opt.code); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 hover:bg-gray-50 transition-colors ${
                    language === opt.code ? 'text-primary-600 font-medium' : 'text-gray-700'
                  }`}
                >
                  <span className="text-base">{opt.flag}</span>
                  <span className="flex-1">{opt.label}</span>
                  {language === opt.code && <Check className="w-3.5 h-3.5 text-primary-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile section */}
        <div className="border-t border-gray-100 pt-3 mt-2">
          <div className={`flex items-center gap-3 px-2 ${collapsed && !isMobile ? 'justify-center' : ''}`}>
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {currentPerson?.avatarUrl ? (
                <img src={currentPerson.avatarUrl} alt={currentPerson.name} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs ${roleMeta.avatar}`}>
                  {initials}
                </div>
              )}
              {isServant && servant?.status && (
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${STATUS_DOT[servant.status] || 'bg-gray-400'}`} />
              )}
            </div>
            {(!collapsed || isMobile) && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{currentPerson?.name}</p>
                {isServant && servant?.status ? (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${roleMeta.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[servant.status]}`} />
                    {STATUS_LABEL[servant.status]}
                  </span>
                ) : (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-block ${roleMeta.color}`}>
                    {roleMeta.label}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className={`flex gap-1.5 mt-3 ${collapsed && !isMobile ? 'flex-col items-center' : ''}`}>
            <button
              onClick={() => { setMobileOpen(false); setShowProfileModal(true); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors ${collapsed && !isMobile ? 'justify-center w-full' : 'flex-1'}`}
              title="Edit Profile"
            >
              <UserCog className="w-4 h-4" />
              {(!collapsed || isMobile) && 'Profile'}
            </button>
            <button
              onClick={handleLogout}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors ${collapsed && !isMobile ? 'justify-center w-full' : 'flex-1'}`}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              {(!collapsed || isMobile) && t('logout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Desktop Sidebar */}
        <aside className={`hidden lg:flex flex-col bg-white border-r border-gray-200 sticky top-0 h-screen transition-all duration-300 z-40 ${collapsed ? 'w-[72px]' : 'w-64'}`}>
          {sidebarContent(false)}
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 shadow-sm transition-colors z-50"
          >
            <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </aside>

        {/* Mobile header bar */}
        <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 safe-top z-50">
          <div className="h-14 flex items-center px-3">
            <button onClick={() => setMobileOpen(true)} className="p-2.5 -ml-1 rounded-lg hover:bg-gray-100 touch-target">
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
            <div className="flex items-center gap-2 ml-2 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">AG</div>
              <span className="text-sm font-bold text-gray-900 truncate">Aloguinsan E-Gov</span>
            </div>
            {!isAdmin && (
              <div className="relative" ref={notifRef}>
                <button onClick={() => setNotifOpen(!notifOpen)} className="p-2.5 -mr-1 rounded-lg hover:bg-gray-100 touch-target">
                  <Bell className="w-5 h-5 text-gray-500" />
                  {unread > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                {/* Mobile notification dropdown */}
                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[calc(100vw-1.5rem)] max-w-sm bg-white rounded-xl shadow-lg border border-gray-100 z-[60] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <span className="text-sm font-semibold text-gray-900">Notifications</span>
                      {unread > 0 && (
                        <button onClick={markAllRead} className="text-xs text-primary-600 hover:text-primary-700 font-medium py-1 px-2">
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
                      {notifications.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">No notifications</p>
                      ) : notifications.slice(0, 15).map(n => (
                        <button
                          key={n.id}
                          onClick={() => handleNotifClick(n)}
                          className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-primary-50/40' : ''} ${!n.ticketId ? 'cursor-default' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />}
                            <div className={!n.isRead ? '' : 'pl-4'}>
                              <p className="text-sm font-medium text-gray-900 leading-tight">{n.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                              <p className="text-[11px] text-gray-400 mt-1">{format(new Date(n.createdAt), 'MMM d · h:mm a')}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <>
            <div className="fixed inset-0 bg-black/40 z-50 lg:hidden" onClick={() => setMobileOpen(false)} />
            <aside
              className="fixed inset-y-0 left-0 w-[min(80vw,18rem)] bg-white z-50 lg:hidden shadow-xl safe-top"
              style={{ animation: 'slideInLeft 0.2s ease-out' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {sidebarContent(true)}
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 lg:pt-0 pt-14">
          {children}
        </main>
      </div>

      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
    </>
  );
}
