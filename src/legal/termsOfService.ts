export const TOS_VERSION = "2.0";
export const TOS_LAST_UPDATED = "21 April 2026";
export const TOS_EFFECTIVE_DATE = "21 April 2026";

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

export const TOS_IMPORTANT_DISCLAIMER = "InsiderPulse is a financial publisher and market data analytics platform. All content, scores, signals, rankings, and analysis on this Platform are automated data outputs provided for general informational purposes only. Nothing on this Platform constitutes financial product advice, personal advice, general advice, a recommendation, or a statement of opinion intended to influence any decision to buy, sell, or hold any financial product. InsiderPulse does not hold an Australian Financial Services Licence. Past performance of any signal, score, or asset does not guarantee future results. You are solely responsible for your own investment decisions. Always consult a licensed financial adviser before making investment decisions.";

export const TOS_SECTIONS: LegalSection[] = [
  {
    id: "agreement-to-terms",
    number: "1",
    heading: "AGREEMENT TO TERMS",
    content: [
      { type: "paragraph", text: `These Terms of Service ("Terms") constitute a legally binding agreement between you and Daniel Mark Seaton (ABN 41 859 964 692) trading as InsiderPulse ("InsiderPulse," "we," "us," "our"), with mailing address Parcel Locker 10237 20930, 491 Zillmere Road, Zillmere QLD 4034, Australia.` },
      { type: "paragraph", text: `By creating an account, ticking the Terms of Service checkbox at signup, clicking "Create Account," or otherwise using the Platform at insiderpulse.org (the "Platform"), you:` },
      {
        type: "list",
        items: [
          "Agree to be bound by these Terms and our Privacy Policy",
          "Confirm your electronic acceptance has the same legal effect as a written signature under the Electronic Transactions Act 1999 (Cth)",
          "Represent that you have legal capacity to enter this agreement",
        ],
      },
      { type: "paragraph", text: "If you do not agree, do not use the Platform." },
    ],
  },
  {
    id: "eligibility-and-sanctions",
    number: "2",
    heading: "ELIGIBILITY AND SANCTIONS",
    content: [
      {
        type: "subsection",
        number: "2.1",
        heading: "Age",
        content: [
          { type: "paragraph", text: "You must be at least 18 years of age to use the Platform. By creating an account, you confirm you are at least 18 and have legal capacity to enter a binding agreement." },
        ],
      },
      {
        type: "subsection",
        number: "2.2",
        heading: "Sanctions and jurisdictions",
        content: [
          { type: "paragraph", text: "By using the Platform, you represent that:" },
          {
            type: "list",
            items: [
              "You are not located in, under the control of, or a national or resident of any country subject to Australian, US, UK, or EU trade sanctions, including but not limited to Iran, North Korea, Syria, Cuba, Russia, Belarus, and the Crimea, Donetsk, Luhansk, Kherson, and Zaporizhzhia regions.",
              "You are not listed on the Australian Department of Foreign Affairs and Trade (DFAT) Consolidated Sanctions List, the US Treasury OFAC Specially Designated Nationals (SDN) list, the UK HM Treasury consolidated sanctions list, or any equivalent list.",
              "You will not use the Platform in violation of any applicable export control or sanctions law.",
            ],
          },
          { type: "paragraph", text: "We reserve the right to block access from, and terminate accounts associated with, sanctioned persons or jurisdictions without notice or refund." },
        ],
      },
    ],
  },
  {
    id: "platform-description",
    number: "3",
    heading: "PLATFORM DESCRIPTION",
    content: [
      { type: "paragraph", text: "InsiderPulse is a market signal discovery and analytics tool. It aggregates publicly available market data and applies artificial intelligence and proprietary algorithms to generate algorithmic scores, signal summaries, and data-driven rankings across approximately 26,000 assets." },
      { type: "paragraph", text: `InsiderPulse operates as a financial publisher. We do not hold an Australian Financial Services Licence. Nothing on the Platform is "financial product advice" within the meaning of the Corporations Act 2001 (Cth), including personal advice (s 766B(3)) or general advice (s 766B(4)).` },
      { type: "paragraph", text: "All scores, signals, rankings, and AI Assistant outputs are automated data points. They are not recommendations, endorsements, solicitations, or advice regarding any financial product or investment." },
    ],
  },
  {
    id: "financial-disclaimer",
    number: "4",
    heading: "FINANCIAL INFORMATION DISCLAIMER",
    content: [
      {
        type: "subsection",
        number: "4.1",
        heading: "Data tool, not advice service",
        content: [
          { type: "paragraph", text: "InsiderPulse provides market data analysis tools. The Platform does not provide financial product advice. All content is general market information only and is not tailored to your personal objectives, financial situation, or needs." },
        ],
      },
      {
        type: "subsection",
        number: "4.2",
        heading: "No reliance",
        content: [
          { type: "paragraph", text: "You acknowledge that:" },
          {
            type: "list",
            items: [
              "All scores, signals, rankings, entry prices, targets, stop-losses, and AI-generated outputs are automated data points, not investment recommendations",
              "Market data may be delayed, incomplete, stale, or contain errors",
              "AI-generated outputs may contain errors, biases, hallucinations, or inaccuracies",
              "Past performance data displayed on the Platform does not indicate or guarantee future performance",
              "You must not rely solely on Platform outputs for any investment, trading, or financial decision",
              "You are solely responsible for your investment decisions and any resulting gains or losses",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "4.3",
        heading: "No accuracy warranty",
        content: [
          { type: "paragraph", text: `We make no representation or warranty as to the accuracy, completeness, timeliness, or reliability of any score, signal, ranking, price data, or AI-generated output displayed on the Platform. To the maximum extent permitted by law, the Platform is provided "as is" and "as available" without warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, or reliability of data outputs.` },
        ],
      },
      {
        type: "subsection",
        number: "4.4",
        heading: "Seek professional advice",
        content: [
          { type: "paragraph", text: "Before making any investment decision, obtain independent financial, legal, and taxation advice from a suitably qualified professional licensed in your jurisdiction. Consider whether any information is appropriate for your personal objectives, financial situation, and needs." },
        ],
      },
      {
        type: "subsection",
        number: "4.5",
        heading: "No liability for investment outcomes",
        content: [
          { type: "paragraph", text: "To the maximum extent permitted by law, InsiderPulse is not liable for any financial loss or damage arising from your use of or reliance on Platform outputs for investment decisions. This limitation does not exclude rights that cannot be excluded under the Australian Consumer Law." },
        ],
      },
      {
        type: "subsection",
        number: "4.6",
        heading: "No personal advice",
        content: [
          { type: "paragraph", text: "We will not provide personal financial advice via email, AI Assistant, support channels, or any other medium. Any response that appears to provide personal advice is an error. You must not rely on any Platform communication as personal advice." },
        ],
      },
    ],
  },
  {
    id: "australian-consumer-law",
    number: "5",
    heading: "AUSTRALIAN CONSUMER LAW",
    content: [
      { type: "paragraph", text: "Our services come with guarantees that cannot be excluded under the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth)). For major failures with the service, you are entitled to cancel and receive a refund for the unused portion." },
      { type: "paragraph", text: "Nothing in these Terms excludes, restricts, or modifies any rights or remedies implied or imposed by the Australian Consumer Law that cannot be excluded by law. Where a clause in these Terms conflicts with the ACL, the ACL prevails." },
    ],
  },
  {
    id: "subscriptions-and-payments",
    number: "6",
    heading: "SUBSCRIPTIONS AND PAYMENTS",
    content: [
      {
        type: "subsection",
        number: "6.1",
        heading: "Plans",
        content: [
          { type: "paragraph", text: "We offer Free, Starter, Pro, Premium, and Enterprise subscription tiers. Features and pricing for each tier are displayed on the Pricing page and may be updated from time to time in accordance with Section 6.6." },
        ],
      },
      {
        type: "subsection",
        number: "6.2",
        heading: "Free trial",
        content: [
          { type: "paragraph", text: "The Starter plan includes a 7-day free trial. A valid payment method is required at signup. You will not be charged until the trial ends. If you cancel before the trial ends, no charge will be made. By starting the trial, you consent to being charged automatically at the end of the trial period unless you cancel." },
        ],
      },
      {
        type: "subsection",
        number: "6.3",
        heading: "Payment",
        content: [
          { type: "paragraph", text: `Payments are processed by Stripe, Inc. By subscribing you agree to Stripe's terms of service. We do not store your full payment card details.` },
        ],
      },
      {
        type: "subsection",
        number: "6.4",
        heading: "Automatic renewal",
        content: [
          { type: "paragraph", text: "Subscriptions renew automatically at the end of each billing period (monthly or annually as selected). We will send you a reminder at least 14 days before each annual renewal stating the renewal amount, renewal date, and how to cancel. Monthly renewals do not require prior notice under Australian Consumer Law." },
        ],
      },
      {
        type: "subsection",
        number: "6.5",
        heading: "Cancellation",
        content: [
          { type: "paragraph", text: `You may cancel at any time through Settings → Subscription or by emailing support@insiderpulse.org. Cancellation takes effect at the end of the current billing period with no cancellation fees. You retain access to paid features until the end of the period.` },
        ],
      },
      {
        type: "subsection",
        number: "6.6",
        heading: "Refunds",
        content: [
          { type: "paragraph", text: "Free trial cancellation: no charge if cancelled before the trial ends." },
          { type: "paragraph", text: "Monthly subscriptions: no pro-rata refund for partial months after cancellation, except where required by the Australian Consumer Law." },
          { type: "paragraph", text: `Annual subscriptions: full refund available within 14 days of annual renewal if you have not substantially used the Platform during that new billing period. "Substantially used" means fewer than 10 Platform sessions and no AI Assistant queries after the renewal date.` },
          { type: "paragraph", text: "Accidental or disputed charges: contact support@insiderpulse.org within 60 days of the charge. Chargebacks filed without contacting us first may result in account termination and loss of access to any retained subscription time." },
          { type: "paragraph", text: "Accounts terminated by us for breach: no refund of remaining subscription time." },
          { type: "paragraph", text: "Your rights under the Australian Consumer Law are not affected by this section." },
        ],
      },
      {
        type: "subsection",
        number: "6.7",
        heading: "Price changes",
        content: [
          { type: "paragraph", text: "We provide at least 30 days written notice of price changes before they take effect. If you do not accept the new price, you may cancel your subscription before the effective date without penalty." },
        ],
      },
      {
        type: "subsection",
        number: "6.8",
        heading: "Taxes",
        content: [
          { type: "paragraph", text: "Prices shown on the Platform are inclusive of GST where applicable under the GST Act 1999 (Cth). Users outside Australia are responsible for any local taxes, duties, or levies imposed by their jurisdiction." },
        ],
      },
    ],
  },
  {
    id: "acceptable-use",
    number: "7",
    heading: "ACCEPTABLE USE",
    content: [
      { type: "paragraph", text: "You may use the Platform for personal or internal business purposes only. You must not:" },
      {
        type: "list",
        items: [
          "Redistribute, resell, republish, or commercially exploit Platform content, signals, or scores to any third party without our prior written consent",
          "Use bots, scrapers, crawlers, or automated tools to extract data from the Platform",
          "Reverse engineer, decompile, or attempt to derive the source code, algorithms, or scoring methodologies of the Platform",
          "Circumvent or attempt to circumvent any access controls, paywalls, rate limits, or security measures",
          "Create competing products or services using Platform content, outputs, or derivatives thereof",
          "Use the Platform in connection with market manipulation, insider trading, front-running, or any conduct prohibited under Part 7.10 of the Corporations Act 2001 (Cth) or equivalent laws in your jurisdiction",
          "Share, transfer, or sell your account credentials to any other person",
          "Use Platform content to provide financial advice to third parties",
          "Use the Platform to transmit malicious code, conduct phishing, or engage in any illegal activity",
          "Abuse the AI Assistant through excessive automation, prompt injection, or attempts to extract underlying model training data",
          "Misrepresent your identity, country of residence, or eligibility",
        ],
      },
    ],
  },
  {
    id: "broker-connections",
    number: "8",
    heading: "BROKER CONNECTIONS AND TRADING",
    content: [
      {
        type: "subsection",
        number: "8.1",
        heading: "We are not a broker",
        content: [
          { type: "paragraph", text: "InsiderPulse is not a broker, dealer, investment adviser, or custodian. We do not hold client funds. We do not execute trades on our own account or on your behalf in the traditional sense. Where the Platform executes a trade, it does so only on your explicit instruction, through a brokerage you have connected and authorised." },
        ],
      },
      {
        type: "subsection",
        number: "8.2",
        heading: "Connected brokerages",
        content: [
          { type: "paragraph", text: "If you connect a third-party brokerage account to the Platform, you authorise us to receive and transmit data between that brokerage and the Platform solely for the purposes you select (portfolio sync, order placement). Your brokerage credentials are encrypted at rest and are used only when you initiate an action." },
        ],
      },
      {
        type: "subsection",
        number: "8.3",
        heading: "Brokerage responsibility",
        content: [
          { type: "paragraph", text: "We are not responsible for:" },
          {
            type: "list",
            items: [
              "Losses, errors, delays, or failures caused by your brokerage",
              "Trades executed or not executed due to brokerage-side issues",
              "Brokerage fees, spreads, or slippage",
              "Brokerage account freezes, compliance holds, or regulatory actions against your brokerage",
              "Any action your brokerage takes in respect of your account",
            ],
          },
          { type: "paragraph", text: `You remain solely responsible for your brokerage account, including maintaining compliance with the brokerage's terms of service.` },
        ],
      },
      {
        type: "subsection",
        number: "8.4",
        heading: "Trading Bots (when available)",
        content: [
          { type: "paragraph", text: "Trading Bots are in development. When available:" },
          {
            type: "list",
            items: [
              "Execution follows algorithmic signals at your configured direction",
              "You set risk parameters (position size, stop-loss, cooldown periods, daily limits)",
              "You retain full control and responsibility for every trade placed",
              "We are not liable for trading losses, missed executions, slippage, rejected orders, partial fills, or broker-side errors",
              "You may pause or stop any bot at any time",
              "Bot operation may be suspended for safety reasons, system maintenance, or regulatory reasons without notice",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "8.5",
        heading: "Broker key revocation",
        content: [
          { type: "paragraph", text: `You may revoke broker keys at any time through Settings → Brokers. Revocation takes effect immediately for new trades, but trades already submitted to the brokerage may still execute according to the brokerage's own processes.` },
        ],
      },
    ],
  },
  {
    id: "intellectual-property",
    number: "9",
    heading: "INTELLECTUAL PROPERTY",
    content: [
      {
        type: "subsection",
        number: "9.1",
        heading: "Our IP",
        content: [
          { type: "paragraph", text: "All intellectual property in the Platform, including algorithms, scoring methodologies, signal models, software, user interface, brand, and content, is owned by or licensed to InsiderPulse and protected under the Copyright Act 1968 (Cth), the Patents Act 1990 (Cth), the Trade Marks Act 1995 (Cth), and applicable international laws." },
        ],
      },
      {
        type: "subsection",
        number: "9.2",
        heading: "Licence to you",
        content: [
          { type: "paragraph", text: "We grant you a limited, non-exclusive, non-transferable, non-sublicensable, revocable licence to access and use the Platform for your personal or internal business purposes during the term of your subscription. This licence ends when your subscription ends." },
        ],
      },
      {
        type: "subsection",
        number: "9.3",
        heading: "Your content",
        content: [
          { type: "paragraph", text: "You retain ownership of content you submit to the Platform (queries, feedback, watchlist configurations). By submitting content, you grant InsiderPulse a non-exclusive, worldwide, royalty-free licence to process, store, and use that content solely to provide the Platform services and improve them in aggregated, de-identified form." },
        ],
      },
      {
        type: "subsection",
        number: "9.4",
        heading: "Feedback",
        content: [
          { type: "paragraph", text: `If you provide suggestions, feedback, or ideas ("Feedback"), you grant us a perpetual, irrevocable, worldwide, royalty-free licence to use that Feedback for any purpose without compensation or attribution.` },
        ],
      },
    ],
  },
  {
    id: "data-and-ai",
    number: "10",
    heading: "DATA AND AI",
    content: [
      {
        type: "subsection",
        number: "10.1",
        heading: "Your data",
        content: [
          { type: "paragraph", text: "Your use of the Platform is also governed by our Privacy Policy, which forms part of these Terms." },
        ],
      },
      {
        type: "subsection",
        number: "10.2",
        heading: "AI outputs",
        content: [
          { type: "paragraph", text: "All AI Assistant responses, algorithmic scores, and signal summaries are automated data outputs. They may be inaccurate, biased, or incomplete. We make no representation or warranty about AI output reliability. See Section 4." },
        ],
      },
      {
        type: "subsection",
        number: "10.3",
        heading: "We do not train on your data",
        content: [
          { type: "paragraph", text: "We do not use your personal information, chat history, or identifiable platform behaviour to train any AI model." },
        ],
      },
    ],
  },
  {
    id: "beta-features",
    number: "11",
    heading: "BETA FEATURES AND PRE-RELEASE",
    content: [
      { type: "paragraph", text: `Features marked as "beta," "preview," "coming soon," or similar are provided experimentally and may be modified, delayed, or discontinued without notice. No subscription tier entitles you to delivery of any specific unreleased feature on any specific timeline. Forward-looking statements about features are not contractual commitments.` },
    ],
  },
  {
    id: "limitation-of-liability",
    number: "12",
    heading: "LIMITATION OF LIABILITY",
    content: [
      {
        type: "subsection",
        number: "12.1",
        heading: "Non-excludable rights",
        content: [
          { type: "paragraph", text: "Nothing in these Terms excludes rights under the Australian Consumer Law or other non-excludable consumer protection laws applicable to you." },
        ],
      },
      {
        type: "subsection",
        number: "12.2",
        heading: "Excluded losses",
        content: [
          { type: "paragraph", text: "To the maximum extent permitted by law, InsiderPulse is not liable for:" },
          {
            type: "list",
            items: [
              "Loss of profits, revenue, business opportunity, or anticipated savings",
              "Loss of data",
              "Indirect, special, consequential, punitive, or exemplary damages",
              "Any financial loss arising from investment or trading decisions made using Platform data or outputs",
              "Loss caused by third-party service outages (Supabase, Stripe, brokerages, data providers, etc.)",
              "Loss caused by force majeure events (Section 13)",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "12.3",
        heading: "Liability cap",
        content: [
          { type: "paragraph", text: "Subject to Sections 12.1 and 12.4, our total aggregate liability to you in any 12-month period is limited to the greater of:" },
          { type: "paragraph", text: "(a) the fees paid by you to InsiderPulse in the 12 months preceding the event giving rise to liability, or" },
          { type: "paragraph", text: "(b) AUD $100." },
        ],
      },
      {
        type: "subsection",
        number: "12.4",
        heading: "Exceptions",
        content: [
          { type: "paragraph", text: "The cap in 12.3 does not apply to:" },
          {
            type: "list",
            items: [
              "Non-excludable rights under the Australian Consumer Law or similar consumer protection laws",
              "Fraud or wilful misconduct by InsiderPulse",
              "Breach of the Privacy Act 1988 by InsiderPulse",
              "Liability that cannot be limited by law in your jurisdiction",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "force-majeure",
    number: "13",
    heading: "FORCE MAJEURE",
    content: [
      { type: "paragraph", text: "We are not liable for any delay or failure in performance caused by events beyond our reasonable control, including but not limited to: acts of God, natural disasters, war, terrorism, civil unrest, government action, pandemic, epidemic, fire, flood, earthquake, power or telecommunications failures, internet or ISP outages, cloud provider outages (including Supabase, Stripe, AWS, Cloudflare, Lovable, or equivalent), cyber attacks, denial-of-service attacks, and labour disputes." },
      { type: "paragraph", text: "During a force majeure event our obligations are suspended for the duration of the event." },
    ],
  },
  {
    id: "indemnification",
    number: "14",
    heading: "INDEMNIFICATION",
    content: [
      { type: "paragraph", text: "To the maximum extent permitted by law, you agree to indemnify, defend, and hold harmless InsiderPulse, Daniel Mark Seaton personally, and any future affiliates, contractors, employees, and agents, from and against any claim, loss, damage, liability, fine, expense, or cost (including reasonable legal costs on a solicitor-and-own-client basis) arising from or related to:" },
      {
        type: "list",
        items: [
          "Your use of Platform outputs for any investment, trading, or financial decision",
          "Trades executed through any brokerage connected to your account",
          "Your breach of these Terms, the Acceptable Use Policy (Section 7), or any applicable law",
          `Your violation of any third party's rights, including intellectual property or privacy rights`,
          "Content you submit to the Platform",
          "Your misuse or unauthorised sharing of account credentials",
          "Any dispute between you and a third party, including your brokerage",
        ],
      },
      { type: "paragraph", text: "This indemnification does not apply to the extent a claim arises from our fraud, wilful misconduct, or breach of non-excludable consumer rights." },
    ],
  },
  {
    id: "testimonials",
    number: "15",
    heading: "TESTIMONIALS AND PERFORMANCE CLAIMS",
    content: [
      { type: "paragraph", text: "Any customer testimonials, case studies, historical performance data, backtest results, or performance claims displayed on the Platform:" },
      {
        type: "list",
        items: [
          "Are individual experiences or backward-looking statistical observations",
          "Do not predict, guarantee, or imply any outcome for any other user",
          "Are not personal advice or recommendations",
          "May not be typical of all users",
        ],
      },
    ],
  },
  {
    id: "affiliate-disclosure",
    number: "16",
    heading: "AFFILIATE AND REFERRAL DISCLOSURE",
    content: [
      {
        type: "subsection",
        number: "16.1",
        heading: "Current state",
        content: [
          { type: "paragraph", text: "As of the effective date of these Terms, we do not receive affiliate commissions from any brokerage or financial product provider. Our algorithmic scores and signals are generated independently of any commercial relationship with any brokerage or issuer." },
        ],
      },
      {
        type: "subsection",
        number: "16.2",
        heading: "Future state",
        content: [
          { type: "paragraph", text: "If we introduce affiliate relationships, we will:" },
          {
            type: "list",
            items: [
              "Update this section to list affiliate partners",
              "Clearly label any affiliate links within the Platform",
              "Confirm that algorithmic scoring remains independent of affiliate status",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "account-suspension",
    number: "17",
    heading: "ACCOUNT SUSPENSION AND TERMINATION",
    content: [
      {
        type: "subsection",
        number: "17.1",
        heading: "Termination by you",
        content: [
          { type: "paragraph", text: "You may cancel your subscription at any time (Section 6.5) or delete your account permanently through Settings → Delete Account." },
        ],
      },
      {
        type: "subsection",
        number: "17.2",
        heading: "Termination by us",
        content: [
          { type: "paragraph", text: "We may suspend or terminate your access, with or without notice, for:" },
          {
            type: "list",
            items: [
              "Breach of these Terms, including the Acceptable Use Policy",
              "Fraudulent activity, chargebacks without prior contact, or payment disputes",
              "Use of the Platform in violation of applicable law or sanctions",
              "Risk to Platform integrity, security, or other users",
              "Extended inactivity (free accounts only, after 12 months of no use)",
              "Any action that exposes us to legal or regulatory liability",
            ],
          },
        ],
      },
      {
        type: "subsection",
        number: "17.3",
        heading: "Effect of termination",
        content: [
          { type: "paragraph", text: "Upon termination:" },
          {
            type: "list",
            items: [
              "Your right to access the Platform ceases immediately",
              "We destroy or de-identify your personal data in accordance with the Privacy Policy",
              "No refund is owed for remaining subscription time if termination was due to your breach",
              "Outstanding fees remain payable",
              "Sections that by their nature should survive (Sections 4, 9, 12, 13, 14, 15, 20, 21) continue to apply",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "dispute-resolution",
    number: "18",
    heading: "DISPUTE RESOLUTION",
    content: [
      {
        type: "subsection",
        number: "18.1",
        heading: "Informal resolution",
        content: [
          { type: "paragraph", text: "Before pursuing formal action, both parties must attempt good-faith resolution for at least 14 days after written notice to support@insiderpulse.org." },
        ],
      },
      {
        type: "subsection",
        number: "18.2",
        heading: "Australian users",
        content: [
          { type: "paragraph", text: "Unresolved disputes involving Australian consumers may be referred to mediation through the Resolution Institute in Brisbane. Nothing in this clause prevents either party seeking urgent court relief or contacting the ACCC, Queensland Office of Fair Trading, or the Office of the Australian Information Commissioner." },
        ],
      },
      {
        type: "subsection",
        number: "18.3",
        heading: "Non-Australian users: arbitration",
        content: [
          { type: "paragraph", text: `For users outside Australia, unresolved disputes must be submitted to final and binding individual arbitration administered by the Australian Centre for International Commercial Arbitration (ACICA) in Brisbane, Queensland, Australia, in accordance with ACICA's Arbitration Rules. The arbitration will be conducted in English and decided by a single arbitrator.` },
          { type: "paragraph", text: "Each party bears its own costs unless the arbitrator determines otherwise." },
          { type: "paragraph", text: "Nothing in this section prevents either party from seeking urgent interim relief from a court of competent jurisdiction." },
        ],
      },
      {
        type: "subsection",
        number: "18.4",
        heading: "Class action waiver (non-Australian users)",
        content: [
          { type: "paragraph", text: "To the maximum extent permitted by law, non-Australian users agree to resolve disputes with us individually and waive any right to participate in a class action, consolidated action, representative action, or private attorney general action. This waiver does not apply to Australian users where the ACL or other non-excludable law provides otherwise." },
        ],
      },
    ],
  },
  {
    id: "governing-law",
    number: "19",
    heading: "GOVERNING LAW AND JURISDICTION",
    content: [
      { type: "paragraph", text: "These Terms are governed by the laws of Queensland, Australia. Each party submits to the non-exclusive jurisdiction of the courts of Queensland and the courts competent to hear appeals from them." },
      { type: "paragraph", text: "Mandatory consumer protections applicable in your jurisdiction are not overridden by these Terms." },
    ],
  },
  {
    id: "changes-to-terms",
    number: "20",
    heading: "CHANGES TO THESE TERMS",
    content: [
      { type: "paragraph", text: "We may update these Terms from time to time. For material changes we provide at least 30 days written notice by email and prominent notice on the Platform before changes take effect." },
      { type: "paragraph", text: "Continued use of the Platform after the effective date constitutes acceptance of the revised Terms. If you do not accept revised Terms, you may cancel your subscription and delete your account before the effective date without penalty and receive a pro-rata refund for any unused prepaid period." },
      { type: "paragraph", text: "Each published version of these Terms is numbered and dated. Prior versions are available on request." },
    ],
  },
  {
    id: "general",
    number: "21",
    heading: "GENERAL",
    content: [
      {
        type: "subsection",
        number: "21.1",
        heading: "Entire agreement",
        content: [
          { type: "paragraph", text: "These Terms, together with the Privacy Policy and any plan-specific terms you accept at purchase, constitute the entire agreement between you and InsiderPulse and supersede any prior or contemporaneous agreements, communications, or understandings." },
        ],
      },
      {
        type: "subsection",
        number: "21.2",
        heading: "Severability",
        content: [
          { type: "paragraph", text: "If any provision of these Terms is found unenforceable by a court of competent jurisdiction, that provision will be modified to the minimum extent necessary to make it enforceable, and the remaining provisions will continue in full force and effect." },
        ],
      },
      {
        type: "subsection",
        number: "21.3",
        heading: "No waiver",
        content: [
          { type: "paragraph", text: "Our failure to enforce any right or provision of these Terms does not constitute a waiver of that right or provision. A waiver is effective only if in writing and signed by us." },
        ],
      },
      {
        type: "subsection",
        number: "21.4",
        heading: "Assignment",
        content: [
          { type: "paragraph", text: "You may not assign or transfer these Terms or any rights under them without our prior written consent. Any attempted assignment without consent is void. We may assign these Terms to any successor entity, affiliate, or acquirer in connection with a merger, acquisition, restructuring, or sale of all or substantially all of our assets, with notice to you." },
        ],
      },
      {
        type: "subsection",
        number: "21.5",
        heading: "Relationship",
        content: [
          { type: "paragraph", text: "Nothing in these Terms creates a partnership, joint venture, employment, agency, or fiduciary relationship between you and us." },
        ],
      },
      {
        type: "subsection",
        number: "21.6",
        heading: "Notices",
        content: [
          { type: "paragraph", text: "Notices to you may be sent to the email associated with your account. Notices to us must be sent to support@insiderpulse.org or by mail to the address in Section 1." },
        ],
      },
      {
        type: "subsection",
        number: "21.7",
        heading: "Electronic communications",
        content: [
          { type: "paragraph", text: "You consent to receive communications from us electronically (email, in-Platform notification) and agree that all agreements, notices, disclosures, and other communications satisfy any legal requirement that they be in writing." },
        ],
      },
      {
        type: "subsection",
        number: "21.8",
        heading: "Headings",
        content: [
          { type: "paragraph", text: "Section headings are for convenience only and do not affect interpretation." },
        ],
      },
      {
        type: "subsection",
        number: "21.9",
        heading: "Interpretation",
        content: [
          { type: "paragraph", text: `References to statutes include any successor legislation. References to "including" mean "including without limitation."` },
        ],
      },
    ],
  },
  {
    id: "contact",
    number: "22",
    heading: "CONTACT",
    content: [
      { type: "paragraph", text: "For inquiries: support@insiderpulse.org" },
      { type: "paragraph", text: "Mail:" },
      { type: "address", lines: ["Daniel Mark Seaton trading as InsiderPulse", "ABN 41 859 964 692", "Parcel Locker 10237 20930", "491 Zillmere Road", "Zillmere QLD 4034", "Australia"] },
    ],
  },
];
