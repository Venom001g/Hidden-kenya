/**
 * Policy drafts. They describe how the software actually behaves, but they are NOT legal
 * advice and must be reviewed by a Kenyan advocate before launch. Bracketed values such as
 * [LEGAL ENTITY NAME] must be completed by the business; they are deliberately not invented.
 */

export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { title: string; updated: string; summary: string; sections: LegalSection[] };

const CONTROLLER = "[LEGAL ENTITY NAME], [REGISTERED ADDRESS], Kenya (registration number [NUMBER])";
const CONTACT = "[PRIVACY CONTACT EMAIL]";

export const LEGAL: Record<string, LegalDoc> = {
  privacy: {
    title: "Privacy policy",
    updated: "2026-10-19",
    summary: "What personal data Hidden Kenya collects, why, who receives it, how long it is kept, and your rights under Kenya's Data Protection Act, 2019.",
    sections: [
      { heading: "Who we are", body: [`The data controller is ${CONTROLLER}. Contact our data protection contact at ${CONTACT}. [Registration with the Office of the Data Protection Commissioner (ODPC): REGISTRATION NUMBER, if required.]`] },
      {
        heading: "What we collect",
        body: [
          "Account data: name, email address, password (stored only as a hash by our authentication provider), optional phone number and country.",
          "Booking data: the experience, date, group size, the lead guest's name, email and phone, notes you add for the host, and booking history.",
          "Payment data: the amount, currency, status and payment method type (for example M-Pesa or card) reported by our payment provider. We never receive or store card numbers or M-Pesa PINs.",
          "Host data: business details, contact details, verification documents, and payout recipient details tokenised by our payment provider (we store only a masked label such as the last three digits of a phone number).",
          "Reviews, saved experiences, support messages and notification preferences.",
          "Security data: to limit abuse we store keyed one-way hashes of IP addresses for short periods; we do not store raw IP addresses in our database.",
        ],
      },
      {
        heading: "Why we use it (lawful bases)",
        body: [
          "To provide bookings you request and to let hosts fulfil them (performance of a contract).",
          "To verify hosts and keep the marketplace safe, prevent fraud and enforce our terms (legitimate interests and legal obligations).",
          "To keep financial records required by Kenyan law (legal obligation).",
          "To send the newsletter, only if you opt in (consent, which you can withdraw at any time).",
        ],
      },
      {
        heading: "Who receives it",
        body: [
          "The host of a booking receives the lead guest's name, phone, email, group size and notes, so they can deliver the experience.",
          "Service providers acting for us: Supabase (database, authentication and file storage), Vercel (hosting), Paystack (payments), Resend (email) and Mapbox (maps, if enabled). [Confirm data processing agreements and hosting regions with each provider.]",
          "Authorities where the law requires it.",
          "We do not sell personal data.",
        ],
      },
      {
        heading: "International transfers",
        body: ["Some service providers process data outside Kenya. [Describe the safeguards relied on for each transfer, as required by sections 48 to 50 of the Data Protection Act, 2019.]"],
      },
      {
        heading: "How long we keep it",
        body: [
          "Account data: while your account is open. When you delete your account we delete your profile, saved experiences, reviews and support tickets.",
          "Booking and payment records: kept for 7 years for tax and accounting purposes, with the guest's contact details replaced by a placeholder once the account is deleted. [Confirm the retention period with your accountant.]",
          "Host verification documents: kept while the host account is active and for 24 months after it closes, then deleted.",
          "Email logs: 18 months. Security hashes: up to 24 hours.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "Under the Data Protection Act, 2019 you can ask to access your data, correct it, delete it, object to or restrict its processing, and receive it in a portable format.",
          "You can download a copy of your data and delete your account from Account → Privacy. For other requests contact " + CONTACT + ".",
          "You can complain to the Office of the Data Protection Commissioner (odpc.go.ke).",
        ],
      },
      { heading: "Cookies", body: ["We use only cookies needed to keep you signed in and secure. See the cookies page for details."] },
    ],
  },
  terms: {
    title: "Terms of service",
    updated: "2026-10-19",
    summary: "The agreement between you and Hidden Kenya for using the website.",
    sections: [
      { heading: "About these terms", body: [`These terms are between you and ${CONTROLLER}. By creating an account or booking you agree to them.`] },
      {
        heading: "What Hidden Kenya does",
        body: [
          "Hidden Kenya is a marketplace. Experiences are provided by independent hosts, not by Hidden Kenya. The host is responsible for delivering the experience as described, and for holding any licences and insurance their activity requires.",
          "We verify hosts as described on our “What verified means” section and review listings before publication, but we do not inspect every experience in person.",
        ],
      },
      {
        heading: "Accounts",
        body: ["You must be at least 18 to create an account and book. Keep your password secure. You are responsible for activity on your account.", "We may suspend accounts that breach these terms or the community guidelines."],
      },
      {
        heading: "Bookings and payment",
        body: [
          "A booking is confirmed only after our payment provider confirms payment. Prices are set by hosts and shown in the listing currency.",
          "Cancellations and refunds follow the booking and cancellation policy and the refund policy.",
        ],
      },
      { heading: "Your content", body: ["You keep ownership of reviews and photos you submit, and give us a licence to display them on Hidden Kenya. Content must follow the community guidelines."] },
      {
        heading: "Liability",
        body: ["[Limitation of liability, consumer-protection carve-outs under the Consumer Protection Act, 2012, and governing law/dispute resolution clauses to be drafted by counsel.]"],
      },
    ],
  },
  "booking-and-cancellation": {
    title: "Booking and cancellation policy",
    updated: "2026-10-19",
    summary: "How bookings are confirmed, held, cancelled and refunded.",
    sections: [
      {
        heading: "Instant bookings",
        body: ["When you reserve an instant-booking experience, your places are held while you pay. If payment is not confirmed before the hold ends, the places are released and the reservation expires. No money is taken for an expired reservation."],
      },
      {
        heading: "Request bookings",
        body: [
          "Some hosts confirm requests personally. Your places are held while the host decides. If the host accepts, you are asked to pay within a set time to confirm. If they decline or do not answer in time, the request ends and nothing is charged.",
        ],
      },
      {
        heading: "Cancelling as a guest",
        body: [
          "Each listing has one of three cancellation policies, measured from the experience's start time (Nairobi time):",
          "Flexible: full refund if you cancel at least 24 hours before; no refund after that.",
          "Moderate: full refund at least 5 days before; 50% refund at least 24 hours before; no refund after that.",
          "Strict: full refund at least 14 days before; 50% refund at least 7 days before; no refund after that.",
          "The refund amount is shown before you confirm a cancellation. Unpaid reservations can be cancelled at any time.",
        ],
      },
      { heading: "If the host cancels", body: ["You receive a full refund of what you paid."] },
      {
        heading: "Late or duplicate payments",
        body: ["If a payment arrives after your reservation has expired and places are still available, the booking is confirmed. If no places remain, the payment is refunded in full. If you accidentally pay twice, the extra payment is refunded."],
      },
    ],
  },
  refunds: {
    title: "Refund policy",
    updated: "2026-10-19",
    summary: "How refunds are processed.",
    sections: [
      {
        heading: "How refunds are paid",
        body: [
          "Refunds go back to the original payment method through our payment provider. M-Pesa refunds usually arrive faster than card refunds; card refunds can take several working days depending on your bank.",
          "You will receive an email when the payment provider reports the refund as processed. Your booking page shows the refund status at all times.",
        ],
      },
      { heading: "Amounts", body: ["Refunds are calculated in the currency you paid. We do not charge a fee for refunds. [Confirm whether payment-provider fees are refunded and state this here.]"] },
      { heading: "Problems", body: ["If a refund is marked as failed, our team retries it or contacts you. You can also open a support request from your booking."] },
    ],
  },
  "provider-terms": {
    title: "Host terms",
    updated: "2026-10-19",
    summary: "Terms for guides, tour operators and businesses who list experiences.",
    sections: [
      {
        heading: "Eligibility and verification",
        body: [
          "To host you must complete your profile and upload the verification documents we ask for. You cannot take bookings until our team approves your profile. Each listing is reviewed before it is published, and material changes to a published listing send it back for review.",
          "You confirm that you hold any licences, permits and insurance required for your activity, including any required by the Tourism Act, 2011 and county regulations.",
        ],
      },
      {
        heading: "Listings",
        body: ["Descriptions, prices, inclusions, meeting points, accessibility information and photos must be accurate and yours to use. You set availability and capacity and must honour confirmed bookings."],
      },
      {
        heading: "Commission and payouts",
        body: [
          "Hidden Kenya charges a commission on the amount guests pay, net of refunds. The rate that applies to you is shown in your dashboard before you publish and is fixed on each booking when it is made.",
          "Earnings become available for payout after the experience date. Payouts are sent to the M-Pesa number you register, through our payment provider. [State payout frequency and any minimum amount.]",
        ],
      },
      { heading: "Cancellations by hosts", body: ["If you cancel a confirmed booking the guest receives a full refund. Repeated cancellations may lead to suspension."] },
      { heading: "Personal data", body: ["You may use guests' contact details only to deliver their booking, and must protect them as required by the Data Protection Act, 2019."] },
    ],
  },
  cookies: {
    title: "Cookies and tracking",
    updated: "2026-10-19",
    summary: "The cookies Hidden Kenya uses.",
    sections: [
      {
        heading: "Strictly necessary cookies",
        body: [
          "Authentication cookies (named sb-…-auth-token) keep you signed in. They are set only when you sign in and are required for the site to work.",
          "We do not use advertising cookies or third-party analytics trackers. [If analytics are added later, update this page and add a consent banner before enabling them.]",
        ],
      },
      { heading: "Third-party pages", body: ["Our payment provider's checkout page sets its own cookies when you pay. See Paystack's privacy policy for details."] },
    ],
  },
  "community-guidelines": {
    title: "Community guidelines",
    updated: "2026-10-19",
    summary: "Standards for hosts, guests and reviews.",
    sections: [
      {
        heading: "Reviews",
        body: [
          "Reviews must describe your own experience on a completed booking. Do not include personal information about others, hateful or harassing content, or offers of payment.",
          "Hosts may respond publicly to reviews. Anyone signed in can report a review; our team decides whether it breaks these guidelines.",
        ],
      },
      {
        heading: "Respect for communities and wildlife",
        body: ["Experiences involving communities must be run with their consent and benefit. Experiences involving wildlife must follow Kenya Wildlife Service rules and must not involve feeding, handling or harassing wild animals."],
      },
      { heading: "Safety", body: ["Report safety concerns through support, choosing the “Safety” category. In an emergency contact local emergency services first (999 or 112 in Kenya)."] },
    ],
  },
};
