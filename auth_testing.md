# Signature Studio Authentication Testing
1. POST `/api/auth/login` with the admin credentials in `/app/memory/test_credentials.md`.
2. Confirm cookies are set and GET `/api/auth/me` succeeds.
3. Confirm `/api/admin/portfolio` returns 401 without cookies and works with cookies.
4. Confirm public `/api/portfolio/categories` and `/api/portfolio` work without authentication.