export const PRIVACY_VERSION = "2.0";
export const PRIVACY_LAST_UPDATED = "21 April 2026";
export const PRIVACY_EFFECTIVE_DATE = "21 April 2026";

export type LegalContent =
  | { type: "paragraph"; text: string }
  | { type: "subsection"; number: string; heading: string; content: LegalContent[] }
  | { type: "list"; items: string[] }
  | { type: "address"; lines: string[] };

export type LegalSection = {
  id: string;
  number: string;
  heading: string;
  content: LegalContent[];
};

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "introduction",
    number: "1",
    heading: "INTRODUCTION",
    content: [
      { type: "paragraph", text: `This Privacy Policy describes how Daniel Mark Seaton (ABN 41 859 964 692) trading as InsiderPulse ("InsiderPulse," "we," "us," "our") collects, holds, uses, discloses, and protects your personal information when you access or use the platform located at insiderpulse.org (the "Platform").` },
      { type: "paragraph", text: "We are the data controller for the purposes of the European Union General Data Protection Regulation (GDPR) where applicable, and the APP entity for the purposes of the Privacy Act 1988 (Cth)." },
      { type: "paragraph", text: "InsiderPulse operates from Queensland, Australia but serves users globally. This policy is written to comply with the Australian Privacy Principles (APPs) as our primary framework, and to provide additional protections required by the GDPR (for EEA, UK, and Swiss users), the California Consumer Privacy Act and California Privacy Rights Act (for Californian users), and similar state laws in Virginia, Colorado, Connecticut, and Utah." },
      { type: "paragraph", text: "By creating an account, ticking the privacy checkbox at signup, or otherwise using the Platform, you acknowledge that you have read and understood this Privacy Policy." },
      { type: "paragraph", text: "Mailing address for privacy complaints and legal notices:" },
      { type: "address", lines: ["Daniel Mark Seaton trading as InsiderPulse", "Parcel Locker 10237 20930", "491 Zillmere Road", "Zillmere QLD 4034", "Australia"] },
      { type: "paragraph", text: "Email: support@insiderpulse.org" },
    ],
  },
  {
    id: "information-we-collect",
    number: "2",
    heading: "INFORMATION WE COLLECT",
    content: [
      {
        type: "subsection",
        number: "2.1",
        heading: "Account information",
        content: [
          {
            type: "list",
            items: [
              "Email address",
              "Password, stored as a salted bcrypt hash. We cannot access your plain-text password at any time.",
              "Display name (if you provide one)",
              "Account creation timestamp",
              "Subscription tier and billing status",
              "Timezone preference",
              "Marketing and notification preferences",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "2.2",
        heading: "Authentication and session information",
        content: [
          {
            type: "list",
            items: [
              "IP address at each login",
              "User agent string (browser and operating system)",
              "Session tokens (managed by Supabase Auth)",
              "Login history and timestamps",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "2.3",
        heading: "Payment information",
        content: [
          {
            type: "list",
            items: [
              "Subscription status and billing dates",
              "Stripe Customer ID (an opaque reference, not your card)",
              "Payment method type and the last four digits of your card only",
              "Billing country (for tax compliance)",
            ],
          },
          { type: "paragraph", text: "We do not store your full credit card number, CVC, or expiration date. All payment card data is collected and processed directly by Stripe, Inc. in its PCI DSS Level 1 compliant environment. InsiderPulse never sees your full payment details." },
        ],
      },
      {
        type: "subsection",
        number: "2.4",
        heading: "Platform usage data",
        content: [
          {
            type: "list",
            items: [
              "Watchlist selections (tickers you follow)",
              "Active Signals you interact with",
              "AI Assistant query history (your messages and our responses)",
              "Asset Radar filter and search history",
              "Alert configurations and trigger history",
              "Feature usage patterns and timestamps",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "2.5",
        heading: "Connected broker information (optional)",
        content: [
          { type: "paragraph", text: "If you choose to connect a third-party brokerage account through Settings, we collect and store:" },
          {
            type: "list",
            items: [
              "The name of the brokerage (Alpaca, Binance, Coinbase, Interactive Brokers, Kraken)",
              "Your brokerage API key and API secret, encrypted using AES-256 encryption at rest before storage",
              "Metadata about the connection (connection timestamp, last verification timestamp)",
              "Trade orders you submit through the Platform (ticker, quantity, direction, timestamp)",
            ],
          },
          { type: "paragraph", text: "Your brokerage credentials are stored encrypted. They are decrypted only at the moment of a trade execution request you initiate and are never displayed back to you in plain text. We do not transmit them to any third party other than the brokerage itself for the purpose of executing your trade instructions." },
        ],
      },
      {
        type: "subsection",
        number: "2.6",
        heading: "Technical and device information",
        content: [
          {
            type: "list",
            items: [
              "IP address",
              "Browser type and version",
              "Operating system and device type",
              "Approximate geolocation derived from IP address (country or region level only)",
              "Referring URL (how you arrived at the Platform)",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "2.7",
        heading: "Email engagement data",
        content: [
          {
            type: "list",
            items: [
              "Open rates, click-through rates, and unsubscribe actions from marketing emails",
              "Collected via Brevo email tracking pixels embedded in marketing emails only. Transactional emails (receipts, security alerts, account changes) do not include tracking pixels.",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "2.8",
        heading: "Cookies",
        content: [
          {
            type: "list",
            items: [
              "Session cookies (essential for authentication and security)",
              "Preference cookies (to remember your display settings)",
            ],
          },
          { type: "paragraph", text: "We do not currently use analytics cookies, third-party advertising cookies, or cross-site tracking cookies. See Section 11 for full details." },
        ],
      },
      {
        type: "subsection",
        number: "2.9",
        heading: "Information we do NOT collect",
        content: [
          {
            type: "list",
            items: [
              "Sensitive information as defined under APP 3 (health, racial or ethnic origin, political opinions, religious beliefs, sexual orientation, biometric data, criminal record) is not intentionally collected. Do not include such information in AI Assistant queries, support emails, or any other submission to the Platform. If you inadvertently submit sensitive information, contact support@insiderpulse.org to request deletion.",
              "We do not purchase personal information from data brokers or third parties.",
              "We do not currently use session replay, heatmap tracking, behavioural fingerprinting, or cross-device tracking technologies.",
              "We do not sell your personal information to any third party. See Section 5.",
              "We do not use your data to train any artificial intelligence model.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "how-we-collect",
    number: "3",
    heading: "HOW WE COLLECT INFORMATION",
    content: [
      { type: "paragraph", text: "We collect information:" },
      { type: "paragraph", text: "Directly from you: when you create an account, configure your watchlist, submit queries to the AI Assistant, update your profile, subscribe to a plan, connect a broker, or contact support." },
      { type: "paragraph", text: "Automatically: through server logs, cookies, and session management as you interact with the Platform." },
      { type: "paragraph", text: "From third parties: we receive payment status and subscription details from Stripe, email engagement metrics from Brevo, and (if you connect a broker) order confirmations and account metadata from your brokerage." },
      { type: "paragraph", text: "We do not purchase personal information from data brokers." },
    ],
  },
  {
    id: "why-we-collect",
    number: "4",
    heading: "WHY WE COLLECT AND USE YOUR INFORMATION",
    content: [
      { type: "paragraph", text: "Under APP 3 and GDPR Article 6, we collect personal information for the following purposes, each supported by a lawful basis:" },
      { type: "paragraph", text: "Provide the Platform and its features: performance of contract (GDPR Art 6(1)(b)); necessary to deliver the services you signed up for." },
      { type: "paragraph", text: "Process payments and manage subscriptions: performance of contract; required to process fees." },
      { type: "paragraph", text: "Generate AI-powered market analysis, scoring, and signals: performance of contract; core function of the Platform." },
      { type: "paragraph", text: "Send transactional emails (receipts, account changes, security alerts, deletion confirmations): legal obligation and performance of contract." },
      { type: "paragraph", text: "Send marketing and product update emails: consent (GDPR Art 6(1)(a)); inferred consent under Spam Act 2003 as a current customer, with express opt-in during signup and an unsubscribe link in every marketing email." },
      { type: "paragraph", text: "Maintain Platform security, detect fraud, prevent abuse: legitimate interests (GDPR Art 6(1)(f)); includes monitoring for unauthorised access, rate-limit violations, and scraping." },
      { type: "paragraph", text: "Execute trades you initiate through connected brokers: performance of contract and explicit instruction; only when you issue a trade command." },
      { type: "paragraph", text: "Improve the Platform through de-identified analytics: legitimate interests; uses aggregated usage patterns, not individual profiles." },
      { type: "paragraph", text: "Comply with legal obligations: tax records, dispute resolution, regulatory requests, anti-money-laundering screening where applicable." },
      { type: "paragraph", text: "We will not use your personal information for purposes materially different from those described above without notifying you and obtaining your consent where required." },
    ],
  },
  {
    id: "third-party-service-providers",
    number: "5",
    heading: "THIRD-PARTY SERVICE PROVIDERS",
    content: [
      { type: "paragraph", text: "We share personal information with the following providers to operate the Platform. Each listed recipient is bound by contractual obligations requiring them to handle your information consistently with the Australian Privacy Principles. Where required by GDPR Article 46, we rely on Standard Contractual Clauses or equivalent safeguards for transfers outside the EEA." },
      { type: "paragraph", text: "We do not sell or share your personal information for cross-context behavioural advertising or any commercial purpose beyond the operational purposes listed below." },
      {
        type: "subsection",
        number: "5.1",
        heading: "Infrastructure and hosting",
        content: [
          { type: "paragraph", text: "Supabase, Inc.: database, authentication, file storage, edge functions. Stores: email, hashed password, account data, watchlists, AI query history, encrypted broker credentials, usage data, session tokens. Data stored in AWS Sydney (Australia). SOC 2 Type II certified." },
          { type: "paragraph", text: "Lovable Labs Inc.: application hosting and AI Gateway. Stores: IP addresses, browser type, page access timestamps, application logs. The Lovable AI Gateway routes AI Assistant queries from the Platform to underlying AI providers (see Section 5.2). Chat content passes through the Gateway during routing. Data stored in United States and Sweden." },
          { type: "paragraph", text: "Railway Corp.: application logs including IP addresses and request metadata. Data stored in United States." },
          { type: "paragraph", text: `Cloudflare, Inc.: domain name system (DNS), email routing for support@insiderpulse.org, and content delivery for public assets. Cloudflare sees request IP addresses and requested URLs for public pages served via its network but does not receive authenticated session data or form submissions. Data stored globally across Cloudflare's network.` },
        ],
      },
      {
        type: "subsection",
        number: "5.2",
        heading: "Payments",
        content: [
          { type: "paragraph", text: `Stripe, Inc.: processes all payment card transactions. Receives: your email address (to create or locate your customer profile), plan selection, billing country, and payment card details you enter directly on Stripe's hosted checkout page. Stripe is PCI DSS Level 1 compliant. Data stored in United States. We retrieve your subscription status from Stripe on demand; Stripe does not push webhook notifications to us.` },
        ],
      },
      {
        type: "subsection",
        number: "5.3",
        heading: "AI services",
        content: [
          { type: "paragraph", text: "Lovable AI Gateway: routes your AI Assistant chat messages to upstream AI providers. The Gateway receives the full content of your messages, your watchlist context (tickers), and any conversation history needed for response continuity. The Gateway does not retain messages beyond operational routing and does not use them to train any model." },
          { type: "paragraph", text: `Google LLC (Gemini API): generates responses to AI Assistant queries. Receives the query content and context passed from the Lovable Gateway. Under Google's paid API terms, prompts are retained for 55 days for safety monitoring purposes only and are not used to train any Google model. We take reasonable steps to strip directly identifying information (name, email) before transmission, but we cannot guarantee that query content is free of incidental personal information you may include. Data stored in United States.` },
          { type: "paragraph", text: "ElevenLabs, Inc.: converts text to speech if you use the audio features of the AI Assistant. Receives only the text you explicitly request be voiced (maximum 5,000 characters) with no user identifier. Data stored in United States." },
          { type: "paragraph", text: "Tavily Research, Inc.: provides real-time web search results for the AI Assistant. Receives only the sanitised search query. Data stored in United States." },
          { type: "paragraph", text: "Firecrawl, Inc.: retrieves publicly available web pages for AI Assistant research and market data ingestion. Receives only URL or search query strings. No user personally identifiable information. Data stored in United States." },
        ],
      },
      {
        type: "subsection",
        number: "5.4",
        heading: "Email",
        content: [
          { type: "paragraph", text: "Brevo (Sendinblue SAS): delivers transactional and marketing emails. Receives your email address, email content we send, and email engagement metrics for marketing emails only. Data stored in European Union." },
        ],
      },
      {
        type: "subsection",
        number: "5.5",
        heading: "Market data providers",
        content: [
          { type: "paragraph", text: "TwelveData, Inc.: stock, ETF, and forex price data. Receives ticker symbols and query parameters only. No user PII. Data stored in Singapore." },
          { type: "paragraph", text: "Finnhub: financial news and market data. Receives API key only. No user PII." },
          { type: "paragraph", text: "OpenFIGI (Bloomberg L.P.): security identifier mapping. Receives CUSIP or ISIN identifiers only. No user PII." },
          { type: "paragraph", text: "CoinGecko, Blockchain.com, Etherscan: public cryptocurrency on-chain data. Public endpoints. No user PII transmitted." },
        ],
      },
      {
        type: "subsection",
        number: "5.6",
        heading: "Brokerage integrations (only if you connect a broker)",
        content: [
          { type: "paragraph", text: "If you connect a brokerage account, your brokerage API credentials and trade orders are transmitted to the brokerage you selected. We send only what is required to execute your trade instructions." },
          {
            type: "list",
            items: [
              "Alpaca Securities LLC: United States",
              "Binance Holdings Ltd.: Cayman Islands, global operations",
              "Coinbase Global, Inc.: United States",
              "Interactive Brokers LLC: United States",
              "Kraken (Payward, Inc.): United States",
            ],
          },
          { type: "paragraph", text: `Each brokerage has its own Privacy Policy and terms. By connecting a brokerage, you authorise us to transmit data between that brokerage and the Platform for the purposes you select. The brokerage's handling of your information is governed by the brokerage's own privacy policy, which we recommend you review before connecting.` },
        ],
      },
      {
        type: "subsection",
        number: "5.7",
        heading: "Legal and professional advisors",
        content: [
          { type: "paragraph", text: "We may disclose your information to our legal advisors, accountants, auditors, or regulators where required by law or necessary to establish, exercise, or defend legal claims." },
        ],
      },
      {
        type: "subsection",
        number: "5.8",
        heading: "Business transfers",
        content: [
          { type: "paragraph", text: "If we are involved in a merger, acquisition, sale of assets, or insolvency, your information may be transferred to the acquiring entity or administrator. We will notify you of any such transfer and your rights in respect of it." },
        ],
      },
      {
        type: "subsection",
        number: "5.9",
        heading: "Data Processing Agreements",
        content: [
          { type: "paragraph", text: "Each overseas recipient listed above processes personal information under a Data Processing Agreement (or equivalent) containing confidentiality, security, and cross-border transfer obligations. Where Standard Contractual Clauses are required under GDPR Article 46, they have been executed." },
        ],
      },
    ],
  },
  {
    id: "cross-border-disclosure",
    number: "6",
    heading: "CROSS-BORDER DATA DISCLOSURE",
    content: [
      { type: "paragraph", text: `We disclose personal information to overseas recipients in the United States, European Union, Singapore, Sweden, Cayman Islands, and globally (via Cloudflare's network). We take reasonable steps under APP 8.1 to ensure each overseas recipient handles your information consistently with the Australian Privacy Principles.` },
      { type: "paragraph", text: "Under section 16C of the Privacy Act 1988, we remain accountable for any act or practice by an overseas recipient that would, if done by us, breach the APPs." },
      { type: "paragraph", text: "For GDPR users, transfers outside the EEA are made either:" },
      { type: "paragraph", text: "(a) to jurisdictions with an adequacy decision from the European Commission," },
      { type: "paragraph", text: "(b) under Standard Contractual Clauses (SCCs) as adopted by the European Commission in 2021, or" },
      { type: "paragraph", text: "(c) with your explicit consent where no other basis applies." },
    ],
  },
  {
    id: "automated-decision-making",
    number: "7",
    heading: "AUTOMATED DECISION-MAKING AND AI",
    content: [
      {
        type: "subsection",
        number: "7.1",
        heading: "What we do",
        content: [
          { type: "paragraph", text: "The Platform uses artificial intelligence and algorithmic scoring to generate market analysis, asset scores, signal summaries, and conversational responses based on your queries and publicly available market data." },
        ],
      },
      {
        type: "subsection",
        number: "7.2",
        heading: "What we don't do",
        content: [
          { type: "paragraph", text: "We do not use automated decision-making that produces legal effects on you or similarly significant effects, as defined under GDPR Article 22. We do not make credit decisions, employment decisions, insurance decisions, or eligibility determinations based on automated processing." },
        ],
      },
      {
        type: "subsection",
        number: "7.3",
        heading: "AI output reliability",
        content: [
          { type: "paragraph", text: "All AI-generated outputs are automated informational data points. They may contain errors, biases, hallucinations, or inaccuracies. They are not financial advice, recommendations, or statements of opinion intended to influence any investment decision. You should not rely on AI outputs as the sole basis for any decision. See our Terms of Service Section 4 for the full financial disclaimer." },
        ],
      },
      {
        type: "subsection",
        number: "7.4",
        heading: "Training data",
        content: [
          { type: "paragraph", text: "We do not use your personal information, chat history, or any identifiable data to train any AI model. Our AI provider (Google Gemini) also does not use your API content to train their models under our paid API terms." },
        ],
      },
    ],
  },
  {
    id: "data-security",
    number: "8",
    heading: "DATA SECURITY",
    content: [
      { type: "paragraph", text: "We protect your personal information using:" },
      {
        type: "list",
        items: [
          "Encryption of data at rest (AES-256) and in transit (TLS 1.2 or higher)",
          "Bcrypt password hashing with salt",
          "Encrypted storage of broker API keys (AES-256)",
          "Role-based access controls within our team",
          "Row-level security (RLS) policies on all user-data tables",
          "Regular security reviews and dependency updates",
          "SOC 2 certified infrastructure providers (Supabase, Stripe)",
          "Multi-factor authentication for administrative access",
          "Audit logging of account deletions, broker key rotations, and administrative actions",
        ],
      },
      { type: "paragraph", text: "No method of electronic transmission or storage is 100% secure. While we use commercially reasonable security measures, we cannot guarantee absolute security." },
    ],
  },
  {
    id: "data-retention",
    number: "9",
    heading: "DATA RETENTION",
    content: [
      { type: "paragraph", text: "We retain personal information only for as long as needed to fulfil the purposes described in this policy or as required by law." },
      { type: "paragraph", text: "Active accounts: personal information is retained while your account is active." },
      { type: "paragraph", text: "Account deletion: upon a user-initiated deletion request through Settings or by emailing support@insiderpulse.org, we destroy or irreversibly de-identify your personal data within 30 days. This includes profile, preferences, watchlist, alerts, AI query history, and encrypted broker keys." },
      { type: "paragraph", text: "Deletion audit log: we retain a non-identifying audit log of each deletion (hashed email, plan at deletion, timestamp, IP address, user agent) for 7 years for fraud prevention, regulatory compliance, and legal defence. This log contains no plain-text email or name." },
      { type: "paragraph", text: "Billing and transaction records: retained for 7 years as required by the Income Tax Assessment Act 1936 (Cth) and Corporations Act 2001 (Cth)." },
      { type: "paragraph", text: "Application server logs: 90 days, then deleted." },
      { type: "paragraph", text: "Email marketing data: retained for the duration of your marketing consent, then deleted within 30 days of unsubscribe." },
      { type: "paragraph", text: "Subscription cancellation records: retained for 7 years to support chargeback and dispute defence." },
      { type: "paragraph", text: "When information is no longer needed for any lawful purpose, we destroy or de-identify it securely." },
    ],
  },
  {
    id: "your-rights",
    number: "10",
    heading: "YOUR RIGHTS",
    content: [
      {
        type: "subsection",
        number: "10.1",
        heading: "Australian users (APPs 12, 13)",
        content: [
          { type: "paragraph", text: "You may request:" },
          {
            type: "list",
            items: [
              "Access to the personal information we hold about you",
              "Correction of inaccurate information",
              "Deletion of your account and personal data",
              "A copy of your data in a portable format",
            ],
          },
          { type: "paragraph", text: "We respond within 30 days at no charge, other than reasonable costs in complex cases (which we will disclose in advance)." },
        ],
      },
      {
        type: "subsection",
        number: "10.2",
        heading: "EEA, UK, and Swiss users (GDPR)",
        content: [
          { type: "paragraph", text: "You additionally have:" },
          {
            type: "list",
            items: [
              "The right to restrict processing (Art 18)",
              "The right to object to processing based on legitimate interests (Art 21)",
              "The right to data portability (Art 20)",
              "The right to lodge a complaint with a supervisory authority",
              "The right to withdraw consent at any time without affecting the lawfulness of prior processing",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "10.3",
        heading: "Californian users (CCPA / CPRA)",
        content: [
          { type: "paragraph", text: "You have:" },
          {
            type: "list",
            items: [
              "The right to know what personal information we collect and why",
              "The right to delete personal information",
              "The right to correct inaccurate personal information",
              "The right to opt out of the sale or sharing of personal information for cross-context behavioural advertising",
              "The right to limit use and disclosure of sensitive personal information",
              "The right to non-discrimination for exercising these rights",
            ],
          },
          { type: "paragraph", text: "We do not sell or share your personal information as defined by the CCPA. We do not use sensitive personal information for purposes beyond what is required to provide the Platform." },
        ],
      },
      {
        type: "subsection",
        number: "10.4",
        heading: "Virginia, Colorado, Connecticut, Utah users",
        content: [
          { type: "paragraph", text: "You have rights substantially similar to those described for Californian users under applicable state law." },
        ],
      },
      {
        type: "subsection",
        number: "10.5",
        heading: "How to exercise your rights",
        content: [
          { type: "paragraph", text: `Email support@insiderpulse.org from the email address associated with your account. We respond within 30 days. You may also use the in-app Data Export feature (Settings → Delete Account → Download my data) to obtain a complete copy of your data at any time without contacting us.` },
        ],
      },
      {
        type: "subsection",
        number: "10.6",
        heading: "Anonymity and pseudonymity (APP 2)",
        content: [
          { type: "paragraph", text: "We do not offer anonymous or pseudonymous access to paid tiers of the Platform, because an identifiable email and payment method are required to process subscriptions, handle billing disputes, and meet our tax and anti-fraud obligations. If you have concerns about this, you may use a dedicated email and a privacy-preserving payment method such as a virtual card." },
        ],
      },
    ],
  },
  {
    id: "cookies",
    number: "11",
    heading: "COOKIES",
    content: [
      {
        type: "subsection",
        number: "11.1",
        heading: "Cookies we use",
        content: [
          { type: "paragraph", text: "Strictly necessary cookies: session management, authentication, and security. Cannot be disabled without breaking core Platform functionality." },
          { type: "paragraph", text: "Preference cookies: remembers your display preferences and theme settings. Can be disabled via your browser." },
        ],
      },
      {
        type: "subsection",
        number: "11.2",
        heading: "Cookies we do not use",
        content: [
          { type: "paragraph", text: "We do not currently use:" },
          {
            type: "list",
            items: [
              "Third-party analytics cookies (no Google Analytics, no Mixpanel, no PostHog, no equivalent)",
              "Advertising or retargeting cookies",
              "Cross-site tracking pixels",
              "Session replay or heatmap tools",
              "Behavioural fingerprinting",
            ],
          },
          { type: "paragraph", text: "If we introduce any of the above in future, we will update this policy at least 14 days before any change takes effect and obtain consent where legally required." },
        ],
      },
      {
        type: "subsection",
        number: "11.3",
        heading: "Third-party service cookies",
        content: [
          { type: "paragraph", text: `Stripe may place cookies during payment processing for fraud detection purposes as described in Stripe's own privacy policy. Brevo embeds tracking pixels in marketing emails to measure engagement. These can be bypassed by disabling images in your email client or unsubscribing.` },
        ],
      },
      {
        type: "subsection",
        number: "11.4",
        heading: "Cookie consent",
        content: [
          { type: "paragraph", text: "Australian law does not require a cookie consent banner for strictly necessary or preference cookies. EEA and UK users who require granular cookie consent are not affected today because we do not set non-essential cookies. If we add analytics or advertising cookies in future, we will implement a GDPR-compliant consent mechanism for EEA and UK visitors." },
          { type: "paragraph", text: "You can manage cookie preferences through your browser settings at any time." },
        ],
      },
    ],
  },
  {
    id: "data-breach-notification",
    number: "12",
    heading: "DATA BREACH NOTIFICATION",
    content: [
      { type: "paragraph", text: "Under the Notifiable Data Breaches scheme (Privacy Act 1988 Part IIIC), if we experience an eligible data breach likely to cause serious harm to affected individuals, we will:" },
      {
        type: "list",
        items: [
          "Assess the breach within 30 days of becoming aware",
          "Notify the Office of the Australian Information Commissioner (OAIC)",
          "Notify affected individuals with a description of the breach, the kinds of information involved, steps we have taken in response, and recommended actions you should take",
        ],
      },
      { type: "paragraph", text: "For GDPR users, we will notify the relevant supervisory authority within 72 hours of becoming aware of a breach where required under GDPR Article 33, and notify affected individuals where the breach is likely to result in a high risk to their rights and freedoms under Article 34." },
    ],
  },
  {
    id: "childrens-privacy",
    number: "13",
    heading: "CHILDREN'S PRIVACY",
    content: [
      { type: "paragraph", text: "The Platform is not intended for users under 18 years of age. We do not knowingly collect personal information from anyone under 18." },
      { type: "paragraph", text: "For US users subject to the Children's Online Privacy Protection Act (COPPA), if we become aware that a user under 13 has registered, we will delete the account and any collected data within 72 hours of becoming aware." },
      { type: "paragraph", text: "If you believe a minor has provided us with personal information, contact support@insiderpulse.org and we will take steps to delete that information promptly." },
    ],
  },
  {
    id: "marketing-consent",
    number: "14",
    heading: "MARKETING CONSENT AND UNSUBSCRIBE",
    content: [
      {
        type: "subsection",
        number: "14.1",
        heading: "How we obtain consent",
        content: [
          { type: "paragraph", text: "When you create an account, we treat your signup as express consent to receive marketing and product-update emails, subject to your ability to opt out at any time. Spam Act 2003 (Cth) recognises inferred consent for existing customers for related product categories; we nevertheless treat signup as express consent to apply the same standard globally." },
        ],
      },
      {
        type: "subsection",
        number: "14.2",
        heading: "Transactional emails continue after unsubscribe",
        content: [
          { type: "paragraph", text: "Transactional emails (receipts, security alerts, subscription changes, data export notifications, account deletion confirmations) are not commercial messages under the Spam Act 2003 and will continue to be sent after you unsubscribe from marketing. You cannot opt out of transactional emails while your account is active." },
        ],
      },
      {
        type: "subsection",
        number: "14.3",
        heading: "How to unsubscribe",
        content: [
          {
            type: "list",
            items: [
              "Click the unsubscribe link in any marketing email",
              `Email support@insiderpulse.org with the subject line "Unsubscribe"`,
              "Adjust your preferences in Settings → Notifications",
            ],
          },
          { type: "paragraph", text: "We process unsubscribe requests within 5 business days as required by the Spam Act 2003." },
        ],
      },
    ],
  },
  {
    id: "complaints",
    number: "15",
    heading: "COMPLAINTS",
    content: [
      { type: "paragraph", text: `To lodge a complaint about our handling of your personal information, email support@insiderpulse.org with the subject line "Privacy Complaint" and a description of your concern. We acknowledge within 7 days and respond substantively within 30 days.` },
      { type: "paragraph", text: "If you are not satisfied with our response, you may contact:" },
      { type: "address", lines: ["Office of the Australian Information Commissioner", "Website: www.oaic.gov.au", "Phone: 1300 363 992"] },
      { type: "paragraph", text: "For EEA users, you may lodge a complaint with the supervisory authority in your country of residence." },
      { type: "paragraph", text: `For UK users: Information Commissioner's Office (www.ico.org.uk).` },
      { type: "paragraph", text: "For Californian users: California Privacy Protection Agency (cppa.ca.gov)." },
    ],
  },
  {
    id: "changes-to-policy",
    number: "16",
    heading: "CHANGES TO THIS POLICY",
    content: [
      { type: "paragraph", text: "We may update this Privacy Policy from time to time. We will notify you of material changes by email or prominent notice on the Platform at least 14 days before changes take effect." },
      { type: "paragraph", text: "Continued use of the Platform after the effective date constitutes acceptance of the revised policy. If you do not accept the revised policy, you may cancel your subscription and delete your account before the effective date without penalty." },
      { type: "paragraph", text: "Each published version of this policy is numbered and dated at the top of this document. Prior versions are available on request." },
    ],
  },
  {
    id: "contact",
    number: "17",
    heading: "CONTACT",
    content: [
      { type: "paragraph", text: "Privacy inquiries and rights requests:" },
      { type: "paragraph", text: "support@insiderpulse.org" },
      { type: "paragraph", text: "Mail:" },
      { type: "address", lines: ["Daniel Mark Seaton trading as InsiderPulse", "Parcel Locker 10237 20930", "491 Zillmere Road", "Zillmere QLD 4034", "Australia"] },
    ],
  },
];
