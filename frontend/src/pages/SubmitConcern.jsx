/**
 * SubmitConcern.jsx
 *
 * Multi-step form page that lets a citizen submit a new concern/ticket to the
 * local government.  The wizard walks the user through three steps:
 *
 *   Step 1 – Describe the concern (title, category, description, priority).
 *             Supports optional voice-to-text input via the Web Speech API.
 *   Step 2 – Review, attach files (up to 5), attach GPS location, and inspect
 *             the AI-suggested department routing returned by the classify API.
 *             The user may override the suggested department.
 *   Step 3 – Final confirmation summary before the ticket is POSTed to the
 *             backend as a multipart/form-data request.
 *
 * On successful submission the user is redirected to the ticket detail page.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Bot, MapPin, ChevronRight, ChevronLeft, CheckCircle, Mic, MicOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import SidebarLayout from '../components/SidebarLayout.jsx';
import { concernCategories } from '../i18n/translations.js';

/** Static list of priority levels with display metadata. */
const PRIORITY_OPTIONS = [
  { value: 'LOW',    label: 'Low',    desc: 'Non-urgent, can wait',        color: 'border-gray-300 text-gray-600' },
  { value: 'NORMAL', label: 'Normal', desc: 'Standard processing',         color: 'border-blue-300 text-blue-700' },
  { value: 'URGENT', label: 'Urgent', desc: 'Immediate attention needed',  color: 'border-red-300 text-red-700'   },
];

/**
 * SubmitConcern
 *
 * Three-step wizard for submitting a citizen concern/ticket.
 * Handles AI classification, voice input, file attachments, and GPS location.
 *
 * @returns {JSX.Element} The full-page submit concern wizard.
 */
