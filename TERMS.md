# Anatome — Terms of Use

**Last updated: June 2, 2026**
**Effective date: June 2, 2026**

These Terms of Use ("Terms") govern your access to and use of the Anatome API, website, documentation, and related services (collectively, the "Service"), provided by NextSolutions ("we", "us", "our") based in Poland.

By accessing or using the Service, you agree to these Terms. If you do not agree, do not use the Service.

---

## 1. The Service

Anatome is an open-source API that:

- Renders SVG diagrams of human muscle groups
- Provides metadata for 873 strength and stretching exercises (sourced from the public-domain free-exercise-db dataset)
- Exposes a Model Context Protocol (MCP) server for AI agent integrations
- Ships an OpenAPI 3.1 specification and a web playground at anatome.dev

The Service is provided "as is" and is intended for use in fitness applications, AI coaches, educational tools, and similar software.

## 2. Open Source

The Anatome codebase is licensed under the Apache License 2.0 and is publicly available at https://github.com/NextSolutionsStudio/anatome. You are free to self-host the Service under the terms of that license, with no obligation to use our hosted endpoint.

Third-party assets bundled into the Service retain their original licenses:

- **Anatomical SVG paths**: MIT license, © Hicham El Boussarghini, originally from react-native-body-highlighter
- **Exercise metadata, JPGs, and derived GIFs**: CC0-1.0 public domain, originally from yuhonas/free-exercise-db

These attributions must be preserved in any redistribution per the respective licenses.

## 3. Acceptable Use

You agree NOT to:

- Use the Service in any way that violates applicable law (including but not limited to laws of the Republic of Poland, the European Union, or your local jurisdiction)
- Use the Service to provide medical diagnosis, treatment, or other licensed medical advice
- Attempt to exceed rate limits through circumvention (e.g. using multiple RapidAPI accounts, rotating IPs, or stripping authentication headers)
- Reverse engineer, decompile, or attempt to extract proprietary infrastructure of the hosted endpoint
- Resell access to the Service as a wrapper or proxy without substantial added functionality
- Use the Service to generate or distribute content that is defamatory, harassing, obscene, or unlawful

We reserve the right to suspend or revoke access for users who violate these Acceptable Use rules.

## 4. Pricing and Plans

The Service is offered through two channels:

**a) Free, direct access at anatome.dev and api.anatome.dev**

- Unlimited from localhost and private IP ranges (for development)
- 1,000 requests per day per public IP (anonymous users)
- 100 requests per day per public host/referer (anonymous users)
- No registration required
- We may adjust these limits with reasonable notice

**b) RapidAPI marketplace listing**

- Pricing tiers and quotas as listed at rapidapi.com
- RapidAPI handles billing, authentication, and quota enforcement
- Subject to RapidAPI's own terms of service

Pricing aims for cost-recovery only. Any surplus revenue funds infrastructure, exercise database expansion, translations, and continued development of the open-source codebase. We do not target a profit on the hosted endpoint.

## 5. No Medical Advice

**The Service is not a medical device, not a substitute for professional medical advice, and is not intended for medical use.** Exercise visualizations are anatomical references for general educational and fitness purposes only.

If you incorporate Anatome into an application that provides health or fitness guidance to end users, you are responsible for ensuring your application complies with applicable health regulations in your jurisdiction and includes appropriate disclaimers.

## 6. Service Availability

We provide the Service on a best-effort basis with no guaranteed uptime SLA on free tiers. For paid plans on RapidAPI, availability commitments are governed by RapidAPI's marketplace terms.

We may modify, suspend, or discontinue the Service at any time. If we discontinue the hosted endpoint, the open-source codebase will remain available so you can self-host.

## 7. Caching and Storage of Responses

You are explicitly permitted to:

- Cache API responses (SVG output, exercise records, GIFs) in your applications
- Store cached results in your own database
- Pre-render and bundle muscle SVGs into your client applications
- Use the bundled exercise JSON data as a one-time export

This is intentional. The underlying exercise data is CC0 public domain, and our rendering URLs are deterministic by design. You do not need to make a live API call for every page load.

## 8. Attribution

When using the Service in a public-facing context, attribution is **appreciated but not required**. A link to https://anatome.dev or a mention of "Powered by Anatome" helps the project grow and is encouraged.

The MIT and CC0 licenses governing third-party assets do require their respective attributions be preserved in source code or product documentation when redistributing the assets themselves.

## 9. User-Submitted Content

If you submit a GitHub issue, pull request, or community-contributed exercise:

- You confirm you have the right to submit it
- You grant us a non-exclusive, royalty-free, worldwide license to use, modify, and redistribute it under the Apache 2.0 license (for code) or CC0 (for exercise data)
- We may decline, modify, or remove submissions at our discretion

## 10. Disclaimers and Limitation of Liability

THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NEXTSOLUTIONS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR USE, ARISING OUT OF OR IN CONNECTION WITH THE SERVICE.

Our aggregate liability for any direct damages arising from the Service shall not exceed the greater of (a) €50 or (b) the amount you paid us for the Service in the 12 months preceding the claim.

Nothing in these Terms excludes liability that cannot be excluded by Polish or EU law (including liability for gross negligence, willful misconduct, or harm to life or limb).

## 11. Privacy

The Service:

- Logs request metadata (IP hash, host, timestamp, endpoint) for rate limiting and abuse prevention
- Does not require user registration
- Does not store user-identifying data beyond what is necessary for rate limiting
- Rate-limit data expires automatically after ~36 hours

When accessed through RapidAPI, RapidAPI's privacy policy also applies.

We do not sell, share, or transfer any logged data to third parties for marketing purposes.

## 12. Governing Law

These Terms are governed by the laws of the Republic of Poland, without regard to its conflict of laws provisions. Any disputes shall be subject to the exclusive jurisdiction of the competent courts of Poland.

For users in the European Union, mandatory consumer protection laws of your country of residence also apply where they provide stronger protection than these Terms.

## 13. Changes to These Terms

We may update these Terms from time to time. The "Last updated" date at the top reflects the most recent revision. Material changes will be announced via:

- A notice on anatome.dev
- A CHANGELOG entry in the GitHub repository
- For RapidAPI subscribers, via RapidAPI's notification system

Continued use of the Service after changes constitutes acceptance of the updated Terms.

## 14. Contact

NextSolutions
Email: contact@nextsolutions.studio
Website: https://nextsolutions.studio
GitHub: https://github.com/NextSolutionsStudio/anatome

For security disclosures: security@nextsolutions.studio (or use GitHub Security Advisories).

---

**TL;DR (not legally binding):** Use Anatome for any lawful purpose. Don't abuse the rate limits. We make no medical claims. Code is Apache-2.0, exercise data is CC0, anatomical paths are MIT. We aim for no profit. Self-host whenever you want.
