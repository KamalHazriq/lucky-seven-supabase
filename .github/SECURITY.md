# Security Policy

## Supported Versions

Security fixes are applied to the current `main` branch and the live production deployment at [luckyseven.site](https://luckyseven.site).

## Reporting a Vulnerability

If you discover a security vulnerability in Lucky Seven, please report it privately.

- Preferred: use GitHub's private vulnerability reporting for this repository
- Do not open a public GitHub issue for security reports
- If private reporting is unavailable, contact the maintainer privately through the contact method listed on the repository owner's GitHub profile

When reporting, please include:

- a clear description of the issue
- affected area or file, if known
- steps to reproduce
- proof of concept, screenshots, or request/response details if relevant
- the potential impact

## What Is Helpful to Report

Security reports are especially helpful for issues involving:

- authentication or authorization bypass
- Supabase Row Level Security or RPC trust-boundary problems
- private game data exposure
- room or join-code abuse that bypasses intended access control
- XSS, injection, or unsafe input handling
- production deployment, domain, or configuration weaknesses
- privilege escalation, cheating through unauthorized access, or state tampering

## Out of Scope

The following are generally not considered security vulnerabilities by themselves:

- normal gameplay strategy or allowed game mechanics
- balance issues
- UI or visual bugs without security impact
- feature requests or performance-only issues

## Response Expectations

- Initial acknowledgment target: within 7 days
- Follow-up target: periodic updates as triage and remediation progress
- Public disclosure should wait until a fix is available and deployed

## Safe Handling

Please avoid:

- public disclosure before a fix is ready
- testing against other players or real user data
- denial-of-service style testing against production

Thank you for helping keep Lucky Seven and its players safe.
