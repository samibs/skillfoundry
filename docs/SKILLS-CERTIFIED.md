# Certified Skills Registry

This document lists all certified skills within the SkillFoundry framework. Certified skills follow strict contracts and have been validated for accuracy and safety.

---

## Technical Skills

### Normalize Tags to Slugs
**ID**: `4ea22534-548d-49c8-8ced-cde11ca0ad4c`  
**Version**: `1.0.0`  
**Risk Level**: Low

#### Description
Convert a list of plain text tags into a normalized lowercase slug array, trimming whitespace.

#### Contract
- **Input**: `tags` (Array of strings)
- **Output**: 
  - `result` (Array of normalized lowercase slug strings)
  - `confidence` (Transformation accuracy score, 0-1)

#### Scope
- Convert plain text tags to lowercase slug format
- Trim leading and trailing whitespace from each tag
- Replace internal spaces and special characters with hyphens
- Return a normalized array of slug strings
- Handle arrays of mixed-case or inconsistently formatted tags

#### Out of Scope
- Translating tags between different human languages
- Inferring or generating new tags not present in the input
- Validating whether tags are semantically meaningful or relevant
- Deduplicating tags based on semantic similarity
- Storing or persisting the resulting slugs to any system

#### Guardrails
- **Hallucination Policy**: Slug output must be derived deterministically from input text only.
- **Unknown Handling**: Unsupported characters return a structured error entry.
- **Source Grounding**: All transformations grounded exclusively in input tag list.
- **Scope Enforcement**: Only perform tag-to-slug normalization.
- **Audit Trail**: Transformation batch logging required.
- **Version Contract**: Ruleset must be versioned.

#### Certification
- **Certified**: Yes
- **Certified At**: 2026-06-07T07:55:39.671Z
- **Test Score**: 0.9
- **Guardrails Validated**: Yes
