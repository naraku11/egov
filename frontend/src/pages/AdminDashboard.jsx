/**
 * @file AdminDashboard.jsx
 * @description System administration panel for the Aloguinsan E-Gov Portal.
 *
 * This page is only accessible to users with the ADMIN role. It provides a
 * tabbed interface covering four areas:
 *
 *  1. Overview  — KPI stat cards, a 7-day ticket trend line chart, a status
 *                 distribution pie chart, a per-department bar chart, and a
 *                 "Recent Submissions" sidebar.
 *
 *  2. Tickets   — A full searchable / filterable table of all tickets in the
 *                 system (up to 50 records fetched per load).
 *
 *  3. Servants  — Grid of public-servant cards with real-time presence
 *                 indicators, workload bars, and edit / remove actions.
 *                 The list auto-polls every 30 seconds while this tab is active.
 *
 *  4. SLA Breaches — List of tickets that have exceeded their SLA deadline,
 *                 with a red badge count on the tab button.
 *
 * Sub-components defined in this file:
 *  - ServantModal        — Add / edit a public servant (with avatar upload).
 *  - DeleteConfirmModal  — Confirmation dialog before removing a servant.
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users, FileText, CheckCircle, AlertTriangle, Star, TrendingUp,
  Building2, UserPlus, RefreshCw, X, Search, Filter, Clock,
  ShieldCheck, Activity, ChevronRight, Pencil, Trash2, Camera,
  Archive, MapPin, Phone, Mail, UserX, Eye, ShieldOff, Shield, UserCheck,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import SidebarLayout from '../components/SidebarLayout.jsx';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge.jsx';

/**
 * ServantModal component.
 *
 * Renders a modal dialog used for both creating a new public servant and
 * editing an existing one. The mode is determined by whether a `servant`
 * prop is passed (edit) or null (add).
 *
 * Supports optional avatar upload (max 2 MB; validated client-side).
 * The form is submitted as `multipart/form-data` so the avatar file can be
 * sent alongside the text fields in a single request.
 *
 * @param {object}   props
 * @param {object|null} props.servant      - Existing servant to pre-fill the form,
 *                                           or null when adding a new servant.
 * @param {Array}    props.departments     - List of department objects for the
 *                                           department select dropdown.
 * @param {Function} props.onClose         - Called to close the modal without saving.
 * @param {Function} props.onSaved         - Called after a successful save so the
 *                                           parent can refresh the servant list.
 * @returns {JSX.Element} The modal overlay with the add/edit form.
 */