export default function SubmitConcern() {
  // i18n helpers and navigation
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  // Ref for the hidden <input type="file"> element
  const fileInputRef = useRef();

  // Current wizard step (1 | 2 | 3)
  const [step, setStep] = useState(1);

  // Loading flags: submission in progress / AI classification in progress
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);

  // Whether the microphone is actively recording speech
  const [isRecording, setIsRecording] = useState(false);

  // Reference to the active SpeechRecognition instance so it can be stopped
  const recognitionRef = useRef(null);

  /**
   * Controlled form state.
   * `files` holds File objects for attachment; coordinates are set only when
   * the user explicitly requests GPS capture.
   */
  const [form, setForm] = useState({
    title:        '',
    description:  '',
    category:     '',
    priority:     'NORMAL',
    departmentId: '',
    files:        [],
    useLocation:  false,
    latitude:     null,
    longitude:    null,
  });

  // Result returned by the AI classification endpoint
  const [classification, setClassification] = useState(null);

  // All available departments fetched from the API for the routing override dropdown
  const [departments, setDepartments] = useState([]);

  // Fetch the department list once on mount
  useEffect(() => {
    api.get('/departments').then(r => setDepartments(r.data));
  }, []);

  /**
   * Sends the combined title + description to the AI classification endpoint
   * and pre-fills the department routing with the suggested result.
   */
  const classifyConcern = async () => {
    if (!form.title && !form.description) return;
    setClassifying(true);
    try {
      const text = `${form.title} ${form.description}`.trim();
      const { data } = await api.post('/tickets/classify', { text });
      setClassification(data);
      // Pre-select the AI-suggested department; the user can still change it
      setForm(f => ({ ...f, departmentId: data.departmentId }));
    } catch (err) {
      console.error(err);
    } finally {
      setClassifying(false);
    }
  };

  /**
   * Appends newly selected files to the attachments list.
   * Enforces the maximum of 5 attachments.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} e - The file input change event.
   */
  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    if (form.files.length + newFiles.length > 5) {
      toast.error('Maximum 5 files allowed');
      return;
    }
    setForm(f => ({ ...f, files: [...f.files, ...newFiles] }));
  };

  /**
   * Removes a file from the attachments list by its index.
   *
   * @param {number} idx - Index of the file to remove.
   */
  const removeFile = (idx) => {
    setForm(f => ({ ...f, files: f.files.filter((_, i) => i !== idx) }));
  };

  /**
   * Requests the device's current GPS coordinates and stores them in form state.
   * Sets `useLocation` to true on success so the backend includes the pin.
   */
  const getLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, useLocation: true, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        toast.success('Location captured');
      },
      () => toast.error('Location access denied')
    );
  };

  /**
   * Starts a Web Speech API recognition session and appends the transcript
   * to the description field.  Falls back with an error toast if the API is
   * unsupported in the current browser.
   */
  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      return toast.error('Voice input not supported in your browser');
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    // Map app language to a BCP-47 locale for the recognition engine
    recognition.lang = language === 'ceb' ? 'fil-PH' : language === 'fil' ? 'fil-PH' : 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setForm(f => ({ ...f, description: f.description + ' ' + transcript }));
      setIsRecording(false);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend   = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  /** Manually stops the active speech recognition session. */
  const stopVoice = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  /**
   * Validates required fields for the current step before advancing.
   * On step 1, also triggers AI classification so it runs in the background
   * while the user reviews step 2.
   */
  const handleNext = () => {
    if (step === 1) {
      if (!form.title.trim())       return toast.error('Please enter a title');
      if (!form.description.trim()) return toast.error('Please describe your concern');
      if (!form.category)           return toast.error('Please select a category');
      classifyConcern();
    }
    setStep(s => s + 1);
  };

  /**
   * Assembles a FormData payload (to support file uploads) and POSTs the
   * ticket to the API.  Navigates to the new ticket detail page on success.
   */
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('title',       form.title);
      formData.append('description', form.description);
      formData.append('category',    form.category);
      formData.append('priority',    form.priority);
      if (form.departmentId) formData.append('departmentId', form.departmentId);
      if (form.latitude)     formData.append('latitude',     form.latitude);
      if (form.longitude)    formData.append('longitude',    form.longitude);
      // Each file is appended under the same field name for multi-file support
      form.files.forEach(f => formData.append('attachments', f));

      const { data } = await api.post('/tickets', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`Ticket ${data.ticketNumber} submitted!`);
      navigate(`/tickets/${data.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Convenience derived values used in the review/confirm steps
  const selectedDept = departments.find(d => d.id === form.departmentId);

  /**
   * Returns the localised label for a concern category value.
   *
   * @param {string} value - The category value key (e.g. 'ROADS').
   * @returns {string} The translated label, falling back to English then the raw value.
   */
  const getCategoryLabel = (value) => {
    const cat = concernCategories.find(c => c.value === value);
    return cat?.label?.[language] || cat?.label?.en || value;
  };

  return (
    <SidebarLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* ── Progress indicator ── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900">{t('submitConcern')}</h1>
            <span className="text-sm text-gray-500">Step {step} of 3</span>
          </div>
          {/* Coloured step bars — filled up to the current step */}
          <div className="flex gap-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-primary-600' : 'bg-gray-200'}`} />
            ))}
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>{t('step1')}</span>
            <span>{t('step2')}</span>
            <span>{t('step3')}</span>
          </div>
        </div>

        <div className="card animate-fadeIn">
          {/* ── Step 1: Describe your concern ── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Title input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('title')} *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Brief subject of your concern..."
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  maxLength={150}
                />
              </div>

              {/* Category selector — rendered as a button grid */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('category')} *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {concernCategories.map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, category: cat.value }))}
                      className={`p-3 rounded-lg border text-left text-sm transition-all active:scale-[0.98] ${
                        form.category === cat.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300 active:bg-gray-50'
                      }`}
                    >
                      {getCategoryLabel(cat.value)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description textarea with voice-input toggle */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">{t('description')} *</label>
                  {/* Voice toggle button — switches between start and stop */}
                  <button
                    type="button"
                    onClick={isRecording ? stopVoice : startVoice}
                    className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg transition-colors ${
                      isRecording ? 'bg-red-100 text-red-600 pulse-ring' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
                    }`}
                  >
                    {isRecording ? <><MicOff className="w-4 h-4" /> Stop</> : <><Mic className="w-4 h-4" /> Voice</>}
                  </button>
                </div>
                <textarea
                  className="input-field min-h-[120px] resize-none"
                  placeholder={t('concernPlaceholder')}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={5}
                />
                {/* Live character count */}
                <p className="text-xs text-gray-400 mt-1 text-right">{form.description.length} characters</p>
              </div>

              {/* Priority selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {PRIORITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, priority: opt.value }))}
                      className={`p-3 rounded-lg border-2 text-center transition-all active:scale-[0.98] ${
                        form.priority === opt.value
                          ? `border-current bg-opacity-10 ${opt.color} font-semibold`
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 active:bg-gray-50'
                      }`}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs opacity-70 hidden sm:block">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Review summary, AI routing, attachments, and location ── */}
          {step === 2 && (
            <div className="space-y-5">
              {/* AI Classification Result panel */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900">{t('aiSuggestion')}</p>
                    {/* Show spinner while classifying, result once done, or a fallback message */}
                    {classifying ? (
                      <p className="text-sm text-blue-600 animate-pulse">Analyzing your concern...</p>
                    ) : classification ? (
                      <>
                        <p className="text-sm text-blue-700">
                          {t('routedTo')}: <strong>{selectedDept?.name || classification.department?.name}</strong>
                          <span className="text-xs ml-2 text-blue-500">({Math.round((classification.confidence || 0) * 100)}% confidence)</span>
                        </p>
                        {/* Manual override — lets the citizen pick a different department */}
                        <div className="mt-2">
                          <label className="text-xs text-blue-600 font-medium mb-1 block">{t('changeRoute')}:</label>
                          <select
                            className="text-xs border border-blue-300 rounded-lg px-2 py-1 bg-white text-gray-700 w-full"
                            value={form.departmentId}
                            onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                          >
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-blue-700">Could not classify automatically. Please select department manually.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Review Summary — read-only snapshot of step 1 values */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <h3 className="font-semibold text-gray-900 mb-3">Review Your Concern</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <p className="text-gray-500 text-xs">Title</p>
                    <p className="font-medium">{form.title}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Category</p>
                    <p className="font-medium">{getCategoryLabel(form.category)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Priority</p>
                    <p className={`font-medium ${form.priority === 'URGENT' ? 'text-red-600' : form.priority === 'NORMAL' ? 'text-blue-600' : 'text-gray-600'}`}>
                      {form.priority}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Department</p>
                    <p className="font-medium">{selectedDept?.name || 'Not set'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Description</p>
                  <p className="text-gray-800 mt-0.5 line-clamp-3">{form.description}</p>
                </div>
              </div>

              {/* File Upload — click-to-open hidden file input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('uploadFiles')}</label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-4 sm:p-6 text-center hover:border-primary-400 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">{t('uploadHint')}</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, PDF, DOC, MP4 · Max 10MB each</p>
                </div>
                {/* Hidden native file input — triggered programmatically above */}
                <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,.pdf,.doc,.docx,.mp4,.mov"
                  onChange={handleFileChange} />

                {/* List of staged attachments with remove button */}
                {form.files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {form.files.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                        <span className="flex-1 truncate text-gray-700">{file.name}</span>
                        <span className="text-gray-400 text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button type="button" onClick={() => removeFile(idx)} className="text-red-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* GPS Location capture */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Attach Location</p>
                    {form.useLocation && <p className="text-xs text-green-600">Location captured ✓</p>}
                  </div>
                </div>
                <button type="button" onClick={getLocation}
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${form.useLocation ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
                  {form.useLocation ? 'Captured' : 'Use GPS'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Final confirmation before submission ── */}
          {step === 3 && (
            <div className="space-y-5 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Ready to Submit!</h2>
                <p className="text-gray-500 mt-2">Your concern will be routed to <strong>{selectedDept?.name}</strong> and processed within the SLA period.</p>
              </div>

              {/* Submission summary table */}
              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Title</span>
                  <span className="font-medium text-right max-w-[60%] truncate">{form.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Department</span>
                  <span className="font-medium">{selectedDept?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Priority</span>
                  <span className={`font-medium ${form.priority === 'URGENT' ? 'text-red-600' : ''}`}>{form.priority}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Attachments</span>
                  <span className="font-medium">{form.files.length} file(s)</span>
                </div>
                {/* Expected SLA derived from priority level */}
                <div className="flex justify-between">
                  <span className="text-gray-500">SLA</span>
                  <span className="font-medium text-blue-600">
                    {form.priority === 'URGENT' ? '4 hours' : form.priority === 'NORMAL' ? '48 hours' : '5 days'}
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-400">
                You will receive a notification when your concern is assigned and updates are made.
              </p>
            </div>
          )}

          {/* ── Navigation buttons (Back / Continue / Submit) ── */}
          <div className="flex gap-3 mt-6 pt-5 border-t border-gray-100">
            {step > 1 && (
              <button type="button" onClick={() => setStep(s => s - 1)} className="btn-secondary flex items-center gap-2 flex-1">
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step < 3 ? (
              <button type="button" onClick={handleNext} className="btn-primary flex items-center gap-2 flex-1 justify-center">
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              // Submit button — disabled while the request is in-flight
              <button type="button" onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 justify-center">
                {loading ? (
                  <span className="flex items-center gap-2 justify-center">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Submitting...
                  </span>
                ) : t('submitNow')}
              </button>
            )}
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
