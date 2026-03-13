# Software Requirements Specification (SRS)
## Car Wash Service Platform ("Otto")

**Version:** 1.1  
**Date:** 2026-03-13  
**Prepared for:** Car Wash Service Platform  

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) defines the functional and non-functional requirements for the Car Wash Service Platform. It provides a detailed, testable specification covering mobile apps, admin web UI, and backend services. It is intended for developers, testers, project managers, and security auditors.

This document aligns with the **INSA Secure Website Management Standard (2014 EC)** and includes its principles, focus areas, and minimum security testing expectations.

### 1.2 Scope
The system enables:
- Owners to request car washes, discover nearby washers, and track service progress.
- Washers (bikers) to toggle availability, accept jobs, and share live location.
- Sales agents to register owners/sales and earn commissions.
- Admins to manage operations, users, and plans.

### 1.3 Definitions and Acronyms
**Definitions (from INSA standard):**
- **Must:** Mandatory requirement.
- **Must Not:** Absolute prohibition.
- **Should:** Highly recommended requirement.
- **Should Not:** Not recommended requirement.
- **May:** Optional requirement.

**Acronyms:**
- **API:** Application Programming Interface
- **CERT:** Cyber Emergency Readiness and Response Team
- **CI4A:** Confidentiality, Integrity, Authentication, Authorization, Availability, Accountability
- **CMCSRS:** Critical Mass Cyber Security Requirement Standard
- **CSP:** Content Security Policy
- **CSRF:** Cross-Site Request Forgery
- **CORS:** Cross-Origin Resource Sharing
- **CSS:** Cascading Style Sheets
- **DEP:** Data Execution Prevention
- **GUI:** Graphical User Interface
- **HTTP/HTTPS:** Hypertext Transfer Protocol / Secure
- **INSA:** Information Network Security Agency
- **OTP:** One-Time Password
- **PII:** Personally Identifiable Information
- **RBAC:** Role-Based Access Control
- **SRS:** Software Requirements Specification
- **TLS:** Transport Layer Security
- **URI/URL:** Uniform Resource Identifier/Locator

### 1.4 References
- INSA Secure Website Management Standard, Version 1.0 (2014 EC)
- Project source code: `/home/selam/Documents/car_wash`

---

## 2. Overall Description

### 2.1 Product Perspective
The platform is a multi-tier system consisting of:
- **Mobile app (Flutter):** Owner and washer functionality.
- **Admin web UI:** Dashboard, registrations, operations, and plan management.
- **Backend (NestJS):** REST APIs, role-based access control, business logic.
- **Data stores:** PostgreSQL for persistent data, Redis for OTP and live presence.
- **Integrations:** SMS provider, Chapa payment gateway, map tiles and routing APIs.

### 2.2 Product Functions (Summary)
- OTP-based authentication and session management.
- User registration and profile management (Owner/Washer/Sales/Admin).
- Subscription and payment handling.
- Wash request lifecycle (request, accept, track, complete).
- Live location tracking and nearby washer discovery.
- Admin and sales operational tools.

### 2.3 User Classes and Characteristics
- **Owner:** Non-technical user; uses phone login and map interface.
- **Washer/Biker:** Mobile user; needs real-time updates and stable location tracking.
- **Sales:** Semi-technical; uses registration forms and commission tracking.
- **Admin:** Technical/operational; monitors KPIs and manages system data.

### 2.4 Operating Environment
- Mobile: Android/iOS (Flutter).
- Backend: Node.js (NestJS), PostgreSQL, Redis.
- Hosting: Linux-based server with HTTPS/TLS.
- External services: SMS API, Chapa API, map/routing APIs.

### 2.5 Constraints
- OTP required for login and activation.
- Production requires explicit `CORS_ORIGINS`.
- PII encryption is required in production environments.
- Role-based authorization enforced at API layer.

### 2.6 Assumptions and Dependencies
- Users grant GPS permissions.
- SMS provider is available for OTP delivery.
- Payment gateway is reachable for verification.

---

## 3. Functional Requirements

### 3.1 Authentication and Session Management
- **FR-AUTH-01 (Must):** Users authenticate via phone + OTP.
- **FR-AUTH-02 (Must):** OTP expires after 5 minutes.
- **FR-AUTH-03 (Must):** OTP sending must be rate-limited (max 3 per 10 min).
- **FR-AUTH-04 (Must):** OTP verification must lock after 5 failures within 10 min.
- **FR-AUTH-05 (Must):** Successful verification issues access + refresh tokens.
- **FR-AUTH-06 (Must):** Refresh token reuse revokes existing sessions.
- **FR-AUTH-07 (Should):** OTP message includes expiry reminder.

