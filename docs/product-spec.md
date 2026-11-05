# AI Job Application Copilot – Product Architecture & Development Specification

## 1. Project Overview

Build a modern AI-powered Job Application Copilot that helps users apply for jobs across different job portals with minimal manual effort.

The product consists of two major components:

1. **Web Application:** User registration, resume upload, intelligent resume parsing, profile creation, and profile management.
2. **Browser Extension:** A persistent browser side panel that detects job application forms, automatically fills available fields, and suggests answers for fields that cannot be automatically populated.

### Core Product Philosophy

The user should not have to manually create their profile or repeatedly enter the same information across different job portals.

The experience should be:

**Upload Resume → Extract Information → Create Profile → Detect Job → Autofill → Generate Answers → Review → Submit.**

The system must prioritize usability, accuracy, speed, and user control.

---

## 2. Technology Stack

Use the following technology stack unless a technical limitation requires a justified alternative.

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui |
| Browser Extension | Chrome Extension Manifest V3 |
| Extension Side Panel | Chrome Side Panel API |
| Backend | Python + FastAPI |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Migrations | Alembic |
| Cache | Redis |
| File Storage | S3-compatible storage / MinIO |
| PDF Extraction | PyMuPDF |
| OCR | PaddleOCR |
| AI Extraction | LLM with structured JSON output |
| AI Answer Generation | LLM API |
| Authentication | JWT / OAuth |
| API Communication | REST APIs |

Use modular architecture. Avoid tightly coupling the browser extension, frontend, and backend.

---

## 3. System Architecture

The application should have the following logical components.

### A. Web Application

Responsible for:

- User registration and authentication.
- Resume upload.
- Resume processing status.
- Extracted profile visualization.
- Profile editing.
- Multiple resume management.
- Account settings.
- Application history.

### B. Resume Intelligence Engine

Responsible for:

- PDF and image processing.
- Document type detection.
- Text extraction.
- OCR for scanned documents.
- Semantic information extraction.
- Information normalization.
- Structured profile generation.
- Confidence scoring.
- Duplicate detection.

### C. Backend API

Responsible for:

- Authentication.
- User profile management.
- Resume processing orchestration.
- Browser extension communication.
- AI answer generation.
- Application history.
- Database operations.

### D. Browser Extension

Responsible for:

- User authentication.
- Profile synchronization.
- Job application page detection.
- Form field identification.
- Field-to-profile mapping.
- Autofill operations.
- AI answer suggestions.
- Copy and insert functionality.
- Application progress tracking.

### E. AI Answer Engine

Responsible for:

- Understanding job descriptions.
- Understanding application questions.
- Retrieving relevant information from the user's profile.
- Generating personalized answers.
- Producing editable responses.
- Avoiding fabricated user experience or qualifications.

---

## 4. Resume Upload and Intelligent Profile Creation

This is the first major feature to implement.

### 4.1 Resume Upload Interface

Create a clean onboarding experience.

The user should be able to:

- Drag and drop a resume.
- Browse and upload files.
- Upload PDF, DOC, DOCX, PNG, and JPG.
- See upload progress.
- See processing status.
- Replace the uploaded resume.
- Preview the uploaded document.

Do not force users to fill in profile forms during registration.

### 4.2 Document Processing Pipeline

Implement a hybrid document extraction pipeline.

#### Step 1: Document Validation

- Validate file extension and MIME type.
- Validate file size.
- Check whether the document is readable.
- Reject corrupted files.
- Scan uploaded files for malicious content.

#### Step 2: Document Classification

Determine whether the document is:

- Text-based PDF.
- Scanned PDF.
- Image-based resume.
- DOC/DOCX document.

#### Step 3: Text Extraction

For text-based documents:
- Use PyMuPDF.
- Extract text while preserving reading order.
- Capture page information.

For scanned documents:
- Convert PDF pages into images.
- Run PaddleOCR.
- Extract text and bounding boxes where useful.
- Preserve page ordering.

For DOC/DOCX:
- Extract paragraphs and tables.
- Preserve section relationships.

#### Step 4: Semantic Information Extraction

Pass the extracted text to an LLM.

The model should understand the meaning and context of the resume rather than relying only on keywords.

