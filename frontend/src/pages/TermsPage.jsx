import { ArrowLeft, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <Link to="/auth?tab=register" className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Registration
        </Link>

        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Terms and Conditions</h1>
              <p className="text-sm text-gray-500">Aloguinsan E-Government Portal</p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-gray-700 space-y-5">
            <p className="text-xs text-gray-400">Last updated: March 2026</p>

            <section>
              <h3 className="text-base font-bold text-gray-900">1. Acceptance of Terms</h3>
              <p>By registering and using the Aloguinsan E-Government Assistance System ("the Portal"), you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the Portal.</p>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">2. Eligibility</h3>
              <p>The Portal is available to residents of the Municipality of Aloguinsan, Province of Cebu, Philippines. Users must be at least 18 years of age or have parental/guardian consent. A valid government-issued ID is required for identity verification during registration.</p>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">3. User Accounts</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
                <li>You must provide accurate, truthful information during registration.</li>
                <li>Accounts are non-transferable and may not be shared.</li>
                <li>The municipality reserves the right to suspend or deactivate accounts that violate these terms.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">4. Use of the Portal</h3>
              <p>The Portal is intended for submitting legitimate concerns, complaints, and service requests to municipal government departments. You agree NOT to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Submit false, misleading, or malicious reports.</li>
                <li>Upload obscene, defamatory, or illegal content.</li>
                <li>Attempt to access other users' accounts or data.</li>
                <li>Use automated systems to flood the Portal with requests.</li>
                <li>Impersonate another person or government official.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">5. Identity Verification</h3>
              <p>To ensure the integrity of the system, all citizens must submit a clear photograph of a valid government-issued ID during registration. This ID is used solely for identity verification purposes by authorized municipal administrators. Providing a fraudulent or tampered ID is a violation of these terms and may result in account termination and referral to appropriate authorities.</p>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">6. Privacy and Data Protection</h3>
              <p>Your personal information is collected, stored, and processed in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) of the Philippines. We are committed to protecting your data:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Personal data is encrypted at rest and in transit.</li>
                <li>ID photos are stored securely and accessible only to authorized administrators.</li>
                <li>Your data is used exclusively for providing government services and will not be sold or shared with third parties.</li>
                <li>You may request access to, correction of, or deletion of your personal data by contacting the municipal office.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">7. Service Level Agreements</h3>
              <p>The municipality strives to address concerns within the following timeframes: Urgent concerns — 4 hours; Normal concerns — 48 hours; Low-priority concerns — 5 days. These are targets and not guarantees. Actual resolution times may vary based on complexity and resource availability.</p>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">8. Intellectual Property</h3>
              <p>All content, design, and functionality of the Portal are the property of the Municipality of Aloguinsan. Users retain ownership of content they submit (e.g., descriptions, photos) but grant the municipality a non-exclusive license to use such content for service delivery purposes.</p>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">9. Limitation of Liability</h3>
              <p>The Portal is provided "as is." The Municipality of Aloguinsan shall not be liable for any indirect, incidental, or consequential damages arising from the use of the Portal, including but not limited to service disruptions, data loss, or delayed responses.</p>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">10. Modifications</h3>
              <p>The municipality reserves the right to modify these Terms and Conditions at any time. Continued use of the Portal after modifications constitutes acceptance of the updated terms.</p>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900">11. Contact</h3>
              <p>For questions about these terms, contact the Municipal Administrator's Office:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Email: info@aloguinsan-egov.online</li>
                <li>Phone: (032) 473-XXXX</li>
                <li>Address: Municipal Hall, Poblacion, Aloguinsan, Cebu, Philippines</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