function ServantModal({ servant, departments, onClose, onSaved }) {
  // Determine whether we are in edit mode (servant exists) or add mode
  const isEdit = !!servant;

  // Form field state — pre-populated from the servant prop when editing
  const [form, setForm] = useState({
    name:         servant?.name         || '',
    email:        servant?.email        || '',
    position:     servant?.position     || '',
    phone:        servant?.phone        || '',
    departmentId: servant?.departmentId || '',
    status:       servant?.status       || 'AVAILABLE',
    password:     '', // Always starts blank; left empty on edit = keep current
  });

  /** The new File object chosen by the user; null if no new image is selected */
  const [avatarFile, setAvatarFile]       = useState(null);
  /** Object URL (or existing URL) used to preview the avatar image */
  const [avatarPreview, setAvatarPreview] = useState(servant?.avatarUrl || null);
  const [loading, setLoading]             = useState(false);

  // Hidden file input ref — triggered programmatically when the avatar area is clicked
  const fileRef = useRef();

  /**
   * Validates the chosen image file and sets the preview URL.
   * Files larger than 2 MB are rejected with a toast error.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} e - File input change event.
   */
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2 MB'); return; }
    setAvatarFile(file);
    // createObjectURL gives an immediate local preview without uploading first
    setAvatarPreview(URL.createObjectURL(file));
  };

  /**
   * Submits the servant form via multipart/form-data.
   * Uses PUT for edits and POST for new servants.
   * Calls onSaved() + onClose() on success.
   *
   * @param {React.FormEvent<HTMLFormElement>} e - Form submit event.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.departmentId) return toast.error('Please select a department');
    setLoading(true);
    try {
      // Build FormData so the optional avatar file can be included
      const fd = new FormData();
      fd.append('name',         form.name);
      fd.append('email',        form.email);
      fd.append('position',     form.position);
      fd.append('phone',        form.phone);
      fd.append('departmentId', form.departmentId);
      fd.append('status',       form.status);
      if (form.password) fd.append('password', form.password); // only send if changed
      if (avatarFile)    fd.append('avatar',   avatarFile);    // only send if a new file was picked

      if (isEdit) {
        await api.put(`/servants/${servant.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success(`${form.name} updated`);
      } else {
        await api.post('/servants', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success(`${form.name} added`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Convenience helper that returns an onChange handler updating a single
   * named field in the form state object.
   *
   * @param {string} field - The key in the form state to update.
   * @returns {Function} onChange handler.
   */
  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  /**
   * Derives a two-character initials string from the servant's name, used as
   * the avatar placeholder when no image has been chosen.
   * Falls back to '?' when the name field is empty.
   */
  const initials = form.name.trim()
    ? (() => { const p = form.name.trim().split(' '); return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : form.name.slice(0, 2).toUpperCase(); })()
    : '?';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fadeIn">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            {isEdit
              ? <><Pencil className="w-4 h-4 text-primary-600" /> Edit Servant</>
              : <><UserPlus className="w-4 h-4 text-primary-600" /> Add Public Servant</>
            }
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Avatar picker — clicking the avatar circle opens the hidden file input */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative cursor-pointer group"
              onClick={() => fileRef.current.click()}
              title="Click to change photo"
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 group-hover:opacity-70 transition-opacity"
                />
              ) : (
                /* Initials placeholder shown when no image is available */
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold bg-green-600 group-hover:opacity-70 transition-opacity">
                  {initials}
                </div>
              )}
              {/* Hover overlay with camera icon */}
              <div className="absolute inset-0 flex items-center justify-center rounded-full">
                <div className="w-7 h-7 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              {/* Small camera badge always visible at bottom-right of the circle */}
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center border-2 border-white">
                <Camera className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Click to set photo · JPG, PNG, GIF, WebP · Max 2 MB</p>
            {/* Hidden file input; accept restricts the OS file picker to images */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input className="input-field" placeholder="Maria Santos" value={form.name} onChange={set('name')} required />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" className="input-field" placeholder="servant@aloguinsan.gov.ph" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
              <input className="input-field" placeholder="e.g. Engineer I" value={form.position} onChange={set('position')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" className="input-field" placeholder="09xxxxxxxxx" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
              <select className="input-field" value={form.departmentId} onChange={set('departmentId')} required>
                <option value="">Select department</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            {/* Availability status toggle — only shown when editing an existing servant */}
            {isEdit && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Availability Status</label>
                <div className="flex gap-2">
                  {[
                    { value: 'AVAILABLE', label: 'Available', color: 'border-green-300  bg-green-50  text-green-700',  dot: 'bg-green-500'  },
                    { value: 'BUSY',      label: 'Busy',      color: 'border-yellow-300 bg-yellow-50 text-yellow-700', dot: 'bg-yellow-500' },
                    { value: 'OFFLINE',   label: 'Offline',   color: 'border-gray-300   bg-gray-100  text-gray-600',   dot: 'bg-gray-400'   },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: opt.value }))}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-all ${
                        form.status === opt.value
                          ? `${opt.color} shadow-sm`
                          : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${form.status === opt.value ? opt.dot : 'bg-gray-300'}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {/* Password is required only for new servants; blank = keep current on edit */}
                Password {isEdit ? <span className="font-normal text-gray-400">(leave blank to keep current)</span> : '*'}
              </label>
              <input
                type="password"
                className="input-field"
                placeholder={isEdit ? '••••••••' : 'Temporary password'}
                value={form.password}
                onChange={set('password')}
                required={!isEdit}
                minLength={6}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save Changes' : 'Add Servant')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * DeleteConfirmModal component.
 *
 * A simple confirmation dialog shown before permanently removing a public
 * servant. Includes a warning that any open tickets assigned to the servant
 * will revert to PENDING status.
 *
 * @param {object}   props
 * @param {object}   props.servant    - The servant object about to be deleted
 *                                      (used to display their name).
 * @param {Function} props.onClose    - Called to cancel and close the modal.
 * @param {Function} props.onConfirm  - Called when the admin confirms deletion.
 * @param {boolean}  props.loading    - Disables the confirm button while the
 *                                      delete API call is in flight.
 * @returns {JSX.Element} The confirmation modal overlay.
 */
function DeleteConfirmModal({ servant, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-fadeIn">
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Remove Servant?</h2>
          <p className="text-sm text-gray-500 mb-1">
            You are about to remove <span className="font-semibold text-gray-800">{servant.name}</span>.
          </p>
          {/* Warning about ticket re-assignment side-effect */}
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            Any open tickets assigned to this servant will be returned to <strong>Pending</strong>.
          </p>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? 'Removing...' : 'Yes, Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * CitizenModal component.
 *
 * Modal dialog for editing a citizen's profile. Admin can update name, email,
 * phone, barangay, address, verification status, and reset password.
 */
function CitizenModal({ citizen, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:       citizen?.name       || '',
    email:      citizen?.email      || '',
    phone:      citizen?.phone      || '',
    barangay:   citizen?.barangay   || '',
    address:    citizen?.address    || '',
    isVerified: citizen?.isVerified ?? true,
    password:   '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.barangay) return toast.error('Name and barangay are required');
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      await api.put(`/admin/users/${citizen.id}`, payload);
      toast.success('Citizen updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fadeIn" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Edit Citizen</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Barangay *</label>
              <input className="input-field" value={form.barangay} onChange={e => setForm(f => ({ ...f, barangay: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input className="input-field" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input type="password" className="input-field" placeholder="Leave blank to keep current" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={6} />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Account Status:</label>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, isVerified: !f.isVerified }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                form.isVerified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {form.isVerified ? 'Verified (Active)' : 'Unverified (Archived)'}
            </button>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * CitizenDeleteModal component.
 *
 * Confirmation dialog before permanently deleting a citizen account.
 */
function CitizenDeleteModal({ citizen, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-fadeIn">
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserX className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Delete Citizen?</h2>
          <p className="text-sm text-gray-500 mb-1">
            You are about to delete <span className="font-semibold text-gray-800">{citizen.name}</span>.
          </p>
          {citizen._count?.tickets > 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              This citizen has <strong>{citizen._count.tickets} ticket(s)</strong>. You must archive instead if tickets exist.
            </p>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading || citizen._count?.tickets > 0}
            className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? 'Deleting...' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * DepartmentModal component.
 *
 * Modal dialog for creating a new department or editing an existing one.
 * Supports: name, code, description, head, email, phone, color, keywords.
 */
function DepartmentModal({ department, onClose, onSaved }) {
  const isEdit = !!department;
  const [form, setForm] = useState({
    name:        department?.name        || '',
    code:        department?.code        || '',
    description: department?.description || '',
    head:        department?.head        || '',
    email:       department?.email       || '',
    phone:       department?.phone       || '',
    color:       department?.color       || '#3B82F6',
    keywords:    Array.isArray(department?.keywords) ? department.keywords.join(', ') : '',
    isActive:    department?.isActive    ?? true,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.code) return toast.error('Name and code are required');
    setLoading(true);
    try {
      const payload = {
        ...form,
        code: form.code.toUpperCase().replace(/\s+/g, '_'),
        keywords: form.keywords ? form.keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
      };
      if (isEdit) {
        await api.put(`/departments/${department.id}`, payload);
        toast.success('Department updated');
      } else {
        await api.post('/departments', payload);
        toast.success('Department created');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fadeIn" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary-600" />
            {isEdit ? 'Edit Department' : 'Add Department'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department Name *</label>
            <input className="input-field" placeholder="e.g. Municipal Engineering Office" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input className="input-field uppercase" placeholder="e.g. ENGINEERING" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input type="color" className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
                <input className="input-field flex-1 font-mono text-sm" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department Head</label>
            <input className="input-field" placeholder="e.g. Engr. Juan Dela Cruz" value={form.head} onChange={e => setForm(f => ({ ...f, head: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea className="input-field resize-none" rows={2} placeholder="Brief description of services..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="input-field" placeholder="dept@aloguinsan.gov.ph" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" className="input-field" placeholder="(032) 555-0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">AI Keywords</label>
            <input className="input-field" placeholder="road, flood, infrastructure (comma-separated)" value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">Comma-separated keywords used by the AI classifier to route tickets to this department.</p>
          </div>
          {isEdit && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Status:</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  form.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {form.isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Department'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Chart colour palette cycled across pie slices, bar cells, etc. */
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

/** Status options available in the Tickets tab filter dropdown */
const STATUS_OPTIONS = ['ALL', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED'];

/** Navigation tabs displayed in the inline tab bar (servants/citizens/departments are in the sidebar) */
const TABS = ['overview', 'tickets', 'sla'];

/**
 * AdminDashboard component.
 *
 * Manages all admin data fetching, polling, and state. Data is loaded lazily
 * per tab — switching to a tab that hasn't been visited yet triggers
 * `fetchTabData()` for that tab. The Overview stats, departments list, and
 * recent tickets are always loaded on initial mount regardless of the active tab.
 *
 * @returns {JSX.Element} The full admin dashboard, or a spinner during the
 *   initial data load.
 */
export default function AdminDashboard() {
  // Logged-in admin user (used for the greeting)
  const { user } = useAuth();

  // ── Tab state (synced with URL ?tab= param for sidebar navigation) ─────────
  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_TABS = ['overview', 'tickets', 'servants', 'citizens', 'departments', 'sla'];
  const tab = VALID_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const setTab = (t) => {
    if (t === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: t }, { replace: true });
    }
  };

  // ── Data state ──────────────────────────────────────────────────────────────
  /** Aggregated system stats returned by GET /admin/stats */
  const [stats, setStats] = useState(null);
  /** Full ticket list used in the Tickets tab (up to 50 items) */
  const [tickets, setTickets] = useState([]);
  /** All public servants — loaded when the Servants tab is first opened */
  const [servants, setServants] = useState([]);
  /** Tickets whose SLA deadline has passed — loaded when the SLA tab is opened */
  const [slaBreaches, setSlaBreaches] = useState([]);
  /** All registered citizens — loaded when the Citizens tab is first opened */
  const [citizens, setCitizens] = useState([]);
  /** The 5 most recently submitted tickets shown in the Overview sidebar */
  const [recentTickets, setRecentTickets] = useState([]);

  /** True while the very first page load is in progress (shows full-page spinner) */
  const [loading, setLoading] = useState(true);

  /** Full list of departments used in the add/edit servant modal dropdown */
  const [departments, setDepartments] = useState([]);

  // ── Modal state ─────────────────────────────────────────────────────────────
  /** null = modal closed, 'add' = new servant form, servant object = edit form */
  const [servantModal, setServantModal] = useState(null);
  /** The servant object currently staged for deletion, or null */
  const [deletingServant, setDeletingServant] = useState(null);
  /** True while the delete API call is in flight (disables the confirm button) */
  const [deleteLoading, setDeleteLoading] = useState(false);

  /** Citizen object to edit in CitizenModal, or null */
  const [citizenModal, setCitizenModal] = useState(null);
  /** Citizen object staged for deletion, or null */
  const [deletingCitizen, setDeletingCitizen] = useState(null);
  /** True while the citizen delete API call is in flight */
  const [citizenDeleteLoading, setCitizenDeleteLoading] = useState(false);
  /** Search query for the citizens tab */
  const [citizenSearch, setCitizenSearch] = useState('');
  /** Citizen whose ID photo is being viewed/reviewed, or null */
  const [idReviewCitizen, setIdReviewCitizen] = useState(null);

  /** Ticket staged for deletion, or null */
  const [deletingTicket, setDeletingTicket] = useState(null);

  /** Ticket being assigned a servant — drives the assign-servant modal */
  const [assigningTicket, setAssigningTicket] = useState(null);
  /** Selected servantId in the assign modal */
  const [assignServantId, setAssignServantId] = useState('');
  /** Loading state for the assign API call */
  const [assignLoading, setAssignLoading] = useState(false);

  /** Archived tickets list */
  const [archivedTickets, setArchivedTickets] = useState([]);
  /** Search query for archived tab */
  const [archivedSearch, setArchivedSearch] = useState('');
  /** Sub-tab within tickets: 'active' or 'archived' */
  const [ticketSubTab, setTicketSubTab] = useState('active');
  /** Ticket staged for reactivation (requires password) */
  const [reactivatingTicket, setReactivatingTicket] = useState(null);
  /** Admin password for reactivation */
  const [reactivatePassword, setReactivatePassword] = useState('');
  /** Loading state for reactivation */
  const [reactivateLoading, setReactivateLoading] = useState(false);

  /** Ticket whose department is being changed, or null */
  const [changeDeptTicket, setChangeDeptTicket] = useState(null);
  /** Selected departmentId in the change-department modal */
  const [changeDeptId, setChangeDeptId] = useState('');
  /** Loading state for change-department API call */
  const [changeDeptLoading, setChangeDeptLoading] = useState(false);

  /** Department object to edit, 'add' for new, or null when closed */
  const [deptModal, setDeptModal] = useState(null);
  /** Search query for the departments tab */
  const [deptSearch, setDeptSearch] = useState('');

  // ── Refresh state ───────────────────────────────────────────────────────────
  /** True while a manual refresh is in flight (shows spinner on the Refresh button) */
  const [refreshing, setRefreshing] = useState(false);
  /** Timestamp of the last successful data load — shown as "Updated X ago" */
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // ── Tickets tab filters ─────────────────────────────────────────────────────
  /** Free-text search query applied to ticket number, title, and resident name */
  const [ticketSearch, setTicketSearch] = useState('');
  /** Status filter value; 'ALL' means no status filter is applied */
  const [ticketStatusFilter, setTicketStatusFilter] = useState('ALL');

  /** Interval ref for the 120-second servant list auto-poll */
  const servantPollRef = useRef(null);

  // ── Effects ─────────────────────────────────────────────────────────────────

  /**
   * Initial load effect — runs once on mount to fetch the overview data.
   */
  useEffect(() => {
    loadAll(true);
  }, []);

  /**
   * Tab change effect — fetches data when the active tab changes (including
   * via sidebar navigation which updates the URL ?tab= param).
   */
  useEffect(() => {
    if (tab !== 'overview' && stats) {
      fetchTabData(tab);
    }
  }, [tab]);

  /**
   * Servants tab polling effect.
   * Starts a 30-second interval that re-fetches the servant list whenever the
   * Servants tab is active (so presence / workload data stays fresh), and
   * clears the interval when the user navigates away from that tab.
   */
  useEffect(() => {
    if (tab === 'servants') {
      servantPollRef.current = setInterval(() => fetchTabData('servants'), 120000);
    } else {
      clearInterval(servantPollRef.current);
    }
    return () => clearInterval(servantPollRef.current);
  }, [tab]);

  // ── Data fetching helpers ───────────────────────────────────────────────────

  /**
   * Fetches the data specific to a given tab without changing the active tab or
   * resetting any other state. Used by both `loadTabData` and the servant poll.
   *
   * @param {'tickets'|'servants'|'sla'} targetTab - The tab whose data to load.
   */
  const fetchTabData = async (targetTab) => {
    try {
      if (targetTab === 'tickets' || targetTab === 'archived') {
        const { data } = await api.get('/admin/tickets?limit=200');
        const all = data.tickets || [];
        setTickets(all.filter(t => t.status !== 'CLOSED'));
        setArchivedTickets(all.filter(t => t.status === 'CLOSED'));
      } else if (targetTab === 'servants') {
        const { data } = await api.get('/servants');
        setServants(data || []);
      } else if (targetTab === 'citizens') {
        const { data } = await api.get('/admin/users');
        setCitizens(data || []);
      } else if (targetTab === 'departments') {
        const { data } = await api.get('/departments');
        setDepartments(data || []);
      } else if (targetTab === 'sla') {
        const { data } = await api.get('/admin/sla-breaches');
        setSlaBreaches(data || []);
      }
    } catch {
      toast.error('Failed to load data');
    }
  };

  /**
   * Switches the active tab by updating the URL param.
   * The tab-change effect handles fetching data automatically.
   *
   * @param {string} newTab - The tab identifier to switch to.
   */
  const loadTabData = (newTab) => {
    setTab(newTab);
  };

  /**
   * Performs a full refresh of overview data (stats, departments, recent
   * tickets) plus whatever tab is currently active.
   * On the initial call (`isInitial=true`) it shows the full-page spinner;
   * subsequent manual refreshes use the smaller inline spinner on the button.
   *
   * @param {boolean} [isInitial=false] - Whether this is the first-ever load.
   */
  const loadAll = async (isInitial = false) => {
    if (isInitial) setLoading(true); else setRefreshing(true);
    try {
      // Fetch overview data in parallel
      const [statsRes, deptsRes, recentRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/departments'),
        api.get('/admin/tickets?limit=5'),
      ]);
      setStats(statsRes.data);
      setDepartments(deptsRes.data);
      setRecentTickets(recentRes.data.tickets || []);
      setLastRefreshed(new Date());
      // Also refresh the currently visible tab so it does not show stale data
      if (tab !== 'overview') await fetchTabData(tab);
    } catch {
      toast.error('Failed to refresh');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * Sends the DELETE request for the servant staged in `deletingServant`.
   * On success refreshes the servant list and closes the confirmation modal.
   */
  const handleDeleteServant = async () => {
    if (!deletingServant) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/servants/${deletingServant.id}`);
      toast.success(`${deletingServant.name} removed`);
      setDeletingServant(null);
      loadTabData('servants');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCitizen = async () => {
    if (!deletingCitizen) return;
    setCitizenDeleteLoading(true);
    try {
      await api.delete(`/admin/users/${deletingCitizen.id}`);
      toast.success(`${deletingCitizen.name} deleted`);
      setDeletingCitizen(null);
      fetchTabData('citizens');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setCitizenDeleteLoading(false);
    }
  };

  const handleArchiveCitizen = async (citizen) => {
    try {
      const { data } = await api.patch(`/admin/users/${citizen.id}/archive`);
      toast.success(`${citizen.name} ${data.isVerified ? 'unarchived' : 'archived'}`);
      fetchTabData('citizens');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  const handleIdReview = async (citizenId, action) => {
    try {
      await api.patch(`/admin/users/${citizenId}/id-review`, { action });
      toast.success(`ID ${action === 'approve' ? 'approved' : 'rejected'}`);
      setIdReviewCitizen(null);
      fetchTabData('citizens');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  const handleAssignServant = async () => {
    if (!assigningTicket || !assignServantId) return;
    setAssignLoading(true);
    try {
      await api.patch(`/tickets/${assigningTicket.id}/assign`, { servantId: assignServantId });
      toast.success('Servant assigned');
      setAssigningTicket(null);
      setAssignServantId('');
      fetchTabData('tickets');
      if (tab === 'sla') fetchTabData('sla');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setAssignLoading(false);
    }
  };

  // Ensure servants list is loaded before opening the assign modal
  const openAssignModal = async (ticket) => {
    if (servants.length === 0) {
      try {
        const { data } = await api.get('/servants');
        setServants(data || []);
      } catch {}
    }
    setAssigningTicket(ticket);
    setAssignServantId('');
  };

  const handleChangeDept = async () => {
    if (!changeDeptTicket || !changeDeptId) return;
    setChangeDeptLoading(true);
    try {
      await api.patch(`/tickets/${changeDeptTicket.id}/department`, { departmentId: changeDeptId });
      toast.success('Department updated');
      setChangeDeptTicket(null);
      setChangeDeptId('');
      fetchTabData('tickets');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setChangeDeptLoading(false);
    }
  };

  const handleArchiveTicket = async (ticket) => {
    try {
      await api.patch(`/admin/tickets/${ticket.id}/archive`);
      toast.success(`Ticket #${ticket.ticketNumber} archived`);
      fetchTabData('tickets');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  const handleReactivateTicket = async () => {
    if (!reactivatingTicket) return;
    setReactivateLoading(true);
    try {
      await api.patch(`/admin/tickets/${reactivatingTicket.id}/archive`, { password: reactivatePassword });
      toast.success(`Ticket #${reactivatingTicket.ticketNumber} reactivated`);
      setReactivatingTicket(null);
      setReactivatePassword('');
      fetchTabData('archived');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reactivate');
    } finally {
      setReactivateLoading(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!deletingTicket) return;
    try {
      await api.delete(`/admin/tickets/${deletingTicket.id}`);
      toast.success(`Ticket #${deletingTicket.ticketNumber} deleted`);
      setDeletingTicket(null);
      fetchTabData('tickets');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  // ── Loading / empty guard ───────────────────────────────────────────────────
  if (loading || !stats) {
    return (
      <SidebarLayout>
        {/* Full-page spinner shown only during the initial data load */}
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" />
        </div>
      </SidebarLayout>
    );
  }

  // ── Derived chart data (computed after stats has loaded) ────────────────────

  /** Ticket count per status — fed into the PieChart */
  const statusData = stats.byStatus?.map(s => ({ name: s.status.replace('_', ' '), value: s.count })) || [];

  /** Ticket count per department — fed into the BarChart */
  const deptData = stats.byDepartment?.map(d => ({ name: d.department?.name?.split(' ').slice(0, 2).join(' ') || 'Unknown', tickets: d.count })) || [];

  /** Daily ticket volume for the last 7 days — fed into the LineChart */
  const trend = stats.ticketsLast7Days || [];

  /** Config array for the six overview KPI stat cards */
  const statCards = [
    { label: 'Total Tickets', value: stats.totalTickets, icon: FileText, color: 'text-blue-600 bg-blue-50' },
    { label: 'Pending', value: stats.pendingTickets, icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
    { label: 'Resolved Today', value: stats.resolvedToday, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
    { label: 'Active Users', value: stats.totalUsers, icon: Users, color: 'text-purple-600 bg-purple-50' },
    { label: 'SLA Breaches', value: stats.slaBreaches, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    { label: 'Avg. Rating', value: stats.avgRating ? `${stats.avgRating.toFixed(1)}/5` : 'N/A', icon: Star, color: 'text-amber-600 bg-amber-50' },
  ];

  /**
   * Tickets filtered by the search query and status dropdown in the Tickets tab.
   * Filtering is done client-side against the already-loaded tickets array.
   */
  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = !ticketSearch ||
      ticket.title?.toLowerCase().includes(ticketSearch.toLowerCase()) ||
      ticket.ticketNumber?.toLowerCase().includes(ticketSearch.toLowerCase()) ||
      ticket.user?.name?.toLowerCase().includes(ticketSearch.toLowerCase());
    const matchesStatus = ticketStatusFilter === 'ALL' || ticket.status === ticketStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* ── Page Header ──────────────────────────────────────────────────────
            Shows the admin's first name, today's date, and a relative
            "Updated X ago" timestamp. The Refresh button triggers loadAll().
        ────────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Admin Panel</h1>
              {/* Live system-online indicator — purely cosmetic */}
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                System Online
              </span>
            </div>
            <p className="text-gray-500 text-sm">
              Welcome, {user?.name?.split(' ')[0]} · {format(new Date(), 'EEEE, MMMM d, yyyy')} ·
              <span className="ml-1 text-gray-400">
                Updated {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
              </span>
            </p>
          </div>
          <button
            onClick={() => loadAll()}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* ── Tab Navigation ───────────────────────────────────────────────────
            Only shown for inline tabs (overview / tickets / sla).
            Servants, Citizens, and Departments are accessed from the sidebar
            and render as standalone pages — no tab bar needed.
        ────────────────────────────────────────────────────────────────────── */}
        {!['servants', 'citizens', 'departments'].includes(tab) && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-full overflow-x-auto sm:w-auto sm:inline-flex">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => loadTabData(t)}
                className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 min-h-[40px] ${
                  tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'sla' ? 'SLA Breaches' : t.charAt(0).toUpperCase() + t.slice(1)}
                {/* Red badge on SLA tab when breaches exist */}
                {t === 'sla' && stats.slaBreaches > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {stats.slaBreaches > 9 ? '9+' : stats.slaBreaches}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────
            KPI cards, three charts (trend line, status pie, dept bar), and a
            recent-submissions sidebar.
        ────────────────────────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Six KPI stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {statCards.map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="card">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Charts column (left 2/3) + recent tickets sidebar (right 1/3) */}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* 7-day ticket trend line chart */}
                <div className="card">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary-600" />
                    Tickets — Last 7 Days
                  </h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      {/* tickFormatter converts the ISO date string to a short label */}
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => format(new Date(d), 'MMM d')} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} name="Tickets" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Status pie chart and department bar chart side by side */}
                <div className="grid sm:grid-cols-2 gap-6">
                  {/* Donut-style status distribution pie */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-4 text-sm">Status Distribution</h3>
                    <div className="flex items-center gap-3">
                      <ResponsiveContainer width="55%" height={150}>
                        <PieChart>
                          <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                            {/* Each slice gets a colour from the COLORS palette */}
                            {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Colour-coded legend to the right of the chart */}
                      <div className="flex-1 space-y-1.5">
                        {statusData.map((item, i) => (
                          <div key={item.name} className="flex items-center gap-1.5 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-gray-500 flex-1 capitalize">{item.name.toLowerCase()}</span>
                            <span className="font-semibold text-gray-800">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Tickets per department bar chart */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-4 text-sm flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-primary-600" />
                      By Department
                    </h3>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={deptData} margin={{ left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="tickets" radius={[3, 3, 0, 0]}>
                          {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Recent Submissions sidebar — 5 most recent tickets with a link
                  to the full tickets tab */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary-600" />
                    Recent Submissions
                  </h3>
                  <button
                    onClick={() => loadTabData('tickets')}
                    className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                  >
                    View all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                {recentTickets.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No tickets yet</p>
                ) : (
                  <div className="space-y-3">
                    {recentTickets.map(ticket => (
                      <div key={ticket.id} className="p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-gray-400">{ticket.ticketNumber}</span>
                          <StatusBadge status={ticket.status} />
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">{ticket.title}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            {/* Department colour dot */}
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.department?.color }} />
                            {ticket.department?.name}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TICKETS TAB ──────────────────────────────────────────────────────
            Searchable, filterable table of all system tickets. The search
            input and status dropdown filter `filteredTickets` client-side.
        ────────────────────────────────────────────────────────────────────── */}
        {tab === 'tickets' && (
          <div className="card animate-fadeIn">
            {/* Sub-tab switcher: Active / Archived */}
            <div className="flex items-center gap-4 mb-5 border-b border-gray-100 pb-3">
              <button
                onClick={() => setTicketSubTab('active')}
                className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                  ticketSubTab === 'active' ? 'text-primary-600 border-primary-600' : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                Active Tickets
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{tickets.length}</span>
              </button>
              <button
                onClick={() => setTicketSubTab('archived')}
                className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                  ticketSubTab === 'archived' ? 'text-amber-600 border-amber-600' : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                Archived
                {archivedTickets.length > 0 && (
                  <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{archivedTickets.length}</span>
                )}
              </button>
            </div>

            {/* ── Active tickets sub-tab ──────────────────────────── */}
            {ticketSubTab === 'active' && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                  <h3 className="font-semibold text-gray-900 flex-1">All Tickets</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search ticket, title, resident..."
                      value={ticketSearch}
                      onChange={e => setTicketSearch(e.target.value)}
                      className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
                    />
                  </div>
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      value={ticketStatusFilter}
                      onChange={e => setTicketStatusFilter(e.target.value)}
                      className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none bg-white"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{filteredTickets.length} result{filteredTickets.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Ticket #', 'Title', 'Resident', 'Barangay', 'Department', 'Assigned To', 'Status', 'Priority', 'Date', 'Actions'].map(h => (
                          <th key={h} className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTickets.map(ticket => (
                        <tr key={ticket.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-3 font-mono text-xs text-gray-600">{ticket.ticketNumber}</td>
                          <td className="py-3 px-3 font-medium text-gray-900 max-w-[180px] truncate">{ticket.title}</td>
                          <td className="py-3 px-3 text-gray-600">{ticket.user?.name}</td>
                          <td className="py-3 px-3 text-gray-500 text-xs">{ticket.user?.barangay}</td>
                          <td className="py-3 px-3">
                            <span className="flex items-center gap-1.5 text-xs">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ticket.department?.color }} />
                              {ticket.department?.name}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-gray-500 text-xs">
                            {ticket.servant?.name ? (
                              ticket.servant.name
                            ) : (
                              <button
                                onClick={() => openAssignModal(ticket)}
                                className="flex items-center gap-1 text-primary-600 hover:text-primary-700 text-xs font-medium"
                                title="Assign servant"
                              >
                                <UserCheck className="w-3 h-3" />
                                Assign
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3"><StatusBadge status={ticket.status} /></td>
                          <td className="py-3 px-3"><PriorityBadge priority={ticket.priority} /></td>
                          <td className="py-3 px-3 text-gray-400 text-xs">{format(new Date(ticket.createdAt), 'MMM d, yyyy')}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setChangeDeptTicket(ticket); setChangeDeptId(ticket.departmentId || ''); }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                title="Change department"
                              >
                                <Building2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleArchiveTicket(ticket)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                title="Archive"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingTicket(ticket)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredTickets.length === 0 && (
                    <p className="text-center text-gray-400 py-10 text-sm">No tickets match your filters</p>
                  )}
                </div>
              </>
            )}

            {/* ── Archived tickets sub-tab ────────────────────────── */}
            {ticketSubTab === 'archived' && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                  <h3 className="font-semibold text-gray-900 flex-1">Archived Tickets</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search archived tickets..."
                      value={archivedSearch}
                      onChange={e => setArchivedSearch(e.target.value)}
                      className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
                    />
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {archivedTickets.filter(t => {
                      if (!archivedSearch) return true;
                      const q = archivedSearch.toLowerCase();
                      return t.ticketNumber?.toLowerCase().includes(q) || t.title?.toLowerCase().includes(q) || t.user?.name?.toLowerCase().includes(q);
                    }).length} archived
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Ticket #', 'Title', 'Resident', 'Department', 'Priority', 'Archived Date', 'Actions'].map(h => (
                          <th key={h} className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {archivedTickets
                        .filter(t => {
                          if (!archivedSearch) return true;
                          const q = archivedSearch.toLowerCase();
                          return t.ticketNumber?.toLowerCase().includes(q) || t.title?.toLowerCase().includes(q) || t.user?.name?.toLowerCase().includes(q);
                        })
                        .map(ticket => (
                        <tr key={ticket.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-3 font-mono text-xs text-gray-600">{ticket.ticketNumber}</td>
                          <td className="py-3 px-3 font-medium text-gray-900 max-w-[200px] truncate">{ticket.title}</td>
                          <td className="py-3 px-3 text-gray-600">{ticket.user?.name}</td>
                          <td className="py-3 px-3">
                            <span className="flex items-center gap-1.5 text-xs">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ticket.department?.color }} />
                              {ticket.department?.name}
                            </span>
                          </td>
                          <td className="py-3 px-3"><PriorityBadge priority={ticket.priority} /></td>
                          <td className="py-3 px-3 text-gray-400 text-xs">{format(new Date(ticket.updatedAt || ticket.createdAt), 'MMM d, yyyy')}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setReactivatingTicket(ticket); setReactivatePassword(''); }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                                title="Reactivate"
                              >
                                Reactivate
                              </button>
                              <button
                                onClick={() => setDeletingTicket(ticket)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {archivedTickets.length === 0 && (
                    <p className="text-center text-gray-400 py-10 text-sm">No archived tickets</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SERVANTS TAB ─────────────────────────────────────────────────────
            Card grid of all registered public servants. Each card shows:
            - Avatar / initials, name, position, department colour dot
            - Real-time presence derived from lastActiveAt timestamp
            - Workload bar (active ticket count vs. notional max of 10)
            - Edit and Remove action buttons
            The list auto-refreshes every 30 s via the polling effect above.
        ────────────────────────────────────────────────────────────────────── */}
        {tab === 'servants' && (
          <div className="card animate-fadeIn">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-gray-900">Public Servants</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {servants.length} registered &nbsp;·&nbsp;
                  {/* Count servants active within the last 2 minutes as "online" */}
                  <span className="text-green-600 font-medium">
                    {servants.filter(s => s.lastActiveAt && (Date.now() - new Date(s.lastActiveAt).getTime()) < 120000).length} online now
                  </span>
                  &nbsp;· auto-refreshes every 2 min
                </p>
              </div>
              {/* Opens the add-servant modal */}
              <button onClick={() => setServantModal('add')} className="btn-primary text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Add Servant
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {servants.map(servant => {
                /**
                 * workloadPct maps the servant's active ticket count (workload)
                 * to a 0–100% bar width, capped at 100.
                 * Colour thresholds: green < 50%, yellow 50–79%, red >= 80%.
                 */
                const workloadPct = Math.min(100, (servant.workload || 0) * 10);
                const workloadColor = workloadPct >= 80 ? 'bg-red-500' : workloadPct >= 50 ? 'bg-yellow-500' : 'bg-green-500';

                /**
                 * Derive real-time presence label and dot colour from the
                 * difference between now and the servant's last heartbeat.
                 *   < 2 min  → "Online now" (green, pulsing)
                 *   < 10 min → "Active X min ago" (yellow)
                 *   otherwise → "Last seen X ago" (gray) or "Never logged in"
                 */
                const diffMin = servant.lastActiveAt
                  ? (Date.now() - new Date(servant.lastActiveAt).getTime()) / 60000
                  : Infinity;
                const presence = diffMin < 2
                  ? { label: 'Online now', dot: 'bg-green-500 animate-pulse' }
                  : diffMin < 10
                  ? { label: `Active ${Math.floor(diffMin)}m ago`, dot: 'bg-yellow-400' }
                  : servant.lastActiveAt
                  ? { label: `Last seen ${formatDistanceToNow(new Date(servant.lastActiveAt), { addSuffix: true })}`, dot: 'bg-gray-300' }
                  : { label: 'Never logged in', dot: 'bg-gray-200' };

                return (
                  <div key={servant.id} className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                      {/* Avatar with presence dot overlay */}
                      <div className="relative flex-shrink-0">
                        {servant.avatarUrl ? (
                          <img
                            src={servant.avatarUrl}
                            alt={servant.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          /* Fallback initials circle coloured by the department */
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                            style={{ backgroundColor: servant.department?.color || '#3B82F6' }}
                          >
                            {servant.name.charAt(0)}
                          </div>
                        )}
                        {/* Presence indicator dot — absolute positioned at bottom-right */}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${presence.dot}`} title={presence.label} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{servant.name}</p>
                        <p className="text-xs text-gray-500 truncate">{servant.position}</p>
                      </div>
                      {/* Availability status pill (AVAILABLE / BUSY / OFFLINE) */}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        servant.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                        servant.status === 'BUSY' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {servant.status.charAt(0) + servant.status.slice(1).toLowerCase()}
                      </span>
                    </div>

                    {/* Department with colour dot */}
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: servant.department?.color }} />
                      {servant.department?.name}
                    </div>

                    {/* Human-readable presence line */}
                    <div className="flex items-center gap-1.5 text-xs mb-3">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${presence.dot}`} />
                      <span className={diffMin < 2 ? 'text-green-600 font-medium' : diffMin < 10 ? 'text-yellow-600' : 'text-gray-400'}>
                        {presence.label}
                      </span>
                    </div>

                    {/* Workload progress bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Workload</span>
                        <span className="text-xs font-medium text-gray-700">{servant.workload || 0} tickets</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${workloadColor}`}
                          style={{ width: `${workloadPct}%` }}
                        />
                      </div>
                    </div>

                    <p className="text-xs text-gray-400 truncate mb-2">{servant.email}</p>

                    {/* Star rating */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map(s => (
                          <Star
                            key={s}
                            className={`w-3 h-3 ${servant.avgRating && s <= Math.round(servant.avgRating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-500">
                        {servant.avgRating ? `${servant.avgRating} (${servant.totalRatings})` : 'No ratings'}
                      </span>
                    </div>

                    {/* Edit and Remove action buttons */}
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => setServantModal(servant)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingServant(servant)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
              {servants.length === 0 && (
                <p className="col-span-3 text-center text-gray-400 py-10 text-sm">No servants registered yet</p>
              )}
            </div>
          </div>
        )}

        {/* ── CITIZENS TAB ────────────────────────────────────────────────────
            Grid of registered citizen cards with search, edit, archive, and
            delete actions.
        ────────────────────────────────────────────────────────────────────── */}
        {tab === 'citizens' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                <Users className="w-5 h-5 text-primary-600" />
                Registered Citizens
                <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full font-medium">
                  {citizens.length}
                </span>
                {citizens.filter(c => c.idStatus === 'PENDING_REVIEW').length > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium animate-pulse">
                    {citizens.filter(c => c.idStatus === 'PENDING_REVIEW').length} ID pending review
                  </span>
                )}
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search citizens..."
                  className="input-field pl-9 w-full sm:w-64"
                  value={citizenSearch}
                  onChange={e => setCitizenSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {citizens
                .filter(c => {
                  if (!citizenSearch) return true;
                  const q = citizenSearch.toLowerCase();
                  return c.name?.toLowerCase().includes(q) ||
                    c.email?.toLowerCase().includes(q) ||
                    c.phone?.toLowerCase().includes(q) ||
                    c.barangay?.toLowerCase().includes(q);
                })
                .map(citizen => (
                  <div key={citizen.id} className={`card border ${citizen.isVerified ? 'border-gray-100' : 'border-red-200 bg-red-50/30'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                          {citizen.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{citizen.name}</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              citizen.isVerified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {citizen.isVerified ? 'Verified' : 'Archived'}
                            </span>
                            {citizen.idStatus === 'PENDING_REVIEW' && (
                              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 animate-pulse">
                                ID Pending Review
                              </span>
                            )}
                            {citizen.idStatus === 'VERIFIED' && citizen.idPhotoUrl && (
                              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                ID Verified
                              </span>
                            )}
                            {citizen.idStatus === 'REJECTED' && (
                              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                ID Rejected
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-gray-500 mb-4">
                      {citizen.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-gray-400" />
                          <span className="truncate">{citizen.email}</span>
                        </div>
                      )}
                      {citizen.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <span>{citizen.phone}</span>
                        </div>
                      )}
                      {citizen.barangay && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          <span>Brgy. {citizen.barangay}</span>
                        </div>
                      )}
                      {citizen._count?.tickets > 0 && (
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                          <span>{citizen._count.tickets} ticket(s)</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                      {/* View ID button — shown when citizen has an ID photo */}
                      {citizen.idPhotoUrl && (
                        <button
                          onClick={() => setIdReviewCitizen(citizen)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors ${
                            citizen.idStatus === 'PENDING_REVIEW'
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 ring-1 ring-amber-300'
                              : 'text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" /> {citizen.idStatus === 'PENDING_REVIEW' ? 'Review ID' : 'View ID'}
                        </button>
                      )}
                      <button
                        onClick={() => setCitizenModal(citizen)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 active:bg-primary-200 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleArchiveCitizen(citizen)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors ${
                          citizen.isVerified
                            ? 'text-amber-600 bg-amber-50 hover:bg-amber-100 active:bg-amber-200'
                            : 'text-green-600 bg-green-50 hover:bg-green-100 active:bg-green-200'
                        }`}
                      >
                        <Archive className="w-3.5 h-3.5" /> {citizen.isVerified ? 'Archive' : 'Restore'}
                      </button>
                      <button
                        onClick={() => setDeletingCitizen(citizen)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              {citizens.length === 0 && (
                <p className="col-span-3 text-center text-gray-400 py-10 text-sm">No citizens registered yet</p>
              )}
            </div>
          </div>
        )}

        {/* ── DEPARTMENTS TAB ───────────────────────────────────────────────────
            Card grid of all departments with servant/ticket counts, edit action,
            and add button.
        ────────────────────────────────────────────────────────────────────── */}
        {tab === 'departments' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary-600" />
                Departments
                <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full font-medium">
                  {departments.length}
                </span>
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search departments..."
                    className="input-field pl-9 w-full sm:w-64"
                    value={deptSearch}
                    onChange={e => setDeptSearch(e.target.value)}
                  />
                </div>
                <button onClick={() => setDeptModal('add')} className="btn-primary text-sm flex items-center gap-2 whitespace-nowrap">
                  <Building2 className="w-4 h-4" />
                  Add Department
                </button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {departments
                .filter(d => {
                  if (!deptSearch) return true;
                  const q = deptSearch.toLowerCase();
                  return d.name?.toLowerCase().includes(q) ||
                    d.code?.toLowerCase().includes(q) ||
                    d.head?.toLowerCase().includes(q);
                })
                .map(dept => (
                  <div key={dept.id} className={`card border ${dept.isActive !== false ? 'border-gray-100' : 'border-red-200 bg-red-50/30'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                          style={{ backgroundColor: dept.color || '#3B82F6' }}
                        >
                          {dept.code?.charAt(0) || 'D'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{dept.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{dept.code}</p>
                        </div>
                      </div>
                      {dept.isActive === false && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">Inactive</span>
                      )}
                    </div>

                    {dept.description && (
                      <p className="text-xs text-gray-500 mb-3 line-clamp-2">{dept.description}</p>
                    )}

                    <div className="space-y-1.5 text-xs text-gray-500 mb-3">
                      {dept.head && (
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
                          <span>{dept.head}</span>
                        </div>
                      )}
                      {dept.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-gray-400" />
                          <span className="truncate">{dept.email}</span>
                        </div>
                      )}
                      {dept.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <span>{dept.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs mb-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-primary-500" />
                        <span className="font-medium text-gray-700">{dept._count?.servants ?? 0}</span>
                        <span className="text-gray-400">servants</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-primary-500" />
                        <span className="font-medium text-gray-700">{dept._count?.tickets ?? 0}</span>
                        <span className="text-gray-400">tickets</span>
                      </div>
                    </div>

                    {Array.isArray(dept.keywords) && dept.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {dept.keywords.slice(0, 5).map(kw => (
                          <span key={kw} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{kw}</span>
                        ))}
                        {dept.keywords.length > 5 && (
                          <span className="text-xs text-gray-400">+{dept.keywords.length - 5} more</span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => setDeptModal(dept)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 active:bg-primary-200 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    </div>
                  </div>
                ))}
              {departments.length === 0 && (
                <p className="col-span-3 text-center text-gray-400 py-10 text-sm">No departments found</p>
              )}
            </div>
          </div>
        )}

        {/* ── SLA BREACHES TAB ─────────────────────────────────────────────────
            List of tickets that have passed their SLA deadline without being
            resolved. Each entry shows the deadline timestamp and a relative
            "overdue by X" label.
        ────────────────────────────────────────────────────────────────────── */}
        {tab === 'sla' && (
          <div className="card animate-fadeIn">
            <div className="flex items-center gap-2 mb-5">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="font-semibold text-gray-900">SLA Breach Tickets</h3>
              <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {slaBreaches.length} breached
              </span>
            </div>
            {slaBreaches.length === 0 ? (
              /* All-clear state — shown when no tickets have breached their SLA */
              <div className="text-center py-12 text-gray-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
                <p className="font-medium text-green-600">No SLA breaches — all tickets are within SLA.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {slaBreaches.map(ticket => (
                  <div key={ticket.id} className="flex items-start gap-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-gray-600">{ticket.ticketNumber}</span>
                        <StatusBadge status={ticket.status} />
                        <PriorityBadge priority={ticket.priority} />
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{ticket.title}</p>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                        <span>🏛️ {ticket.department?.name}</span>
                        {ticket.servant && <span>👤 {ticket.servant.name}</span>}
                        <span>👥 {ticket.user?.name}</span>
                      </div>
                    </div>
                    {/* SLA deadline, relative time, and assign button */}
                    <div className="text-right flex-shrink-0 space-y-1.5">
                      <p className="text-xs text-red-700 font-semibold">SLA Deadline</p>
                      <p className="text-xs text-red-600">{format(new Date(ticket.slaDeadline), 'MMM d, h:mm a')}</p>
                      <p className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(ticket.slaDeadline), { addSuffix: true })}
                      </p>
                      {!ticket.servant && (
                        <button
                          onClick={() => openAssignModal(ticket)}
                          className="flex items-center gap-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 px-2 py-1 rounded-lg transition-colors ml-auto"
                        >
                          <UserCheck className="w-3 h-3" />
                          Assign
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────
          Both modals are rendered at the root of the component tree so they
          overlay the full page via fixed positioning.
      ──────────────────────────────────────────────────────────────────────── */}

      {/* Change department modal */}
      {changeDeptTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-fadeIn">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" /> Change Department
              </h2>
              <button onClick={() => setChangeDeptTicket(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500">
                Ticket <span className="font-mono font-semibold">{changeDeptTicket.ticketNumber}</span> — {changeDeptTicket.title}
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Department</label>
                <select
                  className="input-field"
                  value={changeDeptId}
                  onChange={e => setChangeDeptId(e.target.value)}
                >
                  <option value="">Select department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Changing the department will unassign the current servant and reset the ticket to Pending.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setChangeDeptTicket(null)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={handleChangeDept}
                  disabled={!changeDeptId || changeDeptLoading}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {changeDeptLoading ? 'Updating...' : 'Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign servant modal */}
      {assigningTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-fadeIn">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary-600" /> Assign Servant
              </h2>
              <button onClick={() => setAssigningTicket(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500">
                Ticket <span className="font-mono font-semibold">{assigningTicket.ticketNumber}</span> — {assigningTicket.title}
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Servant</label>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {servants
                    .filter(s => !assigningTicket.departmentId || s.departmentId === assigningTicket.departmentId || s.status === 'AVAILABLE')
                    .map(s => (
                      <button
                        key={s.id}
                        onClick={() => setAssignServantId(s.id)}
                        className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          assignServantId === s.id
                            ? 'border-primary-400 bg-primary-50'
                            : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: s.department?.color || '#3B82F6' }}>
                          {s.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                          <p className="text-xs text-gray-400 truncate">{s.department?.name} · {s.workload || 0} active tickets</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                          s.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                          s.status === 'BUSY' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                        }`}>{s.status.charAt(0) + s.status.slice(1).toLowerCase()}</span>
                      </button>
                    ))}
                  {servants.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No servants available</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAssigningTicket(null)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={handleAssignServant}
                  disabled={!assignServantId || assignLoading}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {assignLoading ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / edit servant modal — shown when servantModal is not null */}
      {servantModal && (
        <ServantModal
          servant={servantModal === 'add' ? null : servantModal}
          departments={departments}
          onClose={() => setServantModal(null)}
          onSaved={() => loadTabData('servants')}
        />
      )}

      {/* Delete confirmation modal — shown when a servant has been staged for removal */}
      {deletingServant && (
        <DeleteConfirmModal
          servant={deletingServant}
          loading={deleteLoading}
          onClose={() => setDeletingServant(null)}
          onConfirm={handleDeleteServant}
        />
      )}

      {/* Edit citizen modal */}
      {citizenModal && (
        <CitizenModal
          citizen={citizenModal}
          onClose={() => setCitizenModal(null)}
          onSaved={() => { setCitizenModal(null); fetchTabData('citizens'); }}
        />
      )}

      {/* Delete citizen confirmation modal */}
      {deletingCitizen && (
        <CitizenDeleteModal
          citizen={deletingCitizen}
          loading={citizenDeleteLoading}
          onClose={() => setDeletingCitizen(null)}
          onConfirm={handleDeleteCitizen}
        />
      )}

      {/* Add / edit department modal */}
      {deptModal && (
        <DepartmentModal
          department={deptModal === 'add' ? null : deptModal}
          onClose={() => setDeptModal(null)}
          onSaved={() => { setDeptModal(null); fetchTabData('departments'); }}
        />
      )}

      {/* ID Review modal — view ID photo + approve/reject */}
      {idReviewCitizen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIdReviewCitizen(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fadeIn" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary-600" />
                  ID Review — {idReviewCitizen.name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Status: <span className={`font-semibold ${
                    idReviewCitizen.idStatus === 'VERIFIED' ? 'text-green-600' :
                    idReviewCitizen.idStatus === 'PENDING_REVIEW' ? 'text-amber-600' :
                    idReviewCitizen.idStatus === 'REJECTED' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {idReviewCitizen.idStatus === 'PENDING_REVIEW' ? 'Pending Review' :
                     idReviewCitizen.idStatus === 'VERIFIED' ? 'Verified' :
                     idReviewCitizen.idStatus === 'REJECTED' ? 'Rejected' : 'None'}
                  </span>
                </p>
              </div>
              <button onClick={() => setIdReviewCitizen(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* ID Photo */}
            <div className="px-6 py-4">
              <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                <img
                  src={`${api.defaults.baseURL?.replace('/api', '') || ''}${idReviewCitizen.idPhotoUrl}`}
                  alt={`ID of ${idReviewCitizen.name}`}
                  className="w-full max-h-[400px] object-contain"
                />
              </div>

              {/* Citizen info summary */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div><span className="font-medium text-gray-900">Name:</span> {idReviewCitizen.name}</div>
                <div><span className="font-medium text-gray-900">Barangay:</span> {idReviewCitizen.barangay}</div>
                {idReviewCitizen.email && <div><span className="font-medium text-gray-900">Email:</span> {idReviewCitizen.email}</div>}
                {idReviewCitizen.phone && <div><span className="font-medium text-gray-900">Phone:</span> {idReviewCitizen.phone}</div>}
                <div><span className="font-medium text-gray-900">Registered:</span> {format(new Date(idReviewCitizen.createdAt), 'MMM d, yyyy')}</div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              {idReviewCitizen.idStatus !== 'VERIFIED' && (
                <button
                  onClick={() => handleIdReview(idReviewCitizen.id, 'approve')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 active:bg-green-200 rounded-xl transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> Approve ID
                </button>
              )}
              {idReviewCitizen.idStatus !== 'REJECTED' && (
                <button
                  onClick={() => handleIdReview(idReviewCitizen.id, 'reject')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 active:bg-red-200 rounded-xl transition-colors"
                >
                  <ShieldOff className="w-4 h-4" /> Reject ID
                </button>
              )}
              <button
                onClick={() => setIdReviewCitizen(null)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate ticket — requires admin password */}
      {reactivatingTicket && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reactivate Ticket</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter your admin password to reactivate ticket <span className="font-mono font-bold">#{reactivatingTicket.ticketNumber}</span>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
              <input
                type="password"
                className="input-field w-full"
                placeholder="Enter your password"
                value={reactivatePassword}
                onChange={e => setReactivatePassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReactivateTicket()}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setReactivatingTicket(null); setReactivatePassword(''); }} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleReactivateTicket}
                disabled={!reactivatePassword || reactivateLoading}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {reactivateLoading ? 'Verifying...' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ticket confirmation modal */}
      {deletingTicket && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Ticket</h3>
            <p className="text-sm text-gray-600 mb-1">
              Are you sure you want to permanently delete ticket <span className="font-mono font-bold">#{deletingTicket.ticketNumber}</span>?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium">{deletingTicket.title}</span>
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-700">This will permanently delete the ticket, all messages, attachments, and notifications. This action cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeletingTicket(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleDeleteTicket} className="btn-danger flex-1">Delete</button>
            </div>
          </div>
        </div>
      )}

    </SidebarLayout>
  );
}