Extract the following information:

**Personal Information**
- First name.
- Last name.
- Full name.
- Email.
- Phone number.
- Location.
- LinkedIn URL.
- GitHub URL.
- Portfolio URL.

**Professional Summary**
- Current designation.
- Total years of experience.
- Professional summary.
- Current employment status.

**Work Experience**
- Company name.
- Job designation.
- Employment type.
- Start date.
- End date.
- Responsibilities.
- Achievements.
- Technologies used.

**Education**
- Degree.
- Institution.
- Specialization.
- Graduation year.
- Grade / CGPA.

**Skills**
- Programming languages.
- Frameworks.
- Databases.
- Cloud technologies.
- AI/ML technologies.
- Tools.
- Soft skills.

**Projects**
- Project name.
- Description.
- Technologies used.
- Role.
- Outcomes.

**Certifications**
- Certification name.
- Issuing organization.
- Issue date.
- Credential URL.

#### Step 5: Structured JSON Output

The extraction engine must return validated structured JSON.

Example:

```json
{
  "personal_information": {
    "full_name": "",
    "first_name": "",
    "last_name": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "github": ""
  },
  "professional_summary": {
    "current_designation": "",
    "total_experience_years": null,
    "summary": ""
  },
  "experience": [],
  "education": [],
  "skills": [],
  "projects": [],
  "certifications": []
}
```

Requirements:

- Never invent missing information.
- Return null for unavailable fields.
- Preserve original information.
- Normalize dates and phone numbers.
- Validate email and URL formats.
- Maintain extraction confidence scores.
- Store source document references where practical.

#### Step 6: Profile Review

After extraction, show the user a structured profile.

Users should be able to:

- Edit individual fields.
- Add missing information.
- Delete incorrect information.
- Confirm extracted details.
- Save the profile.

Do not automatically treat uncertain OCR results as confirmed information.

---

## 5. User Profile Management

Create a centralized profile system.

The profile should be reusable across different job portals.

Recommended profile sections:

1. Personal Information.
2. Contact Information.
3. Professional Summary.
4. Work Experience.
5. Education.
6. Skills.
7. Projects.
8. Certifications.
9. Social Links.
10. Additional Application Information.

Allow users to edit their profiles even after the initial resume upload.

Support multiple resumes in the future, with one primary profile and optional job-specific resume versions.

---

## 6. Browser Extension Architecture

The browser extension is the main product experience.

Use Chrome Extension Manifest V3.

### 6.1 Extension Components

Implement the following components:

- Background Service Worker.
- Content Scripts.
- Side Panel UI.
- Extension Authentication Manager.
- Profile Synchronization Service.
- Job Detection Engine.
- Form Detection Engine.
- Field Mapping Engine.
- Autofill Engine.
- AI Answer Suggestion Engine.

### Component Responsibilities

**Background Service Worker**
- Manage extension lifecycle.
- Handle authentication state.
- Communicate with the backend.
- Coordinate extension events.
- Manage tab-related events.

**Content Scripts**
- Inspect the active webpage DOM.
- Identify job application forms.
- Detect input fields.
- Extract labels and field attributes.
- Execute approved autofill actions.
- Monitor dynamic form changes.

**Side Panel**
- Display detected job information.
- Display autofill suggestions.
- Display AI-generated answers.
- Allow copying and inserting answers.
- Display application progress.

**Communication**

Use secure message passing between the side panel, content scripts, and background service worker.

Avoid direct coupling between UI components and DOM manipulation logic.

---

## 7. Persistent Side Panel UI/UX

The side panel should open after the user logs into the extension and remain accessible while browsing.

Create a premium, modern, professional UI.

Design inspiration:
- Linear.
- Raycast.
- Modern AI SaaS products.

Use a clean layout, consistent typography, compact cards, clear status indicators, and intuitive interactions.

### 7.1 Side Panel Structure

#### Header

Display:
- Product logo.
- User profile avatar.
- Connection status.
- Settings icon.

#### Job Detection Section

When a job application page is detected, display:

- Company name.
- Job title.
- Job portal.
- Application page URL.
- Detection status.

#### Application Readiness

Display a summary:

