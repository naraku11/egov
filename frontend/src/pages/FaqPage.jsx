import { useState } from 'react';
import { ChevronDown, HelpCircle, FileText, Phone, Mail, MapPin, Clock, Shield, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import SidebarLayout from '../components/SidebarLayout.jsx';
import Navbar from '../components/Navbar.jsx';

const FAQ_SECTIONS = [
  {
    title: 'Getting Started',
    icon: HelpCircle,
    color: 'text-blue-600 bg-blue-50',
    items: [
      {
        q: 'How do I register for an account?',
        a: 'Click "Register" on the login page. Fill in your name, email or phone number, barangay, and password. You must also upload a valid government-issued ID for verification. After submitting, you will receive an OTP (one-time password) via SMS or email to verify your identity.',
      },
      {
        q: 'What types of ID are accepted for verification?',
        a: 'Any valid government-issued ID is accepted, including: National ID, PhilSys ID, Driver\'s License, Passport, Voter\'s ID, SSS/GSIS/PhilHealth ID, Postal ID, Barangay Certificate with photo, or Senior Citizen / PWD ID.',
      },
      {
        q: 'I did not receive my OTP. What should I do?',
        a: 'If you registered with a phone number, the system will try to send an SMS first. If SMS fails (due to network issues), it automatically falls back to email. You can also click "Send to email instead" to manually request an email OTP. Check your spam/junk folder if using email.',
      },
      {
        q: 'Can I use the portal in my local language?',
        a: 'Yes! The portal supports three languages: English, Filipino (Tagalog), and Cebuano (Bisaya). Use the language selector in the sidebar to switch at any time.',
      },
    ],
  },
  {
    title: 'Submitting Concerns',
    icon: FileText,
    color: 'text-green-600 bg-green-50',
    items: [
      {
        q: 'How do I submit a concern or complaint?',
        a: 'Go to "Submit Concern" from the sidebar or dashboard. Describe your concern in detail — you can type in English, Filipino, or Cebuano, or use voice input on mobile. The AI system will automatically classify your concern and route it to the appropriate government department.',
      },
      {
        q: 'Can I attach photos or documents to my concern?',
        a: 'Yes, you can upload up to 5 files (photos, PDFs, documents, or videos) when submitting a concern. Each file can be up to 10MB. You can also send file attachments in chat messages with the assigned servant.',
      },
      {
        q: 'How is my concern routed to the right department?',
        a: 'Our AI-powered classification system analyzes your concern text and automatically determines which government department can best handle it. You can review the suggested department before submitting and change it if needed.',
      },
      {
        q: 'What are the different ticket statuses?',
        a: 'Pending — your concern has been submitted and is awaiting assignment. Assigned — a public servant has been assigned to handle it. In Progress — the servant is actively working on your concern. Resolved — the concern has been addressed. Escalated — the concern has been elevated to a higher authority for resolution.',
      },
    ],
  },
  {
    title: 'Tracking & Communication',
    icon: MessageSquare,
    color: 'text-purple-600 bg-purple-50',
    items: [
      {
        q: 'How do I track my submitted concern?',
        a: 'Go to "My Concerns" from the sidebar. You\'ll see all your submitted tickets with their current status. Click on any ticket to view its full details, status timeline, and chat with the assigned servant.',
      },
      {
        q: 'Can I communicate directly with the assigned servant?',
        a: 'Yes! Each ticket has a built-in chat feature. Once a servant is assigned, you can send messages and file attachments directly to them. You\'ll receive real-time notifications when they respond.',
      },
      {
        q: 'How will I know when there are updates?',
        a: 'You will receive in-app notifications (with sound alerts) for status changes, new messages, and important updates. Notifications appear in the sidebar and as popup alerts.',
      },
    ],
  },
  {
    title: 'SLA & Resolution Times',
    icon: Clock,
    color: 'text-amber-600 bg-amber-50',
    items: [
      {
        q: 'How long will it take to resolve my concern?',
        a: 'Resolution times depend on the priority level: Urgent concerns (emergencies, public safety) — 4 hours. Normal concerns (standard requests) — 48 hours. Low priority (minor inquiries) — 5 days. These are Service Level Agreement (SLA) targets that the government aims to meet.',
      },
      {
        q: 'What happens if my concern is not resolved on time?',
        a: 'If the SLA deadline passes without resolution, the ticket is flagged as an SLA breach. The admin team monitors all breaches and takes action to expedite resolution.',
      },
      {
        q: 'Can I rate the service I received?',
        a: 'Yes! Once your concern is marked as Resolved, you can submit a star rating (1-5) and an optional comment about the service quality. Your feedback helps improve government services.',
      },
    ],
  },
  {
    title: 'Account & Privacy',
    icon: Shield,
    color: 'text-red-600 bg-red-50',
    items: [
      {
        q: 'How is my personal information protected?',
        a: 'Your data is protected with industry-standard security: encrypted passwords (bcrypt), JWT-based authentication, secure HTTPS connections, and role-based access control. Your ID photo is used solely for identity verification and is stored securely.',
      },
      {
        q: 'Can I update my profile information?',
        a: 'Yes, click your profile in the sidebar and select "Edit Profile" to update your name, contact information, barangay, or profile photo.',
      },
      {
        q: 'I forgot my password. How do I reset it?',
        a: 'On the login page, click "Forgot password?" Enter your email address or phone number, and you\'ll receive a 6-digit reset code. Enter the code along with your new password to reset it.',
      },
    ],
  },
];

const SELF_HELP = [
  {
    title: "Mayor's Office",
    desc: 'General inquiries, clearances, certificates, and documents',
    icon: '🏛️',
    contacts: ['(032) 473-XXXX', 'mayors@aloguinsan.gov.ph'],
  },
  {
    title: 'Municipal Engineering',
    desc: 'Road repairs, flood management, infrastructure concerns',
    icon: '🔧',
    contacts: ['(032) 473-XXXX'],
  },
  {
    title: 'MSWDO (Social Welfare)',
    desc: 'Social assistance, PWD/Senior ID, 4Ps, and welfare programs',
    icon: '🤝',
    contacts: ['(032) 473-XXXX'],
  },
  {
    title: 'Rural Health Unit',
    desc: 'Health services, medical assistance, immunization schedules',
    icon: '🏥',
    contacts: ['(032) 473-XXXX'],
  },
  {
    title: 'PNP Station',
    desc: 'Peace & order, incident reports, police assistance',
    icon: '👮',
    contacts: ['Emergency: 911', '(032) 473-XXXX'],
  },
  {
    title: 'MENRO (Environment)',
    desc: 'Environmental concerns, waste management, illegal logging',
    icon: '🌿',
    contacts: ['(032) 473-XXXX'],
  },
];

function AccordionItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left hover:bg-gray-50 transition-colors active:bg-gray-100">
        <span className="text-sm font-medium text-gray-900 leading-snug">{q}</span>
        <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0">
          <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  const { isAuthenticated } = useAuth();
  const [activeSection, setActiveSection] = useState(0);

  const content = (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-7 h-7 text-primary-600" />
          FAQs & Self-Help
        </h1>
        <p className="text-gray-500 text-sm mt-1">Find answers to common questions and contact information for government services.</p>
      </div>

      {/* FAQ Sections */}
      <div className="space-y-6 mb-12">
        {/* Section navigation — horizontal scroll on mobile, vertical sidebar on desktop */}
        <div className="lg:hidden overflow-x-auto -mx-4 px-4 pb-1">
          <div className="flex gap-2 min-w-max">
            {FAQ_SECTIONS.map((sec, i) => {
              const Icon = sec.icon;
              return (
                <button key={i} onClick={() => setActiveSection(i)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
                    activeSection === i ? 'bg-primary-50 text-primary-700 shadow-sm' : 'bg-white text-gray-600 border border-gray-200'
                  }`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${sec.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  {sec.title}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Desktop sidebar navigation */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="card p-2 space-y-1 sticky top-20">
              {FAQ_SECTIONS.map((sec, i) => {
                const Icon = sec.icon;
                return (
                  <button key={i} onClick={() => setActiveSection(i)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                      activeSection === i ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${sec.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    {sec.title}
                  </button>
                );
              })}
            </div>
          </div>

        {/* FAQ content */}
        <div className="lg:col-span-3">
          <div className="card">
            <div className="flex items-center gap-3 mb-5">
              {(() => { const Icon = FAQ_SECTIONS[activeSection].icon; return (
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${FAQ_SECTIONS[activeSection].color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              ); })()}
              <h2 className="text-lg font-bold text-gray-900">{FAQ_SECTIONS[activeSection].title}</h2>
            </div>
            <div className="space-y-2">
              {FAQ_SECTIONS[activeSection].items.map((item, i) => (
                <AccordionItem key={i} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Self-Help: Department Contacts */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Self-Help: Department Directory</h2>
        <p className="text-sm text-gray-500 mb-5">Contact government departments directly for urgent or specific needs.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SELF_HELP.map((dept, i) => (
            <div key={i} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">{dept.icon}</span>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{dept.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{dept.desc}</p>
                </div>
              </div>
              <div className="space-y-1.5 pl-9">
                {dept.contacts.map((c, j) => (
                  <div key={j} className="flex items-center gap-2 text-xs text-gray-600">
                    <Phone className="w-3 h-3 text-gray-400" />
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Still need help? */}
      <div className="card bg-primary-50 border-primary-100">
        <div className="text-center py-4">
          <h3 className="font-bold text-primary-900 mb-1">Still need help?</h3>
          <p className="text-sm text-primary-700 mb-4">Submit a concern through the portal and our team will assist you.</p>
          <a href="/submit" className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/25">
            <FileText className="w-4 h-4" />
            Submit a Concern
          </a>
        </div>
      </div>
    </div>
  );

  return isAuthenticated ? <SidebarLayout>{content}</SidebarLayout> : <><Navbar />{content}</>;
}
