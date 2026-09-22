# SIGNATURE STUDIO Portfolio & CMS

## Original Problem Statement
Production-ready responsive portfolio site for Signature Studio. Visitors pick a niche and see only REELS and DESIGNS. Owner + Manager private CMS with full role-based access. No public self-registration. Contact info + slogan on every page.

## Architecture
- React + React Router; FastAPI + MongoDB; JWT httpOnly cookies; bcrypt; Resend (Emergent proxy) for email.
- Roles: OWNER (full access + team mgmt), MANAGER (portfolio + category CRUD). Server-side enforced via require_owner / require_manager dependencies.
- Public routes: /, /login, /forgot-password, /reset-password, /accept-invite/:token. Admin: /admin.

## Implemented (2026-09-22)
- Dark theme home + owner-only admin CMS
- Auth v2: removed public /register + /setup; added /forgot-password + /reset-password via signed one-time tokens delivered via Resend; TTL indexes on tokens and invitations
- Team management (OWNER only): invite by email, change role, disable, remove; guards prevent self-demote/disable/remove and last-owner removal
- Server-side RBAC on every admin endpoint
- Category Manager (create, rename, hide, delete empty)
- Featured Work (star toggle; featured items sort first in public + admin lists)
- Share Link menu on each media card (WhatsApp, Email, Copy Link)
- Fullscreen Lightbox viewer with keyboard arrows, autoplay for reels
- 100% backend (13/13) + 100% frontend tests passing

## Backlog
- P2: rate-limit forgot-password and login endpoints
- P2: audit log of team actions
- P2: real object storage for uploads instead of base64
