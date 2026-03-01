# Example: Building a Web Application

This example walks through building a complete web application using SkillFoundry Framework, from PRD to deployment.

---

## Project Overview

**Project**: Task Management Web App  
**Type**: Web Application  
**Stack**: React (Frontend) + Node.js/Express (Backend)  
**Platform**: Claude Code  

---

## Step 1: Create PRD

### PRD: Task Management Web App

```markdown
# PRD: Task Management Web App

**Version:** 1.0
**Status:** DRAFT
**Created:** 2026-01-25

---

## 1. Overview

### 1.1 Problem Statement
Users need a simple way to manage tasks and track progress. Current solutions are either too complex or lack essential features.

### 1.2 Proposed Solution
Build a web-based task management application with:
- Task creation and editing
- Task status tracking (Todo, In Progress, Done)
- User authentication
- Task filtering and search

### 1.3 Success Metrics
| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| User signups | 0 | 100 | Analytics dashboard |
| Tasks created | 0 | 1000 | Database metrics |
| Daily active users | 0 | 50 | User activity logs |

---

## 2. User Stories

### Primary User: Task Manager
| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | user | create tasks | I can track my work | MUST |
| US-002 | user | mark tasks complete | I can track progress | MUST |
| US-003 | user | filter tasks by status | I can focus on what's important | SHOULD |
| US-004 | user | search tasks | I can find specific items quickly | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features
| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Task Creation | Create new tasks with title and description | Given I'm logged in, When I click "New Task", Then I can enter title/description and save |
| FR-002 | Task Status | Change task status (Todo → In Progress → Done) | Given a task exists, When I change status, Then it updates immediately |
| FR-003 | Task List | View all my tasks | Given I'm logged in, When I visit home, Then I see all my tasks |
| FR-004 | Authentication | Sign up and log in | Given I'm not logged in, When I sign up, Then I can log in and access my tasks |

---

## 4. Technical Specifications

### 4.1 Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Node.js 20, Express, TypeScript
- **Database**: PostgreSQL 15
- **Auth**: JWT tokens

### 4.2 Architecture
```
┌─────────────┐
│   React UI  │
└──────┬──────┘
       │ HTTP/REST
┌──────▼──────┐
│ Express API │
└──────┬──────┘
       │ SQL
┌──────▼──────┐
│ PostgreSQL  │
└─────────────┘
```

---

## 5. Implementation Plan

### Phase 1: MVP (Week 1)
- [ ] Database schema (users, tasks)
- [ ] Authentication API (signup, login)
- [ ] Task CRUD API
- [ ] React frontend (task list, create task)
- [ ] Basic styling

### Phase 2: Enhancements (Week 2)
- [ ] Task filtering
- [ ] Task search
- [ ] Status transitions
- [ ] Improved UI/UX

---

## 6. Security Requirements

- Passwords hashed with bcrypt (salt rounds: 10)
- JWT tokens expire after 24 hours
- All API endpoints require authentication (except signup/login)
- Input validation on all forms
- SQL injection prevention (parameterized queries)
- XSS prevention (React auto-escaping)

---

## 7. Out of Scope

- Task sharing/collaboration
- Task due dates/reminders
- File attachments
- Mobile app
- Email notifications

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Database performance | Medium | High | Add indexes on user_id, status columns |
| JWT token security | Low | High | Use RS256, short expiration, refresh tokens |
| User adoption | Medium | Medium | Focus on MVP, gather feedback early |

```

**Save to**: `genesis/task-management-app.md`

---

## Step 2: Run `/go` Command

In Claude Code:

```bash
claude
> /go
```

The `/go` command will:
1. ✅ Validate PRD
2. ✅ Generate implementation stories
3. ✅ Create database schema
4. ✅ Implement backend API
5. ✅ Implement frontend UI
6. ✅ Add tests
7. ✅ Generate documentation

---

## Step 3: Review Generated Stories

After `/go` runs, check `docs/stories/task-management-app/`:

```
docs/stories/task-management-app/
├── INDEX.md              # Story overview + dependency graph
├── STORY-001-auth.md     # User authentication
├── STORY-002-task-model.md # Task data model
├── STORY-003-task-api.md  # Task CRUD API
├── STORY-004-task-ui.md   # React task list UI
└── STORY-005-task-forms.md # Task creation form
```

---

## Step 4: Verify Implementation

### Database Layer ✅
```bash
# Check migrations
ls migrations/
# migrations/001_create_users.sql
# migrations/002_create_tasks.sql

# Verify schema
psql -d taskapp -c "\d users"
psql -d taskapp -c "\d tasks"
```

### Backend Layer ✅
```bash
# Check API endpoints
curl http://localhost:3000/api/health
curl http://localhost:3000/api/auth/signup -X POST -d '{"email":"test@example.com","password":"test123"}'
curl http://localhost:3000/api/tasks -H "Authorization: Bearer <token>"
```

### Frontend Layer ✅
```bash
# Start frontend
cd frontend
npm start
# Open http://localhost:3001
# Verify: Task list, create task button, status filters
```

---

## Step 5: Run Tests

```bash
# Backend tests
cd backend
npm test
# ✅ 15 tests passing

# Frontend tests
cd frontend
npm test
# ✅ 12 tests passing

# Integration tests
npm run test:integration
# ✅ 8 tests passing
```

---

## Step 6: Security Audit

```bash
# Run security scanner
> /security-scanner

# Results:
# ✅ No hardcoded secrets
# ✅ SQL uses parameterized queries
# ✅ Input validation present
# ✅ JWT uses RS256 algorithm
# ✅ Passwords hashed with bcrypt
```

---

## Step 7: Deploy

### Backend Deployment
```bash
# Build
cd backend
npm run build

# Deploy to production
# (Your deployment process here)
```

### Frontend Deployment
```bash
# Build
cd frontend
npm run build

# Deploy static files
# (Your deployment process here)
```

---

## Common Issues & Solutions

### Issue 1: Database Connection Failed
**Error**: `ECONNREFUSED 127.0.0.1:5432`

**Solution**:
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Verify connection string in .env
DATABASE_URL=postgresql://user:pass@localhost:5432/taskapp
```

### Issue 2: CORS Errors
**Error**: `Access-Control-Allow-Origin` header missing

**Solution**:
```javascript
// backend/src/app.ts
import cors from 'cors';
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));
```

### Issue 3: JWT Token Expired
**Error**: `Token expired`

**Solution**:
- Implement refresh token flow
- Or increase token expiration time (for development only)

---

## Next Steps

1. **Add Features**: Extend PRD with new user stories
2. **Improve UI**: Enhance styling, add animations
3. **Add Tests**: Increase test coverage to 90%+
4. **Performance**: Optimize database queries, add caching
5. **Monitoring**: Add logging, error tracking, analytics

---

## Key Takeaways

✅ **PRD-First**: Start with clear requirements  
✅ **Structured**: Stories guide implementation  
✅ **Three-Layer**: Verify DB → Backend → Frontend  
✅ **Security**: Built-in security checks  
✅ **Testing**: Tests generated automatically  
✅ **Documentation**: Auto-generated docs  

---

**Full Example Code**: See `examples/task-management-app/` directory for complete implementation.
