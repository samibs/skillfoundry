# Example: Building a REST API

This example demonstrates building a REST API using Claude AS Framework, focusing on backend implementation.

---

## Project Overview

**Project**: Book Library API  
**Type**: REST API  
**Stack**: Python/FastAPI  
**Platform**: GitHub Copilot CLI  

---

## Step 1: Create PRD

### PRD: Book Library API

```markdown
# PRD: Book Library API

**Version:** 1.0
**Status:** DRAFT
**Created:** 2026-01-25

---

## 1. Overview

### 1.1 Problem Statement
Developers need a REST API to manage a book library with CRUD operations, search, and filtering capabilities.

### 1.2 Proposed Solution
Build a RESTful API using FastAPI that provides:
- Book management (create, read, update, delete)
- Author management
- Search and filtering
- Pagination
- OpenAPI documentation

### 1.3 Success Metrics
| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| API response time | N/A | <200ms (p95) | APM monitoring |
| Request success rate | N/A | >99.9% | Error logs |
| Documentation coverage | 0% | 100% | OpenAPI schema |

---

## 2. User Stories

### Primary User: API Consumer
| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | create books via API | I can add books to the library | MUST |
| US-002 | developer | list all books | I can retrieve the catalog | MUST |
| US-003 | developer | search books by title | I can find specific books | SHOULD |
| US-004 | developer | filter books by author | I can browse by author | SHOULD |
| US-005 | developer | update book details | I can correct information | MUST |
| US-006 | developer | delete books | I can remove outdated entries | MUST |

---

## 3. Functional Requirements

### 3.1 Core Features
| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Book CRUD | Full CRUD operations for books | Given valid book data, When I POST/PUT/DELETE, Then operation succeeds |
| FR-002 | Author Management | Create and link authors to books | Given an author, When I create a book, Then I can link it |
| FR-003 | Search | Search books by title or author name | Given search query, When I GET /books?q=..., Then I get matching results |
| FR-004 | Pagination | Paginate large result sets | Given 100+ books, When I GET /books?page=2, Then I get page 2 results |
| FR-005 | Validation | Validate input data | Given invalid data, When I POST, Then I get 422 error with details |

---

## 4. Technical Specifications

### 4.1 Tech Stack
- **Framework**: FastAPI 0.104+
- **Database**: PostgreSQL 15
- **ORM**: SQLAlchemy 2.0
- **Validation**: Pydantic v2
- **Auth**: JWT (optional for MVP)

### 4.2 API Endpoints

```
GET    /api/v1/books          # List books (paginated)
POST   /api/v1/books          # Create book
GET    /api/v1/books/{id}     # Get book by ID
PUT    /api/v1/books/{id}     # Update book
DELETE /api/v1/books/{id}     # Delete book
GET    /api/v1/authors        # List authors
POST   /api/v1/authors        # Create author
GET    /api/v1/health         # Health check
GET    /docs                  # OpenAPI docs (Swagger UI)
```

### 4.3 Data Models

**Book**:
```python
{
  "id": "uuid",
  "title": "string (required, max 200)",
  "isbn": "string (optional, unique)",
  "author_id": "uuid (required)",
  "published_year": "integer (optional)",
  "pages": "integer (optional)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Author**:
```python
{
  "id": "uuid",
  "name": "string (required, max 100)",
  "bio": "string (optional)",
  "created_at": "datetime"
}
```

---

## 5. Implementation Plan

### Phase 1: MVP
- [ ] Database schema (books, authors tables)
- [ ] SQLAlchemy models
- [ ] FastAPI app structure
- [ ] Book CRUD endpoints
- [ ] Author CRUD endpoints
- [ ] Basic validation
- [ ] OpenAPI docs

### Phase 2: Enhancements
- [ ] Search functionality
- [ ] Pagination
- [ ] Filtering
- [ ] Error handling
- [ ] Logging

---

## 6. Security Requirements

- Input validation on all endpoints
- SQL injection prevention (SQLAlchemy ORM)
- Rate limiting (100 req/min per IP)
- CORS configuration
- Request size limits (10MB max)

---

## 7. Out of Scope

- User authentication (MVP: public API)
- File uploads (book covers)
- Advanced search (full-text search)
- Caching layer
- GraphQL endpoint

```

**Save to**: `genesis/book-library-api.md`

---

## Step 2: Use Copilot CLI Agents

### Install Framework
```bash
# From your project directory
~/DevLab/IDEA/claude_as/install.sh --platform=copilot
```

### Use Agents
```bash
# View available agents
ls .copilot/custom-agents/

# Use PRD agent to refine PRD
copilot task prd "Review and enhance book-library-api.md PRD"

# Use Architect agent for API design
copilot task architect "Design REST API structure for book library"

# Use Coder agent for implementation
copilot task coder "Implement book CRUD endpoints in FastAPI"

# Use Tester agent for tests
copilot task tester "Create tests for book API endpoints"

# Use Review agent for code review
copilot task review "Review book API implementation for security issues"
```

---

## Step 3: Generated Implementation

### Database Schema
```sql
-- migrations/001_create_authors.sql
CREATE TABLE authors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    bio TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- migrations/002_create_books.sql
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    isbn VARCHAR(20) UNIQUE,
    author_id UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    published_year INTEGER,
    pages INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_books_author_id ON books(author_id);
CREATE INDEX idx_books_title ON books(title);
```

### FastAPI Implementation
```python
# backend/src/models/book.py
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

class Book(Base):
    __tablename__ = "books"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    isbn = Column(String(20), unique=True, nullable=True)
    author_id = Column(UUID(as_uuid=True), ForeignKey("authors.id"), nullable=False)
    published_year = Column(Integer, nullable=True)
    pages = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    author = relationship("Author", back_populates="books")

# backend/src/schemas/book.py
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional

class BookCreate(BaseModel):
    title: str = Field(..., max_length=200)
    isbn: Optional[str] = Field(None, max_length=20)
    author_id: UUID
    published_year: Optional[int] = None
    pages: Optional[int] = None

class BookResponse(BaseModel):
    id: UUID
    title: str
    isbn: Optional[str]
    author_id: UUID
    published_year: Optional[int]
    pages: Optional[int]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# backend/src/api/routes/books.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

router = APIRouter(prefix="/api/v1/books", tags=["books"])

@router.post("", response_model=BookResponse, status_code=201)
def create_book(book: BookCreate, db: Session = Depends(get_db)):
    """Create a new book"""
    db_book = Book(**book.dict())
    db.add(db_book)
    db.commit()
    db.refresh(db_book)
    return db_book

@router.get("", response_model=List[BookResponse])
def list_books(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    q: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List books with optional search"""
    query = db.query(Book)
    if q:
        query = query.filter(Book.title.ilike(f"%{q}%"))
    return query.offset(skip).limit(limit).all()

@router.get("/{book_id}", response_model=BookResponse)
def get_book(book_id: UUID, db: Session = Depends(get_db)):
    """Get book by ID"""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book

@router.put("/{book_id}", response_model=BookResponse)
def update_book(book_id: UUID, book: BookCreate, db: Session = Depends(get_db)):
    """Update book"""
    db_book = db.query(Book).filter(Book.id == book_id).first()
    if not db_book:
        raise HTTPException(status_code=404, detail="Book not found")
    for key, value in book.dict().items():
        setattr(db_book, key, value)
    db_book.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_book)
    return db_book

@router.delete("/{book_id}", status_code=204)
def delete_book(book_id: UUID, db: Session = Depends(get_db)):
    """Delete book"""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    db.delete(book)
    db.commit()
    return None
```

---

## Step 4: Test the API

### Manual Testing
```bash
# Start server
cd backend
uvicorn main:app --reload

# Create author
curl -X POST http://localhost:8000/api/v1/authors \
  -H "Content-Type: application/json" \
  -d '{"name": "J.K. Rowling", "bio": "British author"}'

# Create book
curl -X POST http://localhost:8000/api/v1/books \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Harry Potter and the Philosopher'\''s Stone",
    "isbn": "978-0747532699",
    "author_id": "<author-id-from-above>",
    "published_year": 1997,
    "pages": 223
  }'

# List books
curl http://localhost:8000/api/v1/books

# Search books
curl "http://localhost:8000/api/v1/books?q=Harry"

# Get book by ID
curl http://localhost:8000/api/v1/books/<book-id>

# Update book
curl -X PUT http://localhost:8000/api/v1/books/<book-id> \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title", ...}'

# Delete book
curl -X DELETE http://localhost:8000/api/v1/books/<book-id>
```

### Automated Tests
```python
# tests/test_books.py
import pytest
from fastapi.testclient import TestClient
from uuid import uuid4

def test_create_book(client: TestClient):
    author_id = create_test_author(client)
    response = client.post("/api/v1/books", json={
        "title": "Test Book",
        "author_id": str(author_id),
        "published_year": 2024
    })
    assert response.status_code == 201
    assert response.json()["title"] == "Test Book"

def test_list_books(client: TestClient):
    response = client.get("/api/v1/books")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_get_book_not_found(client: TestClient):
    response = client.get(f"/api/v1/books/{uuid4()}")
    assert response.status_code == 404

# Run tests
pytest tests/test_books.py -v
```

---

## Step 5: View OpenAPI Documentation

FastAPI automatically generates OpenAPI docs:

```
http://localhost:8000/docs          # Swagger UI
http://localhost:8000/redoc         # ReDoc
http://localhost:8000/openapi.json   # OpenAPI JSON schema
```

---

## Common Issues & Solutions

### Issue 1: Database Connection Error
**Error**: `sqlalchemy.exc.OperationalError: could not connect to server`

**Solution**:
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Verify DATABASE_URL in .env
DATABASE_URL=postgresql://user:pass@localhost:5432/booklibrary
```

### Issue 2: Validation Errors
**Error**: `422 Unprocessable Entity`

**Solution**: Check request body matches Pydantic schema. Use `/docs` endpoint to see expected format.

### Issue 3: CORS Errors (if using frontend)
**Error**: `Access-Control-Allow-Origin` header missing

**Solution**:
```python
# main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Next Steps

1. **Add Authentication**: Implement JWT-based auth
2. **Add Caching**: Redis for frequently accessed books
3. **Add Rate Limiting**: Prevent abuse
4. **Add Logging**: Structured logging with correlation IDs
5. **Add Monitoring**: APM, health checks, metrics

---

## Key Takeaways

✅ **RESTful Design**: Follow REST conventions  
✅ **Validation**: Pydantic for request/response validation  
✅ **Documentation**: Auto-generated OpenAPI docs  
✅ **Testing**: Comprehensive test coverage  
✅ **Security**: Input validation, SQL injection prevention  
✅ **Error Handling**: Proper HTTP status codes  

---

**Full Example Code**: See `examples/book-library-api/` directory for complete implementation.
