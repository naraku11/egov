/**
 * @file LandingPage.jsx
 * @description Public-facing entry point for the Aluguinsan E-Government Assistance System.
 *
 * This page is shown to unauthenticated visitors and serves as the primary marketing /
 * information surface for the portal. It includes:
 *  - A hero section with a language switcher (English / Filipino / Cebuano) and CTAs
 *    that send the user to registration or login.
 *  - A key-features grid highlighting AI routing, SLA tracking, multilingual support,
 *    and voice input.
 *  - A "How it Works" step-by-step visual guide.
 *  - A department routing map showing which concerns each office handles.
 *  - A call-to-action (CTA) banner and a footer with contact details.
 *
 * No authentication or data-fetching is required; content is entirely static / i18n-driven.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, Bot, MapPin, Languages, Mic, Clock, CheckCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import Navbar from '../components/Navbar.jsx';

/**
 * Static list of municipal departments and the concern categories they handle.
 * Rendered in the "Department Routing Map" section so residents know where
 * their concerns will be routed.
 *
 * @type {Array<{ name: string, icon: string, color: string, items: string[] }>}
 */
const DEPARTMENTS = [
  { name: "Mayor's Office", icon: '🏛️', color: 'bg-blue-50 text-blue-700', items: ['General inquiries', 'Official documents', 'Barangay coordination'] },
  { name: 'Engineering', icon: '🔧', color: 'bg-orange-50 text-orange-700', items: ['Road damage', 'Flood control', 'Infrastructure'] },
  { name: 'MSWDO', icon: '❤️', color: 'bg-green-50 text-green-700', items: ['Social welfare', 'PWD assistance', 'Senior benefits'] },
  { name: 'Rural Health', icon: '🏥', color: 'bg-red-50 text-red-700', items: ['Health programs', 'Medical certificates', 'Immunization'] },
  { name: 'MPDO', icon: '📋', color: 'bg-purple-50 text-purple-700', items: ['Business permits', 'Land use', 'Development plans'] },
  { name: 'MENRO', icon: '🌿', color: 'bg-emerald-50 text-emerald-700', items: ['Environmental', 'Illegal logging', 'Waste management'] },
  { name: 'PNP', icon: '🛡️', color: 'bg-indigo-50 text-indigo-700', items: ['Peace & order', 'Crime reports', 'Community safety'] },
  { name: "Treasurer's", icon: '💳', color: 'bg-amber-50 text-amber-700', items: ['Tax clearance', 'Payment inquiries', 'Business tax'] },
];

/**
 * LandingPage component.
 *
 * Fully static (no side-effects or API calls). Reads the active locale from
 * `LanguageContext` to render translated hero copy, feature titles, and button labels.
 * The `changeLanguage` helper updates the context so all translated strings
 * re-render immediately without a page reload.
 *
 * @returns {JSX.Element} The public landing page layout.
 */