### 3.2 User Registration
- **FR-REG-01 (Must):** Admin can register washers with profile data and documents.
- **FR-REG-02 (Must):** Admin can register sales users.
- **FR-REG-03 (Must):** Sales can register owners.
- **FR-REG-04 (Must):** Users remain inactive until OTP verification.
- **FR-REG-05 (Must):** Duplicate phone or national ID must be rejected.

### 3.3 Owner Subscriptions and Payments
- **FR-SUB-01 (Must):** Owners can view subscription plans.
- **FR-SUB-02 (Must):** Owners can initiate payment via Chapa.
- **FR-SUB-03 (Must):** Payment verification activates subscription.
- **FR-SUB-04 (Must):** Owners can query subscription status.
- **FR-SUB-05 (Should):** Owners receive payment status feedback on UI.

### 3.4 Wash Request Lifecycle
- **FR-WASH-01 (Must):** Owner can create a wash request using GPS location.
- **FR-WASH-02 (Must):** System finds nearby washers within a configurable radius.
- **FR-WASH-03 (Must):** Washers can accept or decline requests.
- **FR-WASH-04 (Must):** Washer location updates are streamed to owners.
- **FR-WASH-05 (Must):** Owner can confirm or reject completion.
- **FR-WASH-06 (Must):** Rejected completion reopens request for reassignment.
- **FR-WASH-07 (Must):** Owner can cancel before wash starts.
- **FR-WASH-08 (Should):** Owner sees ETA based on routing service.

### 3.5 Washer Presence and Tracking
- **FR-PRES-01 (Must):** Washer can toggle online/offline state.
- **FR-PRES-02 (Must):** Presence updates include lat/lng with timestamps.
- **FR-PRES-03 (Must):** Owners can view nearby washers on the map.
- **FR-PRES-04 (Must):** Nearby washer info includes name, phone, photo.
- **FR-PRES-05 (Should):** UI allows selecting a washer marker to view details.

### 3.6 Admin Operations
- **FR-ADM-01 (Must):** Admin dashboard shows live KPIs.
- **FR-ADM-02 (Must):** Admin can view washer monthly completion counts.
- **FR-ADM-03 (Must):** Admin can register washers and sales.
- **FR-ADM-04 (Should):** Admin can view operations dashboard with online washers.

### 3.7 Sales and Commissions
- **FR-SALE-01 (Must):** Sales can register owners with documentation.
- **FR-SALE-02 (Should):** Commission tracking for direct and recruiter sales.

---

## 4. Non-Functional Requirements

### 4.1 Security (INSA Alignment)
- **NFR-SEC-01 (Must):** All production traffic uses HTTPS/TLS.
- **NFR-SEC-02 (Must):** RBAC enforced for all endpoints.
- **NFR-SEC-03 (Must):** OTP rate limiting and lockout enforced.
- **NFR-SEC-04 (Must):** PII encrypted at rest (AES-256-GCM).
- **NFR-SEC-05 (Must):** Security events logged (OTP failures, token reuse).
- **NFR-SEC-06 (Must):** HTTP security headers set (HSTS, CSP, X-Frame-Options).
- **NFR-SEC-07 (Should):** Quarterly vulnerability assessment conducted.
- **NFR-SEC-08 (Should):** Change control process for releases.

### 4.2 Privacy
- **NFR-PRIV-01 (Must):** PII only accessible to authorized roles.
- **NFR-PRIV-02 (Must):** Owner sees washer phone/photo only after authentication.

### 4.3 Performance
- **NFR-PERF-01 (Should):** Nearby washer refresh within 5 seconds.
- **NFR-PERF-02 (Should):** Map updates within 1 second.
- **NFR-PERF-03 (Should):** OTP verification response within 2 seconds.

### 4.4 Reliability and Availability
- **NFR-REL-01 (Must):** Redis failures should degrade gracefully.
- **NFR-REL-02 (Should):** Routing API failures fall back to secondary provider.
- **NFR-REL-03 (Should):** System uptime >= 99% in production.

### 4.5 Maintainability
- **NFR-MAINT-01 (Must):** All config managed by environment variables.
- **NFR-MAINT-02 (Should):** Services are modular (auth, wash, plans).
- **NFR-MAINT-03 (Should):** API responses are versioned for future compatibility.