- Profile information: Complete / Incomplete.
- Contact information: Complete / Incomplete.
- Experience: Available / Missing.
- Resume: Available / Missing.
- Additional questions: Pending.

#### Smart Autofill Section

Display:
- Number of detected fields.
- Number of mapped fields.
- Number of fields requiring attention.
- Autofill All button.

Allow users to review mappings before filling.

#### AI Answer Suggestions

For fields that cannot be populated through direct profile mapping, show:

- Application question.
- Suggested answer.
- Copy button.
- Insert button.
- Regenerate button.
- Edit answer option.

#### Application Progress

Display:

- Fields completed.
- Fields remaining.
- Fields requiring manual attention.
- Overall completion percentage.

#### Empty State

When no job application is detected, show:

- A welcome message.
- A short explanation of the extension.
- Profile completion status.
- Instructions to navigate to a job application page.

Do not display irrelevant or empty sections.

---

## 8. Job Application Detection Engine

The extension should identify whether the active browser page contains a job application.

Initially support common job application patterns across:

- Greenhouse.
- Lever.
- Workday.
- Ashby.
- LinkedIn job application pages.
- Generic career pages.

Do not hardcode the entire system to individual job portals.

Implement a generic detection engine with portal-specific adapters where required.

Detection signals may include:

- Form structures.
- Input labels.
- Field names.
- ARIA labels.
- Placeholder text.
- Page metadata.
- Application-related URL patterns.
- Job description content.

When a job application is detected, notify the side panel and initialize form analysis.

---

## 9. Smart Form Detection and Field Mapping

This is one of the most important technical components.

The system must identify form fields even when the underlying websites use different HTML structures.

Inspect:

- Input elements.
- Textareas.
- Select elements.
- Radio buttons.
- Checkboxes.
- Custom dropdowns.
- File upload fields.
- Contenteditable fields.

Extract field metadata:

- Label.
- Placeholder.
- Name attribute.
- ID.
- Input type.
- Required status.
- ARIA attributes.
- Associated help text.
- Current value.

### 9.1 Semantic Field Mapping

Map detected fields to the user's structured profile.

Examples:

| Detected Field | Profile Mapping |
|---|---|
| First Name | personal_information.first_name |
| Last Name | personal_information.last_name |
| Email Address | personal_information.email |
| Phone Number | personal_information.phone |
| Current Employer | experience |
| Current Position | experience |
| Total Experience | professional_summary.total_experience_years |
| Skills | skills |
| LinkedIn Profile | personal_information.linkedin |
| Degree | education |
| University | education |

Implement confidence-based mapping.

Suggested mapping logic:

- High confidence: Automatically map.
- Medium confidence: Show suggested mapping for review.
- Low confidence: Ask the user or generate a contextual answer.

Never populate a field using an uncertain mapping without user visibility.

---

## 10. Autofill Engine

Implement a reusable autofill engine.

Requirements:

- Automatically fill supported fields.
- Handle dynamically rendered forms.
- Handle multi-step applications.
- Handle React-controlled form inputs.
- Trigger appropriate input and change events.
- Handle dropdowns and custom controls where supported.
- Detect fields that are already populated.
- Avoid overwriting user-entered information without permission.
- Support scrollable application pages.
- Re-scan forms when new fields appear.

The extension should not assume that all form fields are standard HTML inputs.

Implement reliable DOM interaction with appropriate event handling.

### Autofill User Experience

The user should have two options:

1. Autofill All.
2. Review and Fill.

After autofilling, show a completion summary.

Do not automatically submit applications.

The user must always retain control over the final submission.

---

## 11. AI Answer Suggestion Engine

Some application questions cannot be answered through direct field mapping.

Build a separate AI answer generation module.

Examples:

- Why are you interested in this position?
- Describe your previous experience.
- Why should we hire you?
- What are your strengths?
- Describe a challenging project.
- What are your career goals?
- Why are you leaving your current organization?

### 11.1 Answer Generation Workflow

1. Detect the application question.
2. Retrieve relevant user profile information.
3. Retrieve the job description if available.
4. Identify the question's intent.
5. Generate a contextual answer.
6. Validate the answer against the user's actual profile.
7. Display the suggested answer in the side panel.

