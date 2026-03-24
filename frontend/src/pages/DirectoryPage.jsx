/**
 * DirectoryPage.jsx
 *
 * Public-facing contact directory for the Barangay / Municipality.  Citizens
 * can look up government officials, emergency services, and office contacts.
 * Admins can add, edit, and deactivate entries inline.
 *
 * Layout:
 *  - Search bar + category filter chips (All / Officials / Emergency / Gov't Services)
 *  - Results grouped by category, each group rendered as a responsive card grid
 *  - Each card shows name, position, department, phone, email, and office hours
 *  - Inactive entries (admin view only) are shown with a dashed border and
 *    reduced opacity so they are distinguishable from active ones
 *
 * Admin features:
 *  - "Add Entry" button opens DirectoryEntryModal in create mode
 *  - Per-card pencil/trash buttons open the modal in edit mode or the delete
 *    confirmation dialog respectively
 *  - Entries can be toggled Active / Inactive without deleting them
 */

import { useState, useEffect } from 'react';
import { BookOpen, Phone, Mail, Clock, Search, Plus, Pencil, Trash2, X, ShieldCheck, Zap, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import SidebarLayout from '../components/SidebarLayout.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * Display metadata for each directory category.
 * Maps category keys to a human-readable label, icon component, and
 * Tailwind colour classes used for section headers and card elements.
 */
const CATEGORY_META = {
  OFFICIAL:  { label: 'Officials',          icon: Building2,   color: 'bg-blue-100   text-blue-700   border-blue-200'   },
  EMERGENCY: { label: 'Emergency Services', icon: Zap,         color: 'bg-red-100    text-red-700    border-red-200'    },
  SERVICE:   { label: 'Gov\'t Services',    icon: ShieldCheck, color: 'bg-green-100  text-green-700  border-green-200'  },
};

/**
 * DirectoryEntryModal
 *
 * Controlled modal for creating a new directory entry or editing an existing
 * one.  Mode is determined by whether `entry` is provided.
 *
 * @param {object|null} props.entry    - Existing entry object when editing; null for create.
 * @param {Function}    props.onClose  - Callback to close the modal without saving.
 * @param {Function}    props.onSaved  - Callback invoked after a successful save to trigger a list refresh.
 * @returns {JSX.Element} The modal overlay with the entry form.
 */
function DirectoryEntryModal({ entry, onClose, onSaved }) {
  // Derive mode from whether an existing entry was passed
  const isEdit = !!entry;

  /**
   * Controlled form state pre-filled with the entry's current values when
   * editing, or defaults when creating.
   */
  const [form, setForm] = useState({
    name:        entry?.name        || '',
    position:    entry?.position    || '',
    department:  entry?.department  || '',
    phone:       entry?.phone       || '',
    email:       entry?.email       || '',
    officeHours: entry?.officeHours || '',
    address:     entry?.address     || '',
    category:    entry?.category    || 'OFFICIAL',
    isActive:    entry?.isActive    ?? true,
  });
  const [loading, setLoading] = useState(false);

  /**
   * Submits the form — PUTs to update or POSTs to create.
   * Calls onSaved + onClose on success so the parent refreshes the list.
   *
   * @param {React.FormEvent} e - Native form submit event.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/directory/${entry.id}`, form);
        toast.success(`${form.name} updated`);
      } else {
        await api.post('/directory', form);
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
   * Returns a change handler that updates a single field in the form state.
   *
   * @param {string} field - The form state key to update.
   * @returns {Function} An onChange handler for an input/select element.
   */
  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-lg animate-fadeIn">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            {isEdit
              ? <><Pencil className="w-4 h-4 text-primary-600" /> Edit Entry</>
              : <><Plus className="w-4 h-4 text-primary-600" /> Add Directory Entry</>
            }
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Entry form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Full name — spans both columns */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input className="input-field" placeholder="Juan Dela Cruz" value={form.name} onChange={set('name')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
              <input className="input-field" placeholder="e.g. Mayor" value={form.position} onChange={set('position')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className="input-field" value={form.category} onChange={set('category')}>
                <option value="OFFICIAL">Officials</option>
                <option value="EMERGENCY">Emergency Services</option>
                <option value="SERVICE">Gov't Services</option>
              </select>
            </div>
            {/* Department/office — spans both columns */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Department / Office</label>
              <input className="input-field" placeholder="e.g. Mayor's Office" value={form.department} onChange={set('department')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" className="input-field" placeholder="09xxxxxxxxx" value={form.phone} onChange={set('phone')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="input-field" placeholder="official@aluguinsan.gov.ph" value={form.email} onChange={set('email')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Office Hours</label>
              <input className="input-field" placeholder="Mon–Fri 8am–5pm" value={form.officeHours} onChange={set('officeHours')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input className="input-field" placeholder="e.g. Municipal Hall" value={form.address} onChange={set('address')} />
            </div>
            {/* Active / Inactive toggle — spans both columns */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <div className="flex gap-2">
                {[
                  { value: true,  label: 'Active',   color: 'border-green-300 bg-green-50 text-green-700' },
                  { value: false, label: 'Inactive', color: 'border-gray-300 bg-gray-100 text-gray-600'   },
                ].map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, isActive: opt.value }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                      form.isActive === opt.value ? opt.color : 'border-gray-200 text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save Changes' : 'Add Entry')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * DirectoryPage
 *
 * Lists barangay directory entries grouped by category with search and filter
 * support.  Admins can manage entries (add, edit, delete) inline.
 *
 * @returns {JSX.Element} The full-page directory listing.
 */
export default function DirectoryPage() {
  const { isAdmin } = useAuth();

  // Full list of directory entries fetched from the API
  const [entries, setEntries]               = useState([]);
  const [loading, setLoading]               = useState(true);

  // Search text and active category filter
  const [search, setSearch]                 = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  /**
   * Modal state:
   *  - null      → no modal open
   *  - 'add'     → create modal open
   *  - object    → edit modal open with that entry pre-filled
   */
  const [modal, setModal]                   = useState(null);

  /**
   * Entry object targeted for deletion (drives the confirm dialog),
   * or null when no deletion is pending.
   */
  const [deleting, setDeleting]             = useState(null);
  const [deleteLoading, setDeleteLoading]   = useState(false);

  /**
   * Fetches directory entries from the appropriate endpoint.
   * Admins use `/directory/all` to include inactive entries;
   * citizens use `/directory` which returns only active ones.
   */
  const load = () => {
    setLoading(true);
    const endpoint = isAdmin ? '/directory/all' : '/directory';
    api.get(endpoint)
      .then(r => setEntries(r.data || []))
      .catch(err => toast.error(err.response?.data?.error || 'Failed to load directory'))
      .finally(() => setLoading(false));
  };

  // Load entries on mount and whenever the admin state changes
  useEffect(() => { load(); }, [isAdmin]);

  /**
   * Deletes the entry currently held in the `deleting` state.
   * Clears the confirmation dialog and refreshes the list on success.
   */
  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/directory/${deleting.id}`);
      toast.success(`${deleting.name} removed`);
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * Client-side filtered list — applies both the text search (name, position,
   * department) and the category filter to the fetched entries.
   */
  const filtered = entries.filter(e => {
    const matchSearch   = !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.position.toLowerCase().includes(search.toLowerCase()) ||
      (e.department || '').toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'ALL' || e.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  /**
   * Groups the filtered entries by category so they can be rendered in
   * separate labelled sections.
   *
   * @type {Record<string, object[]>}
   */
  const grouped = filtered.reduce((acc, entry) => {
    const cat = entry.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(entry);
    return acc;
  }, {});

  return (
    <SidebarLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Page header with optional "Add Entry" button for admins ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary-600" />
              Barangay Directory
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Contact information for officials and government services</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setModal('add')}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Entry
            </button>
          )}
        </div>

        {/* ── Search bar and category filter buttons ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, position, department..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {/* Category filter buttons — ALL plus each defined category */}
          <div className="flex gap-2 flex-wrap">
            {['ALL', 'OFFICIAL', 'EMERGENCY', 'SERVICE'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  categoryFilter === cat
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat === 'ALL' ? 'All' : CATEGORY_META[cat].label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Directory listing / loading spinner / empty state ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No directory entries found</p>
            {search && <p className="text-gray-400 text-sm mt-1">Try a different search term</p>}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Iterate over grouped categories in insertion order */}
            {Object.entries(grouped).map(([cat, items]) => {
              const meta    = CATEGORY_META[cat] || CATEGORY_META.OFFICIAL;
              const CatIcon = meta.icon;
              return (
                <div key={cat}>
                  {/* Category section header pill */}
                  <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-xl border w-fit ${meta.color}`}>
                    <CatIcon className="w-4 h-4" />
                    <span className="text-sm font-semibold">{meta.label}</span>
                    <span className="text-xs opacity-70">({items.length})</span>
                  </div>

                  {/* Responsive card grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map(entry => (
                      <div
                        key={entry.id}
                        className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-shadow ${
                          // Inactive entries shown with dashed border and lower opacity (admin only)
                          isAdmin && !entry.isActive ? 'border-dashed border-gray-300 opacity-60' : 'border-gray-100'
                        }`}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          {/* Avatar circle using first letter of name */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border flex-shrink-0 ${meta.color}`}>
                            {entry.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{entry.name}</p>
                            <p className="text-xs text-gray-500 truncate">{entry.position}</p>
                          </div>
                          {/* Admin-only edit and delete action buttons */}
                          {isAdmin && (
                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={() => setModal(entry)}
                                className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleting(entry)}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Optional department/office label */}
                        {entry.department && (
                          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                            {entry.department}
                          </p>
                        )}

                        {/* Contact detail rows — only rendered when a value exists */}
                        <div className="space-y-1.5">
                          {entry.phone && (
                            <a href={`tel:${entry.phone}`} className="flex items-center gap-2 text-xs text-primary-600 hover:underline">
                              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                              {entry.phone}
                            </a>
                          )}
                          {entry.email && (
                            <a href={`mailto:${entry.email}`} className="flex items-center gap-2 text-xs text-primary-600 hover:underline truncate">
                              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                              {entry.email}
                            </a>
                          )}
                          {entry.officeHours && (
                            <p className="flex items-center gap-2 text-xs text-gray-500">
                              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                              {entry.officeHours}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit modal ── */}
      {modal && (
        <DirectoryEntryModal
          entry={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {/* ── Delete confirmation dialog ── */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-fadeIn">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Remove Entry?</h2>
              <p className="text-sm text-gray-500">
                "<span className="font-semibold text-gray-800">{deleting.name}</span>" will be permanently removed.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setDeleting(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {deleteLoading ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
