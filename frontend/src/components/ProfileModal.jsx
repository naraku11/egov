import { useState, useRef, useEffect } from 'react';
import { Camera, X, Lock, Eye, EyeOff, User, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const BARANGAY_LIST = [
  'Aluguinsan', 'Babayongan', 'Bajumpandan', 'Baring', 'Bongba',
  'Cabitoonan', 'Calangcang', 'Candabong', 'Compostela', 'Gawi',
  'Kabalaasan', 'Kabangkalan', 'Kanghumaod', 'Kanguha', 'Katipunan',
  'Langin', 'Libertad', 'Looc', 'Mainggit', 'Mandao',
  'Mataba', 'Poblacion', 'Tangub', 'Tipolo', 'Tuburan',
];

const LANGUAGE_OPTIONS = [
  { value: 'ENGLISH',  label: 'English'  },
  { value: 'FILIPINO', label: 'Filipino' },
  { value: 'CEBUANO',  label: 'Cebuano'  },
];

function getInitials(name = '') {
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export default function ProfileModal({ onClose }) {
  const { user, servant, isServant, updateUser, updateServant } = useAuth();
  const person = servant || user;

  const [form, setForm] = useState({
    name:     person?.name     || '',
    phone:    person?.phone    || '',
    position: servant?.position || '',
    barangay: user?.barangay   || '',
    address:  user?.address    || '',
    language: user?.language   || 'ENGLISH',
  });
  const [pwForm, setPwForm]               = useState({ current: '', newPw: '', confirm: '' });
  const [showPwSection, setShowPwSection] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw]         = useState(false);
  const [avatarFile, setAvatarFile]       = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(person?.avatarUrl || null);
  const [loading, setLoading]             = useState(false);
  const fileRef = useRef();

  // Keep preview in sync with the stored avatarUrl (handles stale state after login)
  useEffect(() => {
    if (!avatarFile) setAvatarPreview(person?.avatarUrl || null);
  }, [person?.avatarUrl]);

  const set   = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const setPw = (field) => (e) => setPwForm(f => ({ ...f, [field]: e.target.value }));

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (showPwSection && pwForm.newPw) {
      if (!pwForm.current)                return toast.error('Enter your current password');
      if (pwForm.newPw.length < 6)        return toast.error('New password must be at least 6 characters');
      if (pwForm.newPw !== pwForm.confirm) return toast.error('Passwords do not match');
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('name',  form.name);
      fd.append('phone', form.phone);

      if (isServant) {
        fd.append('position', form.position);
      } else {
        fd.append('barangay', form.barangay);
        fd.append('address',  form.address);
        fd.append('language', form.language);
      }

      if (showPwSection && pwForm.newPw) {
        fd.append('currentPassword', pwForm.current);
        fd.append('newPassword',     pwForm.newPw);
      }

      if (avatarFile) fd.append('avatar', avatarFile);

      const { data } = await api.put('/auth/profile', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (isServant) {
        updateServant(data);
      } else {
        updateUser(data);
      }

      toast.success('Profile updated successfully');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const initials = getInitials(form.name);
  const avatarBg = isServant ? 'bg-green-600' : 'bg-primary-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-fadeIn">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-4 h-4 text-primary-600" />
            Edit Profile
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          <form id="profile-form" onSubmit={handleSubmit} className="p-6 space-y-4">

            {/* Avatar picker */}
            <div className="flex flex-col items-center gap-2 pb-2">
              <div
                className="relative cursor-pointer group"
                onClick={() => fileRef.current.click()}
                title="Click to change photo"
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar"
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 group-hover:opacity-70 transition-opacity"
                  />
                ) : (
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold ${avatarBg} group-hover:opacity-70 transition-opacity`}>
                    {initials}
                  </div>
                )}
                {/* Camera overlay */}
                <div className="absolute inset-0 flex items-center justify-center rounded-full">
                  <div className="w-8 h-8 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-4 h-4 text-white" />
                  </div>
                </div>
                {/* Camera badge */}
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center border-2 border-white">
                  <Camera className="w-3 h-3 text-white" />
                </div>
              </div>
              <p className="text-xs text-gray-400">Click to change · JPG, PNG, GIF, WebP · Max 2 MB</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input className="input-field" value={form.name} onChange={set('name')} required />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                className="input-field"
                placeholder="09xxxxxxxxx"
                value={form.phone}
                onChange={set('phone')}
              />
            </div>

            {/* Servant-only fields */}
            {isServant && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
                <input
                  className="input-field"
                  placeholder="e.g. Engineer I"
                  value={form.position}
                  onChange={set('position')}
                  required
                />
              </div>
            )}

            {/* Resident-only fields */}
            {!isServant && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Barangay *</label>
                  <select className="input-field" value={form.barangay} onChange={set('barangay')} required>
                    <option value="">Select barangay</option>
                    {BARANGAY_LIST.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    className="input-field"
                    placeholder="Street, Purok, etc."
                    value={form.address}
                    onChange={set('address')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Language</label>
                  <select className="input-field" value={form.language} onChange={set('language')}>
                    {LANGUAGE_OPTIONS.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Change Password toggle */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPwSection(!showPwSection)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-gray-400" />
                  Change Password
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showPwSection ? 'rotate-180' : ''}`} />
              </button>

              {showPwSection && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrentPw ? 'text' : 'password'}
                        className="input-field pr-10"
                        placeholder="••••••••"
                        value={pwForm.current}
                        onChange={setPw('current')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        className="input-field pr-10"
                        placeholder="Min. 6 characters"
                        value={pwForm.newPw}
                        onChange={setPw('newPw')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="Re-enter new password"
                      value={pwForm.confirm}
                      onChange={setPw('confirm')}
                    />
                  </div>
                </div>
              )}
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="submit"
            form="profile-form"
            disabled={loading}
            className="btn-primary flex-1"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