### Answer UI

Each suggested answer should provide:

- Generated response.
- Copy to clipboard.
- Insert into form.
- Regenerate.
- Edit manually.

### AI Guardrails

- Do not fabricate professional experience.
- Do not invent qualifications.
- Do not generate fake achievements.
- Use only verified profile information.
- Clearly indicate when information is missing.
- Keep responses relevant to the question.
- Allow users to customize answer length and tone.

---

## 12. Application Tracking

Create an application history module.

Track:

- Company name.
- Job title.
- Application URL.
- Job description, when available.
- Application date.
- Resume version used.
- Application status.
- Last updated timestamp.

Suggested statuses:

- Detected.
- In Progress.
- Ready to Submit.
- Submitted.
- Rejected.
- Interview.
- Offer.

Initially, users should be able to manually update application status.

Do not claim an application was submitted unless the user or a reliable supported signal confirms it.

---

## 13. Database Architecture

Use PostgreSQL.

Recommended entities:

### users
- id
- email
- password_hash
- created_at
- updated_at

### user_profiles
- id
- user_id
- personal_information (JSONB)
- professional_summary (JSONB)
- skills (JSONB)
- created_at
- updated_at

### resumes
- id
- user_id
- file_name
- storage_path
- file_type
- extraction_status
- extracted_text
- extracted_data (JSONB)
- created_at

### work_experience
- id
- profile_id
- company_name
- designation
- start_date
- end_date
- responsibilities

### education
- id
- profile_id
- degree
- institution
- specialization
- graduation_year

### projects
- id
- profile_id
- project_name
- description
- technologies

### certifications
- id
- profile_id
- certification_name
- issuing_organization
- issue_date

### applications
- id
- user_id
- company_name
- job_title
- job_url
- job_description
- resume_id
- application_status
- applied_at
- created_at

### generated_answers
- id
- user_id
- application_id
- question
- generated_answer
- source_profile_data
- created_at

Use relational tables for entities requiring independent querying and JSONB for flexible profile data.

Implement appropriate foreign keys, indexes, validation, and user-level data isolation.

---

## 14. API Architecture

Use FastAPI with versioned REST endpoints.

Suggested endpoints:

### Authentication

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

### Resume

- `POST /api/v1/resumes/upload`
- `GET /api/v1/resumes`
- `GET /api/v1/resumes/{resume_id}`
- `GET /api/v1/resumes/{resume_id}/status`
- `POST /api/v1/resumes/{resume_id}/process`
- `DELETE /api/v1/resumes/{resume_id}`

### Profile

- `GET /api/v1/profile`
- `PUT /api/v1/profile`
- `PATCH /api/v1/profile`
- `GET /api/v1/profile/completion`

### Job Application

- `POST /api/v1/applications`
- `GET /api/v1/applications`
- `GET /api/v1/applications/{application_id}`
- `PATCH /api/v1/applications/{application_id}`

### AI Answers

- `POST /api/v1/answers/generate`
- `POST /api/v1/answers/regenerate`
- `GET /api/v1/answers/{answer_id}`

### Extension

- `GET /api/v1/extension/profile`
- `POST /api/v1/extension/sync`
- `POST /api/v1/extension/detect-job`
- `POST /api/v1/extension/map-fields`
- `POST /api/v1/extension/generate-answer`

All endpoints must include proper authentication, authorization, validation, and error handling.

---

## 15. Security and Privacy

The application will process sensitive personal and professional information.

Implement:

- Secure authentication.
- HTTPS communication.
- Password hashing.
- Short-lived access tokens and secure refresh-token handling.
- Secure file storage.
- File access authorization.
- User-level database isolation.
- Input validation.
- Rate limiting.
- Upload size restrictions.
- Protection against malicious documents.
- Safe DOM interaction.
- Secure extension message validation.

Do not expose API keys or backend credentials in browser extension code.

Request only the browser permissions required for the functionality.

Clearly communicate how resumes and profile information are stored and processed.

---

## 16. Error Handling and Edge Cases

The system must handle:

