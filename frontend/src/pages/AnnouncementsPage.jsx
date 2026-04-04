/**
 * AnnouncementsPage.jsx
 *
 * Public-facing page that displays official announcements from the Municipality
 * of Aloguinsan.  Citizens can read and search/filter announcements; admins
 * additionally have inline controls to create, edit, and delete entries.
 *
 * Features:
 *  - Full-text search across title and content fields
 *  - Category filter bar (All / Info / Alert / Event)
 *  - Admin-only "New Announcement" button and per-card edit/delete actions
 *  - Draft announcements are shown with a dashed border and an "EyeOff" badge
 *    so admins can distinguish unpublished entries from live ones
 *  - AnnouncementModal: shared create/edit modal rendered inline
 *  - Delete confirmation dialog with a separate loading state
 */

import { useState, useEffect } from 'react';
import { Megaphone, AlertTriangle, Calendar, Info, Search, Plus, Pencil, Trash2, X, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import SidebarLayout from '../components/SidebarLayout.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * Display metadata for each announcement category.
 * Maps category keys to a human-readable label, icon component, and
 * Tailwind colour classes used for badges and category indicators.
 */
const CATEGORY_META = {
  INFO:  { label: 'Info',    icon: Info,          color: 'bg-blue-100  text-blue-700  border-blue-200'  },
  ALERT: { label: 'Alert',   icon: AlertTriangle, color: 'bg-red-100   text-red-700   border-red-200'   },
  EVENT: { label: 'Event',   icon: Calendar,      color: 'bg-green-100 text-green-700 border-green-200' },
};

/**
 * AnnouncementModal
 *
 * Controlled modal for creating a new announcement or editing an existing one.
 * Determines create vs. edit mode by checking whether `entry` is provided.
 *
 * @param {object|null} props.entry    - Existing announcement object when editing; null for create.
 * @param {Function}    props.onClose  - Callback to close the modal without saving.
 * @param {Function}    props.onSaved  - Callback invoked after a successful save to trigger a list refresh.
 * @returns {JSX.Element} The modal overlay with form fields.
 */
function AnnouncementModal({ entry, onClose, onSaved }) {
  // Derive mode from whether an existing entry was passed
  const isEdit = !!entry;

  /**
   * Controlled form state pre-filled with the entry's current values when
   * editing, or sensible defaults when creating.
   */
  const [form, setForm] = useState({
    title:       entry?.title       || '',
    content:     entry?.content     || '',
    category:    entry?.category    || 'INFO',
    isPublished: entry?.isPublished ?? true,
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
        await api.put(`/announcements/${entry.id}`, form);
        toast.success('Announcement updated');
      } else {
        await api.post('/announcements', form);
        toast.success('Announcement created');
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
              ? <><Pencil className="w-4 h-4 text-primary-600" /> Edit Announcement</>
              : <><Plus className="w-4 h-4 text-primary-600" /> New Announcement</>
            }
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Form fields */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input className="input-field" placeholder="Announcement title" value={form.title} onChange={set('title')} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
            <textarea
              className="input-field resize-none"
              rows={5}
              placeholder="Write the announcement content..."
              value={form.content}
              onChange={set('content')}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Category select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className="input-field" value={form.category} onChange={set('category')}>
                <option value="INFO">Info</option>
                <option value="ALERT">Alert</option>
                <option value="EVENT">Event</option>
              </select>
            </div>
            {/* Visibility toggle — Published vs Draft */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Visibility</label>
              <div className="flex gap-2">
                {[
                  { value: true,  label: 'Published', color: 'border-green-300 bg-green-50 text-green-700' },
                  { value: false, label: 'Draft',     color: 'border-gray-300 bg-gray-100 text-gray-600'   },
                ].map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, isPublished: opt.value }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                      form.isPublished === opt.value ? opt.color : 'border-gray-200 text-gray-400 hover:border-gray-300'
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
              {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * AnnouncementsPage
 *
 * Lists published (and, for admins, draft) announcements with search and
 * category filtering.  Admins can create, edit, and delete entries.
 *
 * @returns {JSX.Element} The full-page announcements listing.
 */
export default function AnnouncementsPage() {
  const { isAdmin, loading: authLoading } = useAuth();

  // Full list of announcements fetched from the API
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]             = useState(true);

  // Filter/search state
  const [search, setSearch]               = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  /**
   * Modal state:
   *  - null      → no modal open
   *  - 'add'     → create modal open
   *  - object    → edit modal open with that announcement pre-filled
   */
  const [modal, setModal]                 = useState(null);

  /**
   * Announcement object targeted for deletion (drives the confirm dialog),
   * or null when no deletion is pending.
   */
  const [deleting, setDeleting]           = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /**
   * Fetches announcements from the appropriate endpoint.
   * Admins use `/announcements/all` to include unpublished drafts;
   * citizens use `/announcements` which returns only published entries.
   */
  const load = () => {
    setLoading(true);
    const endpoint = isAdmin ? '/announcements/all' : '/announcements';
    api.get(endpoint)
      .then(r => setAnnouncements(r.data || []))
      .catch(err => toast.error(err.response?.data?.error || 'Failed to load announcements'))
      .finally(() => setLoading(false));
  };

  // Load announcements once auth resolves and whenever the admin state changes
  useEffect(() => { if (!authLoading) load(); }, [isAdmin, authLoading]);

  /**
   * Deletes the announcement currently held in the `deleting` state.
   * Clears the confirmation dialog and refreshes the list on success.
   */
  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/announcements/${deleting.id}`);
      toast.success('Announcement deleted');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * Client-side filtered list — applies both the text search (title + content)
   * and the category filter to the fetched announcements.
   */
  const filtered = announcements.filter(a => {
    const matchSearch   = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.content.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'ALL' || a.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  return (
    <SidebarLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Page header with optional "New Announcement" button for admins ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-amber-500" />
              Announcements
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Official notices from the Municipality of Aloguinsan</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setModal('add')}
              className="btn-primary flex items-center justify-center gap-2 text-sm w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              New Announcement
            </button>
          )}
        </div>

        {/* ── Search bar and category filter buttons ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search announcements..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {/* Category filter buttons — ALL plus each defined category */}
          <div className="flex gap-2">
            {['ALL', 'INFO', 'ALERT', 'EVENT'].map(cat => (
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

        {/* ── Announcements list / loading spinner / empty state ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Megaphone className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No announcements found</p>
            {search && <p className="text-gray-400 text-sm mt-1">Try a different search term</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(ann => {
              // Resolve category metadata (icon, colours) for this announcement
              const meta = CATEGORY_META[ann.category] || CATEGORY_META.INFO;
              const Icon = meta.icon;
              return (
                <div
                  key={ann.id}
                  className={`bg-white rounded-2xl border p-5 shadow-sm transition-shadow ${
                    // Draft entries get a dashed border and reduced opacity
                    !ann.isPublished ? 'border-dashed border-gray-300 opacity-75' : meta.color.split(' ')[2]
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Category icon badge */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${meta.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Category pill, optional draft badge, and creation date */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                          {meta.label}
                        </span>
                        {/* Draft indicator — visible to admins only */}
                        {isAdmin && !ann.isPublished && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 flex items-center gap-1">
                            <EyeOff className="w-3 h-3" /> Draft
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {format(new Date(ann.createdAt), 'MMMM d, yyyy')}
                        </span>
                      </div>
                      <h2 className="text-base font-bold text-gray-900 mb-2">{ann.title}</h2>
                      {/* Announcement body — preserves line breaks with whitespace-pre-wrap */}
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                    </div>

                    {/* Admin-only edit and delete action buttons */}
                    {isAdmin && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => setModal(ann)}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleting(ann)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit modal ── */}
      {modal && (
        <AnnouncementModal
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
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Delete Announcement?</h2>
              <p className="text-sm text-gray-500">
                "<span className="font-semibold text-gray-800">{deleting.title}</span>" will be permanently removed.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setDeleting(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
