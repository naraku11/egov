import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Bell, LogOut, ChevronDown, Globe, LayoutDashboard, ClipboardList, ShieldCheck, Check, UserCog, Megaphone, BookOpen, BarChart2 } from 'lucide-react';
import { format } from 'date-fns';
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

// Reusable avatar element
function Avatar({ person, roleMeta, servant, isServant, size = 'sm' }) {
  const initials = getInitials(person?.name || '');
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-10 h-10 text-sm';
  const dot  = size === 'sm' ? 'w-2.5 h-2.5 -bottom-0.5 -right-0.5' : 'w-3 h-3 -bottom-0.5 -right-0.5';

  return (
    <div className="relative flex-shrink-0">
      {person?.avatarUrl ? (
        <img
          src={person.avatarUrl}
          alt={person.name}
          className={`${dim} rounded-full object-cover`}
        />
      ) : (
        <div className={`${dim} rounded-full flex items-center justify-center text-white font-bold ${roleMeta.avatar}`}>
          {initials}
        </div>
      )}
      {isServant && servant?.status && (
        <span className={`absolute ${dot} rounded-full border-2 border-white ${STATUS_DOT[servant.status] || 'bg-gray-400'}`} />
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, servant, isAuthenticated, isAdmin, isServant, logout } = useAuth();
  const { language, changeLanguage, t } = useLanguage();
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen,       setMobileOpen]       = useState(false);
  const [langOpen,         setLangOpen]         = useState(false);
  const [profileOpen,      setProfileOpen]      = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [notifOpen,        setNotifOpen]        = useState(false);
  const [notifications,    setNotifications]    = useState([]);
  const [unread,           setUnread]           = useState(0);

  const langRef    = useRef(null);
  const profileRef = useRef(null);
  const notifRef   = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (langRef.current    && !langRef.current.contains(e.target))    setLangOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (notifRef.current   && !notifRef.current.contains(e.target))   setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch notifications for non-admin authenticated users
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
    };
    socket.on('notification:new', onNew);
    return () => socket.off('notification:new', onNew);
  }, [isAuthenticated, isAdmin]);

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnread(0);
    } catch { /* ignore */ }
  };

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => { logout(); navigate('/'); };
  const openProfile  = () => { setProfileOpen(false); setMobileOpen(false); setShowProfileModal(true); };

  const currentPerson = servant || user;
  const currentLang   = LANGUAGE_OPTIONS.find(l => l.code === language);
  const homeLink = isAuthenticated ? (isAdmin ? '/admin' : isServant ? '/servant' : '/dashboard') : '/';

  const role     = isAdmin ? 'admin' : isServant ? 'servant' : 'client';
  const roleMeta = ROLE_META[role];
  const initials = getInitials(currentPerson?.name || '');

  // Nav items per role
  const navItems = isAdmin
    ? [
        { to: '/admin',         icon: ShieldCheck,     label: 'Admin Panel'   },
        { to: '/announcements', icon: Megaphone,       label: 'Announcements' },
        { to: '/directory',     icon: BookOpen,        label: 'Directory'     },
        { to: '/reports',       icon: BarChart2,       label: 'Reports'       },
      ]
    : isServant
    ? [
        { to: '/servant', icon: ClipboardList, label: t('myAssignments') },
      ]
    : isAuthenticated
    ? [
        { to: '/dashboard', icon: LayoutDashboard, label: t('dashboard') },
      ]
    : [];

  const isActive = (to) => location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">

            {/* ── Logo ── */}
            <Link to={homeLink} className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                AG
              </div>
              <div className="hidden sm:block leading-none">
                <p className="text-sm font-bold text-gray-900">Aluguinsan</p>
                <p className="text-[11px] text-gray-400 font-medium tracking-wide">E-GOV PORTAL</p>
              </div>
            </Link>

            {/* ── Desktop Nav Links ── */}
            <div className="hidden md:flex items-center gap-0.5 flex-1">
              {navItems.map(({ to, icon: Icon, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(to)
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>

            {/* ── Right Side ── */}
            <div className="flex items-center gap-2 ml-auto">

              {/* Notification Bell — client & servant */}
              {isAuthenticated && !isAdmin && (
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => setNotifOpen(!notifOpen)}
                    className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    <Bell className="w-4 h-4" />
                    {unread > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="absolute right-0 mt-1.5 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <span className="text-sm font-semibold text-gray-900">Notifications</span>
                        {unread > 0 && (
                          <button onClick={markAllRead} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                            Mark all read
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-6">No notifications</p>
                        ) : notifications.slice(0, 20).map(n => (
                          <button
                            key={n.id}
                            onClick={() => {
                              if (n.ticketId) navigate(`/tickets/${n.ticketId}`);
                              setNotifOpen(false);
                            }}
                            className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-primary-50/40' : ''}`}
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
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm">{currentLang?.flag} {currentLang?.label}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
                </button>
                {langOpen && (
                  <div className="absolute right-0 mt-1.5 w-44 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                    {LANGUAGE_OPTIONS.map(opt => (
                      <button
                        key={opt.code}
                        onClick={() => { changeLanguage(opt.code); setLangOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-gray-50 transition-colors ${
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

              {/* Auth area */}
              {isAuthenticated ? (
                <div className="hidden sm:flex items-center">

                  {/* Profile pill → dropdown */}
                  <div className="relative" ref={profileRef}>
                    <button
                      onClick={() => setProfileOpen(!profileOpen)}
                      className="flex items-center gap-2 pl-1 pr-2 py-1 bg-gray-50 border border-gray-100 rounded-xl hover:border-gray-300 transition-colors"
                    >
                      <Avatar person={currentPerson} roleMeta={roleMeta} servant={servant} isServant={isServant} size="sm" />
                      <div className="leading-none text-left">
                        <p className="text-sm font-medium text-gray-800 max-w-[100px] truncate">{currentPerson?.name}</p>
                        {isServant && servant?.status ? (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 inline-flex items-center gap-1 ${roleMeta.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[servant.status]}`} />
                            {STATUS_LABEL[servant.status]}
                          </span>
                        ) : (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 inline-block ${roleMeta.color}`}>
                            {roleMeta.label}
                          </span>
                        )}
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Profile dropdown */}
                    {profileOpen && (
                      <div className="absolute right-0 mt-1.5 w-52 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-fadeIn">
                        {/* Identity header */}
                        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-50">
                          <Avatar person={currentPerson} roleMeta={roleMeta} servant={servant} isServant={isServant} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{currentPerson?.name}</p>
                            <p className="text-xs text-gray-400 truncate">{currentPerson?.email}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <button
                          onClick={openProfile}
                          className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <UserCog className="w-4 h-4 text-gray-400" />
                          Edit Profile
                        </button>

                        <div className="border-t border-gray-100 my-0.5" />

                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          {t('logout')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-2">
                  <Link to="/auth" className="btn-secondary text-sm py-1.5 px-4">{t('login')}</Link>
                  <Link to="/auth?tab=register" className="btn-primary text-sm py-1.5 px-4">{t('register')}</Link>
                </div>
              )}

              {/* Mobile hamburger */}
              <button
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Mobile Drawer ── */}
        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 animate-fadeIn">

            {/* User info header (authenticated) */}
            {isAuthenticated && (
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <Avatar person={currentPerson} roleMeta={roleMeta} servant={servant} isServant={isServant} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{currentPerson?.name}</p>
                  {isServant && servant?.status ? (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${roleMeta.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[servant.status]}`} />
                      {STATUS_LABEL[servant.status]}
                    </span>
                  ) : (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${roleMeta.color}`}>
                      {roleMeta.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={openProfile}
                    title="Edit Profile"
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors"
                  >
                    <UserCog className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Nav links */}
            <div className="px-3 py-2 space-y-0.5">
              {navItems.map(({ to, icon: Icon, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive(to)
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-primary-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}

              {!isAuthenticated && (
                <>
                  <Link to="/auth" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-primary-600 transition-colors">
                    {t('login')}
                  </Link>
                  <Link to="/auth?tab=register" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 transition-colors">
                    {t('register')}
                  </Link>
                </>
              )}
            </div>

            {/* Language options in mobile */}
            <div className="px-3 pb-3 border-t border-gray-100 mt-1 pt-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">Language</p>
              <div className="flex gap-2">
                {LANGUAGE_OPTIONS.map(opt => (
                  <button
                    key={opt.code}
                    onClick={() => changeLanguage(opt.code)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors border ${
                      language === opt.code
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt.flag} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Profile modal — rendered outside <nav> to avoid z-index stacking issues */}
      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
    </>
  );
}