---

## 5. Data Requirements

### 5.1 Key Entities
- `User` (id, phone, role, isActive)
- `OwnerProfile` (fullName, carType, plateNumber, photos)
- `WasherProfile` (fullName, phone, mugShot, nationalId, bankDetails)
- `WashRequest` (status, pickupLat/lng, washerLat/lng, photos)
- `Plan`, `OwnerSubscription`
- `RefreshToken`, `SecurityAuditEvent`

### 5.2 PII Handling
- PII must be encrypted in production.
- Sensitive uploads must not be publicly accessible by default.

---

## 6. External Interface Requirements

### 6.1 User Interfaces
- Owner map view with nearby washer details.
- Washer interface for acceptance and navigation.
- Admin dashboard with KPIs and user management.

### 6.2 Software Interfaces
- SMS provider API for OTP delivery.
- Chapa API for payments.
- Map tiles and routing APIs.

---

## 7. INSA Secure Website Management Standard Alignment

### 7.1 Foreword (provided text)
The growing reliance on the internet creates new opportunities, but also new challenges. Cyber criminals are growing more sophisticated, and they continue to create harmful software and discover new methods for compromising organizational websites. As a matter of fact, organizational websites in our country increasingly become the primary targets of online of adversaries. Therefore, to address this emerging challenges, this secure website management standard has been prepared for maintaining and improving the security of website management. The implementation of the standard requirements should be supported by Critical Mass Cyber Security Requirement and Secure Software Development and Management Standards based on the organization's objectives and security requirements.

Draft national policies, laws, standards, and strategies that enable to ensure the information and computer-based key infrastructures security and oversight their enforcement upon approval is one of the power and duties are given to the Information Network Security Agency (INSA).

Therefore, this standard is issued by Information Network Security Agency (INSA) pursuant to Article 13 of Information Network Security Agency Re-establishment proclamation Execution council of ministers Regulation No.320/2014.

### 7.2 Purpose, Scope, Objectives
- **Purpose:** integrate security features into design, implementation, hosting, operation, and management.
- **Scope:** Ethiopian federal/regional government and key private organizations.
- **Objective:** enhance security, ensure standardization, and reduce risk.

### 7.3 Principles
- Mission-oriented
- Simplicity
- Accessibility
- Risk-based
- Integrate security (DevSecOps)

### 7.4 Focus Areas and Requirements
#### 7.4.1 Requirement Gathering and Analysis
- Business requirements must align with mission and risk criteria.
- Requirements must include security objectives and stakeholder needs.
- Requirements must define secure behavior across lifecycle.
- Requirements must be approved by top management.

#### 7.4.2 Design
- Design must follow secure software development standards.
- Design documents must be reviewed and approved.

#### 7.4.3 Implementation
- Secure coding requirements must be applied.
- Developers must be aware of organizational security requirements.
- Accreditation/audit required before hosting.

#### 7.4.4 Hosting
- Hosting security requirement documents must exist.
- Hosting providers evaluated on technical and non-technical controls.
- Government data must stay in Ethiopia (data sovereignty).

#### 7.4.5 Operation and Management
- Policies for access control, emergency communication, content management.
- Documented procedures for access grants/revocation.
- Quarterly vulnerability assessments required.
- Change control and testing required before deployment.
- Monitoring tools for breach detection required.
- Patch/configuration management with staging required.

---

## 8. Annexes

### Annex A: Common Vulnerabilities (INSA)
- SQL Injection
- Directory Traversal
- Improper Session Management
- Cross-Site Scripting
- CSRF
- HTTP Header Injection
- Mail Header Injection
- Lack of Authentication/Authorization

### Annex B: Minimum Security Testing Checklist (Summary)
- Information disclosure checks (files, logs, robots.txt, source).
- Privacy/confidentiality checks (URLs, caching, TLS).
- Authentication/authorization checks (weak/default credentials, token predictability).
- Input validation checks (SQLi, XSS, injection variants).
- Session management checks (CSRF, token regeneration, cookie flags).
- File upload checks (size/type limits, storage location).
- Deployment hardening (patches, EOL software, unsafe methods).
- Rate limiting for authentication and resource-intensive actions.

---

## 9. Approval
- Prepared by: ____________________________
- Reviewed by: ____________________________
- Approved by: ____________________________