export default function LandingPage() {
  // Pull the translation helper, current locale code, and the locale-switcher function
  const { t, language, changeLanguage } = useLanguage();

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── Hero Section ─────────────────────────────────────────────────────────
          Full-bleed gradient banner containing:
          - Language toggle pills (EN / Filipino / Cebuano)
          - Municipality badge, headline, sub-headline, and primary CTAs
          - Summary stats (departments, SLA, languages)
          - A decorative card on desktop illustrating the ticket lifecycle
      ──────────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        {/* Decorative blurred circles — purely visual, no interactive purpose */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              {/* Language selector — clicking a pill calls changeLanguage() which
                  updates LanguageContext and causes i18n strings to re-render */}
              <div className="flex gap-2 mb-8">
                {[
                  { code: 'en', label: 'English' },
                  { code: 'fil', label: 'Filipino' },
                  { code: 'ceb', label: 'Cebuano' },
                ].map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      language === lang.code
                        ? 'bg-white text-primary-800 shadow'
                        : 'bg-white/20 text-white/80 hover:bg-white/30'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>

              {/* Municipality location badge */}
              <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm mb-6">
                <MapPin className="w-4 h-4" />
                Municipality of Aluguinsan, Cebu
              </div>

              {/* Hero headline and sub-headline — text driven by current locale */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight mb-6">
                {t('heroTitle')}
              </h1>
              <p className="text-lg text-blue-100 mb-8 leading-relaxed">
                {t('heroSubtitle')}
              </p>

              {/* Primary CTAs: register to file a concern, or log in to track one */}
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/auth?tab=register"
                  className="flex items-center gap-2 bg-white text-primary-800 px-6 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-all shadow-lg"
                >
                  {t('reportConcern')}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/auth"
                  className="flex items-center gap-2 bg-white/10 border border-white/30 text-white px-6 py-3 rounded-xl font-semibold hover:bg-white/20 transition-all"
                >
                  {t('trackConcern')}
                </Link>
              </div>

              {/* Quick-glance stats — hard-coded figures that summarise system capabilities */}
              <div className="flex flex-wrap gap-6 mt-10">
                {[
                  { label: 'Departments', value: '8' },
                  { label: 'Response SLA', value: '24hr' },
                  { label: 'Languages', value: '3' },
                ].map(stat => (
                  <div key={stat.label}>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-blue-200 text-sm">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual demo card (desktop only) — illustrates the AI routing
                and ticket lifecycle steps to new visitors */}
            <div className="hidden lg:block">
              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6 space-y-4">
                {/* Sample ticket submission row */}
                <div className="flex items-center gap-3 bg-white/10 rounded-xl p-4">
                  <div className="w-10 h-10 bg-green-400 rounded-full flex items-center justify-center text-white font-bold">JD</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Juan Dela Cruz</p>
                    <p className="text-xs text-blue-200">Submitted: Road damage near Purok 3</p>
                  </div>
                  <span className="bg-blue-400/30 text-blue-100 text-xs px-2 py-1 rounded-full">ASSIGNED</span>
                </div>
                {/* AI routing annotation */}
                <div className="flex items-center gap-2 text-sm text-blue-200">
                  <Bot className="w-4 h-4" />
                  <span>AI routed to <strong className="text-white">Municipal Engineering</strong></span>
                </div>
                {/* Step progress list */}
                <div className="space-y-2">
                  {['Submitted', 'AI Classification', 'Assigned to Servant', 'In Progress'].map((step, i) => (
                    <div key={step} className="flex items-center gap-2">
                      <CheckCircle className={`w-4 h-4 ${i < 3 ? 'text-green-400' : 'text-blue-300'}`} />
                      <span className={`text-sm ${i < 3 ? 'text-white' : 'text-blue-200'}`}>{step}</span>
                    </div>
                  ))}
                </div>
                {/* SLA deadline callout */}
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-xs text-blue-200">SLA Deadline</p>
                  <p className="font-semibold">Within 48 hours</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ─────────────────────────────────────────────────────
          Four-column grid listing key system capabilities.
          Icon, title, and description strings are i18n-keyed via t().
      ──────────────────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">{t('featuresTitle')}</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">A comprehensive digital solution connecting residents with the right public servants.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Bot, title: t('feature1Title'), desc: t('feature1Desc'), color: 'text-blue-600 bg-blue-50' },
              { icon: Clock, title: t('feature2Title'), desc: t('feature2Desc'), color: 'text-green-600 bg-green-50' },
              { icon: Languages, title: t('feature3Title'), desc: t('feature3Desc'), color: 'text-purple-600 bg-purple-50' },
              { icon: Mic, title: t('feature4Title'), desc: t('feature4Desc'), color: 'text-orange-600 bg-orange-50' },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="card hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works Section ─────────────────────────────────────────────────
          Four numbered steps walking the resident through the full journey:
          Submit → AI Classification → Servant Assigned → Resolution.
      ──────────────────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {[
              { step: '01', icon: '📝', title: 'Submit Concern', desc: 'Describe your concern in your preferred language via text or voice.' },
              { step: '02', icon: '🤖', title: 'AI Classification', desc: 'Our AI instantly routes your concern to the right department.' },
              { step: '03', icon: '👨‍💼', title: 'Servant Assigned', desc: 'A public servant is automatically assigned based on workload.' },
              { step: '04', icon: '✅', title: 'Resolution', desc: 'Track progress in real-time and rate the service when resolved.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} className="text-center">
                <div className="relative inline-block mb-4">
                  <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center text-3xl mx-auto">
                    {icon}
                  </div>
                  {/* Numbered badge positioned at top-right of the icon */}
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-primary-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {step.slice(1)}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Department Routing Map ───────────────────────────────────────────────
          Grid of department cards built from the DEPARTMENTS constant above.
          Helps residents understand where each type of concern will be sent
          before they even submit a ticket.
      ──────────────────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Department Routing Map</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {DEPARTMENTS.map(dept => (
              <div key={dept.name} className="bg-white rounded-xl p-5 border border-gray-100 hover:shadow-md transition-shadow">
                {/* Department colour-coded label badge */}
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium mb-3 ${dept.color}`}>
                  <span>{dept.icon}</span>
                  {dept.name}
                </div>
                {/* Bullet list of concern categories handled by this department */}
                <ul className="space-y-1">
                  {dept.items.map(item => (
                    <li key={item} className="text-xs text-gray-600 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────────────
          Bottom-of-page conversion banner with register and login links.
      ──────────────────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-primary-700 text-white">
        <div className="max-w-3xl mx-auto text-center px-4">
          <h2 className="text-3xl font-bold mb-4">Ready to Report a Concern?</h2>
          <p className="text-blue-100 mb-8">Join thousands of Aluguinsan residents using the E-Gov portal for faster, more transparent public service.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/auth?tab=register" className="bg-white text-primary-800 px-8 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-all flex items-center gap-2">
              {t('getStarted')} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/auth" className="border border-white/40 text-white px-8 py-3 rounded-xl font-semibold hover:bg-white/10 transition-all">
              {t('login')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────────
          Municipality branding, system name, hotline, and email contact.
      ──────────────────────────────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-gray-400 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <p className="text-white font-semibold">Municipality of Aluguinsan</p>
              <p className="text-sm">Province of Cebu, Philippines</p>
            </div>
            <div className="text-sm text-center">
              <p>E-Government Assistance System</p>
            </div>
            <div className="text-sm text-right">
              <p>Hotline: (032) 000-0000</p>
              <p>info@aluguinsan-egov.online</p>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-gray-800 text-xs text-center">
            © 2026 Municipality of Aluguinsan. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