- Corrupted PDFs.
- Password-protected PDFs.
- Large resumes.
- Multiple-column layouts.
- Scanned resumes.
- Low-quality images.
- Missing personal information.
- Incorrect OCR results.
- Duplicate profile information.
- Unsupported job portals.
- Dynamically loaded forms.
- Multi-step applications.
- Custom dropdowns.
- Unexpected field structures.
- Network interruptions.
- Expired authentication sessions.

Every failure should provide a meaningful message and a recovery option.

---

## 17. Development Roadmap

Build the application incrementally.

### Phase 1 – Resume Intelligence

Deliverables:

- Authentication.
- Resume upload.
- PDF/DOC/DOCX/image processing.
- OCR integration.
- Semantic information extraction.
- Structured profile generation.
- Profile review and editing.
- PostgreSQL persistence.

Acceptance criteria:

A user can upload a scanned or text-based resume and obtain an editable, structured profile without manually filling in the entire form.

### Phase 2 – Browser Extension Foundation

Deliverables:

- Chrome Extension Manifest V3.
- Authentication integration.
- Persistent side panel.
- Profile synchronization.
- Content script communication.
- Basic job application detection.

Acceptance criteria:

An authenticated user can open the side panel while browsing and see their profile and detected job application information.

### Phase 3 – Smart Autofill

Deliverables:

- Generic form detection.
- Semantic field mapping.
- Confidence scoring.
- Autofill functionality.
- Dynamic form monitoring.
- Scrollable page support.
- Multi-step form support.

Acceptance criteria:

The extension can identify and populate common application fields on supported job portals and generic career pages.

### Phase 4 – AI Answer Generation

Deliverables:

- Application question detection.
- Resume-based retrieval.
- Job description context.
- AI-generated answers.
- Copy and insert functionality.
- Editing and regeneration.

Acceptance criteria:

The user can obtain contextual answers for non-standard application questions without manually composing every response.

### Phase 5 – Application Tracker

Deliverables:

- Application history.
- Company and job information.
- Application status.
- Resume version tracking.
- Basic analytics.

---

## 18. Engineering Guidelines

Follow these rules throughout implementation.

1. Use modular, maintainable code.
2. Keep frontend and backend responsibilities separate.
3. Use TypeScript types and Pydantic schemas.
4. Avoid unnecessary abstractions.
5. Do not put business logic inside UI components.
6. Create reusable React components.
7. Create reusable browser DOM interaction utilities.
8. Maintain clear API contracts.
9. Implement centralized error handling.
10. Add logging for resume processing and autofill operations.
11. Write unit tests for extraction, mapping, and autofill.
12. Add integration tests for the complete onboarding flow.
13. Avoid hardcoding job portal-specific logic into the core engine.
14. Make AI models configurable through environment variables.
15. Keep all secrets outside the source code.

---

## 19. Expected Deliverables

Before considering the initial implementation complete, provide:

1. Complete system architecture.
2. Architecture diagram.
3. Database schema.
4. Backend project structure.
5. Frontend project structure.
6. Browser extension project structure.
7. API documentation.
8. Resume processing pipeline.
9. Form detection and mapping engine.
10. Side panel UI.
11. AI answer generation module.
12. Environment configuration.
13. Local development instructions.
14. Testing documentation.

---

## 20. Instructions to the AI Development Agent

Act as a Senior Full-Stack Architect and AI Engineer.

Do not immediately generate the entire application in one large implementation.

First:

1. Analyze the requirements.
2. Propose the final architecture.
3. Identify technical dependencies.
4. Define the database schema.
5. Define component boundaries.
6. Create the project folder structure.
7. Identify implementation risks.
8. Establish the development milestones.

Then implement the application phase by phase.

For every phase:

- Explain the implementation approach.
- Create the required files.
- Implement working functionality.
- Test the implementation.
- Fix errors before moving forward.
- Document completed features.

Do not create placeholder functionality and claim it is implemented.

Prioritize a working end-to-end MVP over unnecessary complexity.

### Final Product Objective

A user uploads their resume once. The system intelligently creates their professional profile. When they visit any supported job application page, the browser side panel identifies the application, automatically fills available fields, generates answers for additional questions, and helps the user complete the application with minimal manual effort.

The user should feel that they have a personal AI assistant helping them apply for jobs, rather than another complicated form-filling tool.
